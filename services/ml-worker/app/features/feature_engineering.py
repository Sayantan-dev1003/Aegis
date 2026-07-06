from __future__ import annotations

import numpy as np
import pandas as pd

from app.inference.artifact_loader import RuntimeArtifacts
from app.runtime.state_store import StateStore
from app.monitoring.logger import get_logger
from app.monitoring.metrics import ml_unknown_lookup_total

logger = get_logger(__name__)

# Email providers considered "common" — mirrors training logic exactly.
_COMMON_EMAIL_PROVIDERS = frozenset(["gmail", "yahoo", "hotmail", "aol", "outlook", "icloud"])

# id_* columns that were present in training; used for HasIdentity flag.
# Any id_XX column in the payload counts.
_NIGHT_HOURS = frozenset(range(0, 7))  # hours 0-6 inclusive


class FeatureEngineer:
    """
    Generates all deterministic engineered features at runtime, mirroring the
    training pipeline (training/feature_engineering.py) exactly.

    Feature groups
    --------------
    1. Transaction features   — log/sqrt/rounded/is-zero on TransactionAmt
    2. Time features          — ElapsedDays/Weeks, Hour, Weekday, cyclical encodings
    3. Amount features        — Amount_Percentile (searchsorted), vs-mean ratios
    4. Identity features      — device/identity missing flags, OS/Browser/Screen extraction
    5. Device features        — frequency lookups + KnownDevice + DeviceFrequency
    6. Email features         — missing flag, recipient flag, SameEmailDomain, provider freq
    7. Aggregation features   — per-card/addr/ProductCD/DeviceType stat lookups
    8. Velocity features      — Redis-backed Transaction_Per_Card etc.
    """

    def __init__(self, artifacts: RuntimeArtifacts, state_store: StateStore) -> None:
        preprocessing = artifacts.preprocessing
        self.aggregation_mappings = preprocessing.get("aggregation_mappings", {})
        self.frequency_mappings = preprocessing.get("frequency_mappings", {})

        # percentile_mapping is a sorted list/tuple of training TransactionAmt values.
        # Use np.searchsorted at runtime to reproduce the training rank-pct calculation.
        raw_percentile = preprocessing.get("percentile_mapping", [])
        self._percentile_arr: np.ndarray = np.array(raw_percentile, dtype=np.float64)

        self.state_store = state_store

    # ──────────────────────────────────────────────────────────────────────────
    # Internal helpers
    # ──────────────────────────────────────────────────────────────────────────

    def _safe_lookup(self, mapping: Any, key: Any) -> float:
        """Looks up key in mapping, returns NaN and increments counter on miss."""
        val = mapping.get(key, np.nan)
        if isinstance(val, float) and np.isnan(val):
            ml_unknown_lookup_total.inc()
        return val

    @staticmethod
    def _resolve_numeric_key(raw_key: Any) -> Any:
        """
        Converts a runtime key to match the dict-key type used in training.

        Training groupby() on an int-typed column (e.g. card1 downcasted to
        int16 by optimize_dtypes) stores dict keys as numpy integer scalars.
        At runtime, after ColumnTransformer imputation the same column is
        float64 (e.g. 17995.0).  str(17995.0) = '17995.0' which does NOT
        match np.int16(17995).

        This method converts whole-number floats to Python int so that:
            hash(np.int16(17995)) == hash(17995) == hash(int(17995.0))
        and the dict.get() succeeds.

        String keys (ProductCD='W', DeviceType='mobile') are returned as-is.
        NaN is returned as-is (will cause a cache miss and NaN fallback).
        """
        if raw_key is None or (isinstance(raw_key, float) and np.isnan(raw_key)):
            return raw_key
        try:
            fval = float(raw_key)
            if fval == int(fval):          # whole-number float → int
                return int(fval)
        except (TypeError, ValueError):
            pass
        return raw_key

    def _amount_percentile(self, amt: float) -> float:
        """Computes Amount_Percentile via np.searchsorted — identical to training."""
        if pd.isna(amt) or len(self._percentile_arr) == 0:
            ml_unknown_lookup_total.inc()
            return np.nan
        return float(np.searchsorted(self._percentile_arr, amt) / len(self._percentile_arr))

    # ──────────────────────────────────────────────────────────────────────────
    # Public entry point
    # ──────────────────────────────────────────────────────────────────────────

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Applies all engineered features to *df* (a single-row DataFrame after imputation).
        Returns a new DataFrame with all new columns appended.
        """
        if df.empty:
            return df

        out = df.copy()
        row = out.iloc[0]

        self._add_transaction_features(out, row)
        self._add_time_features(out, row)
        self._add_amount_features(out, row)
        self._add_identity_features(out, row)
        self._add_device_features(out, row)
        self._add_email_features(out, row)
        self._add_aggregation_features(out, row)
        self._add_velocity_features(out, row)

        return out

    # ──────────────────────────────────────────────────────────────────────────
    # Group 1 — Transaction features
    # ──────────────────────────────────────────────────────────────────────────

    def _add_transaction_features(self, out: pd.DataFrame, row: pd.Series) -> None:
        amt_raw = row.get("TransactionAmt", np.nan)
        try:
            amt = float(amt_raw)
        except (TypeError, ValueError):
            amt = np.nan

        amt_valid = pd.notna(amt) and amt >= 0

        out["TransactionAmt_Log"] = np.log1p(amt) if amt_valid else np.nan
        out["TransactionAmt_Sqrt"] = np.sqrt(amt) if amt_valid else np.nan
        out["TransactionAmt_IsZero"] = int(amt == 0) if amt_valid else np.nan
        # Use np.round() to preserve float64 dtype — matches training's np.round(amt)
        out["TransactionAmt_Rounded"] = float(np.round(amt)) if pd.notna(amt) else np.nan

        # TransactionAmt_Bucket: training uses pd.qcut over the batch — cannot reproduce
        # at runtime for a single transaction.  Insert NaN; XGBoost handles it natively.
        out["TransactionAmt_Bucket"] = np.nan

    # ──────────────────────────────────────────────────────────────────────────
    # Group 2 — Time features
    # ──────────────────────────────────────────────────────────────────────────

    def _add_time_features(self, out: pd.DataFrame, row: pd.Series) -> None:
        ts_raw = row.get("TransactionDT", np.nan)
        try:
            ts = float(ts_raw)
        except (TypeError, ValueError):
            ts = np.nan

        if pd.isna(ts):
            for col in [
                "ElapsedDays", "ElapsedWeeks", "Hour", "Weekday", "Weekend",
                "IsNight", "Hour_Sin", "Hour_Cos", "Weekday_Sin", "Weekday_Cos",
            ]:
                out[col] = np.nan
            return

        elapsed_days = int(np.floor(ts / 86400))
        elapsed_weeks = int(np.floor(ts / 604800))
        hour = int(np.floor((ts / 3600) % 24))
        weekday = int(np.floor(elapsed_days % 7))
        weekend = int(weekday >= 5)
        is_night = int(hour in _NIGHT_HOURS)

        out["ElapsedDays"] = elapsed_days
        out["ElapsedWeeks"] = elapsed_weeks
        out["Hour"] = hour
        out["Weekday"] = weekday
        out["Weekend"] = weekend
        out["IsNight"] = is_night
        out["Hour_Sin"] = np.sin(2 * np.pi * hour / 24)
        out["Hour_Cos"] = np.cos(2 * np.pi * hour / 24)
        out["Weekday_Sin"] = np.sin(2 * np.pi * weekday / 7)
        out["Weekday_Cos"] = np.cos(2 * np.pi * weekday / 7)

    # ──────────────────────────────────────────────────────────────────────────
    # Group 3 — Amount features
    # ──────────────────────────────────────────────────────────────────────────

    def _add_amount_features(self, out: pd.DataFrame, row: pd.Series) -> None:
        amt_raw = row.get("TransactionAmt", np.nan)
        try:
            amt = float(amt_raw)
        except (TypeError, ValueError):
            amt = np.nan

        # Amount_Rank: batch-global rank — cannot reproduce for a single row.
        out["Amount_Rank"] = np.nan

        # Amount_Percentile via searchsorted (identical to training)
        out["Amount_Percentile"] = self._amount_percentile(amt)

        # TransactionAmt_vs_{col}_Mean = amt / (group_mean + 1e-9)
        # _resolve_numeric_key converts float64 keys (e.g. 17995.0) to int
        # to match training's int-typed groupby dict keys.
        for col in ["card1", "addr1", "ProductCD"]:
            key = self._resolve_numeric_key(row.get(col))
            mean_map = self.aggregation_mappings.get(col, {}).get("mean", {})
            mean_val = self._safe_lookup(mean_map, key)
            if pd.notna(amt) and pd.notna(mean_val):
                ratio = float(amt) / (float(mean_val) + 1e-9)
            else:
                ratio = np.nan
            out[f"TransactionAmt_vs_{col}_Mean"] = ratio

    # ──────────────────────────────────────────────────────────────────────────
    # Group 4 — Identity / device flags
    # ──────────────────────────────────────────────────────────────────────────

    def _add_identity_features(self, out: pd.DataFrame, row: pd.Series) -> None:
        # DeviceInfo flags
        device_info_raw = row.get("DeviceInfo", None)
        device_info_missing = pd.isna(device_info_raw) or device_info_raw is None
        out["DeviceInfo_Missing_Flag"] = int(device_info_missing)
        out["HasDeviceInfo"] = int(not device_info_missing)
        # DeviceInfo_Length: training does DeviceInfo.astype(str).str.len()
        # When DeviceInfo is NaN, astype(str) produces "nan" (length 3).
        # We must replicate this: str(np.nan) = "nan", str(None) = "None".
        # After Cleaner, missing values are np.nan, so str() gives "nan" → len 3.
        device_info_str = str(device_info_raw) if not device_info_missing else ""
        out["DeviceInfo_Length"] = len(str(device_info_raw))  # always str(); NaN → "nan" → 3

        # DeviceType flag
        device_type_raw = row.get("DeviceType", None)
        out["HasDeviceType"] = int(not (pd.isna(device_type_raw) or device_type_raw is None))

        # HasIdentity — True if any id_XX column in the row is not null
        id_cols_present = [k for k in row.index if str(k).startswith("id_")]
        if id_cols_present:
            has_id = int(any(not (pd.isna(row[c]) or row[c] is None) for c in id_cols_present))
        else:
            has_id = 0
        out["HasIdentity"] = has_id

        # OS_Type from id_30 (e.g. "Android 7.0" → "Android")
        id_30 = row.get("id_30", None)
        if pd.notna(id_30) and id_30 is not None:
            out["OS_Type"] = str(id_30).split(" ")[0]
        else:
            out["OS_Type"] = np.nan

        # Browser_Type from id_31 (e.g. "chrome 65.0" → "chrome")
        id_31 = row.get("id_31", None)
        if pd.notna(id_31) and id_31 is not None:
            out["Browser_Type"] = str(id_31).split(" ")[0]
        else:
            out["Browser_Type"] = np.nan

        # Screen_Category from id_33 (e.g. "1920x1080" → "1920")
        id_33 = row.get("id_33", None)
        if pd.notna(id_33) and id_33 is not None:
            out["Screen_Category"] = str(id_33).split("x")[0]
        else:
            out["Screen_Category"] = np.nan

    # ──────────────────────────────────────────────────────────────────────────
    # Group 5 — Device frequency features
    # ──────────────────────────────────────────────────────────────────────────

    def _add_device_features(self, out: pd.DataFrame, row: pd.Series) -> None:
        device_info_raw = row.get("DeviceInfo", None)
        device_type_raw = row.get("DeviceType", None)

        device_info_str = (
            str(device_info_raw)
            if not (pd.isna(device_info_raw) or device_info_raw is None)
            else ""
        )
        device_type_str = (
            str(device_type_raw)
            if not (pd.isna(device_type_raw) or device_type_raw is None)
            else ""
        )

        # DeviceInfoFrequency
        di_freq_map = self.frequency_mappings.get("DeviceInfo", {})
        di_freq = self._safe_lookup(di_freq_map, device_info_str)
        out["DeviceInfoFrequency"] = di_freq

        # KnownDevice
        known = int(pd.notna(di_freq) and float(di_freq) > 1) if pd.notna(di_freq) else 0
        out["KnownDevice"] = known

        # DeviceTypeFrequency
        dt_freq_map = self.frequency_mappings.get("DeviceType", {})
        out["DeviceTypeFrequency"] = self._safe_lookup(dt_freq_map, device_type_str)

        # DeviceFrequency — combined DeviceType_DeviceInfo key
        combined_map = self.frequency_mappings.get("DeviceCombined", {})
        combined_key = (
            (device_type_str if device_type_str else "unknown")
            + "_"
            + (device_info_str if device_info_str else "unknown")
        )
        if combined_map:
            out["DeviceFrequency"] = self._safe_lookup(combined_map, combined_key)
        elif device_info_str:
            out["DeviceFrequency"] = di_freq
        else:
            out["DeviceFrequency"] = self._safe_lookup(dt_freq_map, device_type_str)

    # ──────────────────────────────────────────────────────────────────────────
    # Group 6 — Email features
    # ──────────────────────────────────────────────────────────────────────────

    def _add_email_features(self, out: pd.DataFrame, row: pd.Series) -> None:
        p_email = row.get("P_emaildomain", None)
        r_email = row.get("R_emaildomain", None)

        p_missing = pd.isna(p_email) or p_email is None
        r_missing = pd.isna(r_email) or r_email is None

        out["Email_Missing_Flag"] = int(p_missing)
        out["HasRecipientEmail"] = int(not r_missing)

        # SameEmailDomain
        if not p_missing and not r_missing:
            out["SameEmailDomain"] = int(str(p_email) == str(r_email))
        else:
            out["SameEmailDomain"] = 0

        # EmailProvider = first segment before "."
        if not p_missing:
            p_email_str = str(p_email)
            dot_idx = p_email_str.find(".")
            provider = p_email_str[:dot_idx] if dot_idx != -1 else p_email_str
        else:
            provider = None

        out["EmailProvider"] = provider if provider else np.nan

        # EmailProviderFrequency — keyed by EmailProvider (first segment), not full domain
        ep_freq_map = self.frequency_mappings.get("EmailProvider", {})
        if provider:
            out["EmailProviderFrequency"] = self._safe_lookup(ep_freq_map, provider)
        else:
            out["EmailProviderFrequency"] = np.nan
            ml_unknown_lookup_total.inc()

        # CommonProvider
        out["CommonProvider"] = int(provider in _COMMON_EMAIL_PROVIDERS) if provider else 0

    # ──────────────────────────────────────────────────────────────────────────
    # Group 7 — Aggregation features
    # ──────────────────────────────────────────────────────────────────────────

    def _add_aggregation_features(self, out: pd.DataFrame, row: pd.Series) -> None:
        """
        For each fitted aggregation column, emit:
          {col}_Mean_TransactionAmt, _Median_, _Count_, _Std_, _Max_, _Min_, _Unique_Merchant_Count

        Key type note
        -------------
        Training calls df.groupby(col)[...].to_dict() on columns that have been
        integer-downcasted (int16/int32 by optimize_dtypes).  The resulting dict
        keys are numpy integer scalars (e.g. np.int16(17995)).

        At runtime, post-imputation card values are float64 (17995.0).  Using
        str() would yield '17995.0' which does not match the numpy int key.
        _resolve_numeric_key() converts whole-number floats to Python int so
        that the hash/equality comparison succeeds.
        """
        for col, stat_maps in self.aggregation_mappings.items():
            key = self._resolve_numeric_key(row.get(col))

            out[f"{col}_Mean_TransactionAmt"] = self._safe_lookup(
                stat_maps.get("mean", {}), key
            )
            out[f"{col}_Median_TransactionAmt"] = self._safe_lookup(
                stat_maps.get("median", {}), key
            )
            out[f"{col}_Count_Transaction"] = self._safe_lookup(
                stat_maps.get("count", {}), key
            )
            out[f"{col}_Std_TransactionAmt"] = self._safe_lookup(
                stat_maps.get("std", {}), key
            )
            out[f"{col}_Max_TransactionAmt"] = self._safe_lookup(
                stat_maps.get("max", {}), key
            )
            out[f"{col}_Min_TransactionAmt"] = self._safe_lookup(
                stat_maps.get("min", {}), key
            )
            if "unique_merchant" in stat_maps:
                out[f"{col}_Unique_Merchant_Count"] = self._safe_lookup(
                    stat_maps["unique_merchant"], key
                )

    # ──────────────────────────────────────────────────────────────────────────
    # Group 8 — Velocity features (Redis-backed)
    # ──────────────────────────────────────────────────────────────────────────

    def _add_velocity_features(self, out: pd.DataFrame, row: pd.Series) -> None:
        card1 = str(row.get("card1", ""))
        device_info_raw = row.get("DeviceInfo", None)
        device_info_str = (
            str(device_info_raw)
            if not (pd.isna(device_info_raw) or device_info_raw is None)
            else ""
        )
        addr1 = str(row.get("addr1", ""))
        p_email = row.get("P_emaildomain", None)
        email_str = str(p_email) if not (pd.isna(p_email) or p_email is None) else ""

        ts_raw = row.get("TransactionDT", 0.0)
        try:
            ts = float(ts_raw)
        except (TypeError, ValueError):
            ts = 0.0

        # Card velocity — atomic INCR + timestamp diff via Redis pipeline
        card_vel = self.state_store.get_card_velocity(card1, ts)
        out["Transaction_Per_Card"] = card_vel.transaction_per_card
        out["Card_Frequency"] = card_vel.card_frequency
        out["Card_Time_Diff"] = card_vel.card_time_diff

        # Device velocity
        out["Transaction_Per_Device"] = self.state_store.get_device_velocity(device_info_str)

        # Address frequency
        out["Address_Frequency"] = self.state_store.get_address_frequency(addr1)

        # Email transaction count
        out["Email_Transaction_Count"] = self.state_store.get_email_count(email_str)
