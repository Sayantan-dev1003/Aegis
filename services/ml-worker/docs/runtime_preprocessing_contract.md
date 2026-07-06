# Runtime Preprocessing Contract

**Aegis Fraud Detection — ML Worker**
**Version:** 1.0 | **Status:** Authoritative | **Audience:** ML engineers, platform engineers

---

## Overview

`runtime_preprocessing.joblib` is the **single authoritative source** for all
lookup-based feature engineering at inference time. It is generated once per
training run by `training/feature_engineering.py` and consumed read-only by
the ML Worker via `app/inference/artifact_loader.py`.

This document defines the artifact schema, every feature's lookup behavior,
the NaN/unknown key policy, the version policy, and the immutability contract.
Changes to any of these must be reflected here before merging.

---

## 1. Artifact Schema (schema_version = "1.0")

```
runtime_preprocessing.joblib                 (joblib-serialised Python dict)
│
├── schema_version             str           "1.0"
├── artifact_version           str           pipeline version, e.g. "Aegis-1.0.0"
├── feature_engineering_version str          pipeline version (same value)
├── created_at                 str           ISO 8601 UTC, e.g. "2026-07-05T05:05:51+00:00"
│
├── aggregation_mappings       dict[str, dict[str, dict[Any, float]]]
│   │   Keyed by source column.  Each entry contains stat buckets.
│   │   Stat keys: "mean", "median", "count", "std", "max", "min",
│   │              "unique_merchant" (when applicable)
│   │
│   ├── card1        → {mean: {val→float}, median: {…}, count: {…}, std: {…}, max: {…}, min: {…}, unique_merchant: {…}}
│   ├── card2        → {…}
│   ├── card3        → {…}
│   ├── card5        → {…}
│   ├── addr1        → {…}
│   ├── ProductCD    → {…}
│   └── DeviceType   → {…}
│
├── frequency_mappings         dict[str, dict[Any, float]]
│   │   Keyed by logical group name.
│   │
│   ├── DeviceInfo       → {device_string → count}
│   ├── DeviceType       → {type_string  → count}
│   ├── DeviceCombined   → {"type_device" → count}
│   └── EmailProvider    → {provider_str → count}
│
├── percentile_mapping         list[float]
│   │   Sorted array of all non-null TransactionAmt values from the training set.
│   │   Length: ~590 000 (varies by dataset size).
│   │   Usage: np.searchsorted(sorted_array, transaction_amt) / len(sorted_array)
│   │   → Amount_Percentile in [0.0, 1.0]
│
└── metadata                   dict
    ├── aggregation_groups     list[str]   — ordered list of agg column names
    ├── frequency_groups       list[str]   — ordered list of freq group names
    ├── percentile_buckets     int         — len(percentile_mapping)
    ├── total_agg_statistics   int         — total stat buckets across all agg groups
    ├── total_agg_entries      int         — total key-value pairs across all stat buckets
    └── total_freq_mappings    int         — number of frequency groups
```

> **Rule:** No top-level key may be added or removed without bumping
> `schema_version` and updating this document and the ML Worker's
> `artifact_loader.py` validation.

---

## 2. Lookup Behavior — Feature by Feature

### 2.1 Aggregation Features

**Source:** `aggregation_mappings[col][stat]`
**Pattern at runtime:**

```python
# artifact loaded once at startup; immutable (MappingProxyType)
mean_map = preprocessing["aggregation_mappings"]["card1"]["mean"]
result = mean_map.get(card1_value, np.nan)
```

| Engineered Feature | Source Column | Stat Key |
|---|---|---|
| `card1_Mean_TransactionAmt` | `card1` | `mean` |
| `card1_Median_TransactionAmt` | `card1` | `median` |
| `card1_Count_Transaction` | `card1` | `count` |
| `card1_Std_TransactionAmt` | `card1` | `std` |
| `card1_Max_TransactionAmt` | `card1` | `max` |
| `card1_Min_TransactionAmt` | `card1` | `min` |
| `card1_Unique_Merchant_Count` | `card1` | `unique_merchant` |
| *(same pattern for card2, card3, card5, addr1, ProductCD, DeviceType)* | | |
| `TransactionAmt_vs_card1_Mean` | `card1` | `mean` |
| `TransactionAmt_vs_addr1_Mean` | `addr1` | `mean` |
| `TransactionAmt_vs_ProductCD_Mean` | `ProductCD` | `mean` |

### 2.2 Frequency Features

**Source:** `frequency_mappings[group]`
**Pattern at runtime:**

```python
freq_map = preprocessing["frequency_mappings"]["DeviceInfo"]
result = freq_map.get(device_info_value, np.nan)
```

| Engineered Feature | Mapping Group |
|---|---|
| `DeviceInfoFrequency` | `DeviceInfo` |
| `KnownDevice` | `DeviceInfo` (threshold: freq > 1) |
| `DeviceTypeFrequency` | `DeviceType` |
| `DeviceFrequency` | `DeviceCombined` (DeviceType + "_" + DeviceInfo) |
| `EmailProviderFrequency` | `EmailProvider` |

### 2.3 Amount_Percentile

**Source:** `percentile_mapping`
**Pattern at runtime:**

```python
import numpy as np

sorted_amounts = np.array(preprocessing["percentile_mapping"])  # loaded once at startup
percentile = np.searchsorted(sorted_amounts, transaction_amt) / len(sorted_amounts)
```

**Training consistency:**
Training uses the same `sorted_amounts` array (produced by
`fit_percentile_mapping`) and applies the same `np.searchsorted` formula.
The old batch `rank(pct=True)` approach is no longer used — it was not
reproducible at inference time for a single transaction.

---

## 3. NaN Policy

| Situation | Result | Downstream behaviour |
|---|---|---|
| Lookup key found in mapping | The mapped float value | Normal |
| Lookup key **not** found in mapping | `np.nan` via `dict.get(key, np.nan)` | XGBoost routes to the split direction learned during training for NaN inputs |
| `TransactionAmt` is NaN for percentile | `np.nan` | As above |
| Mapping group missing from artifact | Startup fails with `ArtifactLoadError` | Inference never starts |

NaN values are **never** imputed to 0 or a constant at the feature engineering
layer.  The imputer (`imputer.joblib`) handles NaN for the raw input columns
before feature engineering runs, but engineered features may legitimately
produce NaN for unseen keys.

---

## 4. Unknown Key Policy

```
UNKNOWN_KEY_POLICY:
  Keys absent from a lookup mapping return NaN via dict.get(key, NaN).
  This is the training-consistent fallback: XGBoost handles NaN natively
  via the split direction learned during training.

  At runtime the ML Worker increments the ml_unknown_lookup_total
  Prometheus counter (label: feature) for every NaN produced by an
  unseen key, enabling model drift detection.
```

**Metric:** `ml_unknown_lookup_total` (Counter, label: `feature`)

Example label values: `card1_mean`, `DeviceInfo_freq`, `EmailProvider_freq`

**Alerting guidance:** A sustained rise in `ml_unknown_lookup_total` for a
specific feature indicates that the distribution of that feature in production
has drifted from the training distribution.  Trigger model retraining if the
rate exceeds a configurable threshold for more than 30 minutes.

---

## 5. Version Policy

### 5.1 Fields

| Field | Location | Semantics |
|---|---|---|
| `schema_version` | Artifact top-level | Structure of the artifact dict (`"1.0"` = this doc) |
| `artifact_version` | Artifact top-level | Pipeline version that produced this artifact |
| `feature_engineering_version` | Artifact top-level | `feature_engineering.py` version (same value in v1) |
| `schema_version` | `deployment_config.json` → `runtime_preprocessing` | Expected schema at startup |
| `artifact_version` | `deployment_config.json` → `runtime_preprocessing` | Expected artifact version at startup |

### 5.2 When to bump schema_version

Bump `ARTIFACT_SCHEMA_VERSION` in `feature_engineering.py` (and update this
document and `artifact_loader.py`) when:
- A new **top-level key** is added or removed from the artifact.
- The **semantics** of an existing key change (e.g. `percentile_mapping` changes
  from a list to a dict).

Do **not** bump for:
- Adding a new column to `aggregation_mappings` (new key inside existing structure).
  Coverage validation picks it up automatically via `self.aggregation_mappings.keys()`.
- Adding a new group to `frequency_mappings`.
  Same — `self.frequency_mappings.keys()` drives validation dynamically.
- Changes to `metadata` values (they are informational only).

### 5.3 Backward compatibility

The ML Worker `artifact_loader.py` validates `schema_version` on startup.
If `schema_version != expected_schema_version` (from `deployment_config.json`),
the worker raises `ArtifactVersionError` and refuses to start.  This prevents
a new worker binary from silently consuming an artifact with the wrong schema.

---

## 6. Immutability Contract

After loading and validating, `artifact_loader.py` wraps the artifact in
`types.MappingProxyType` recursively:

```python
from types import MappingProxyType

immutable_preprocessing = MappingProxyType({
    "schema_version": rp["schema_version"],
    "artifact_version": rp["artifact_version"],
    "aggregation_mappings": MappingProxyType({
        col: MappingProxyType({
            stat: MappingProxyType(bucket)
            for stat, bucket in stats.items()
        })
        for col, stats in rp["aggregation_mappings"].items()
    }),
    "frequency_mappings": MappingProxyType({
        group: MappingProxyType(mapping)
        for group, mapping in rp["frequency_mappings"].items()
    }),
    "percentile_mapping": tuple(rp["percentile_mapping"]),  # immutable sequence
    "metadata": MappingProxyType(rp["metadata"]),
})
```

**Guarantees:**
- Any write attempt raises `TypeError` immediately.
- `MappingProxyType` is thread-safe for concurrent reads.
- `tuple` for `percentile_mapping` is hashable and safely passed to `np.array()`.
- No module may hold a reference to the mutable underlying dict after loading.

> [!IMPORTANT]
> `MappingProxyType` wrapping is a **required implementation step** in
> `app/inference/artifact_loader.py`, not merely a recommendation.
> The ML Worker must implement this before going to production.

---

## 7. Training ↔ Inference Consistency Table

| Feature | Training computation | Runtime computation | Consistent? |
|---|---|---|---|
| `card1_Mean_TransactionAmt` | `df.groupby('card1')['TransactionAmt'].mean()` | `agg_map['card1']['mean'].get(v, NaN)` | ✅ |
| `DeviceInfoFrequency` | `df['DeviceInfo'].value_counts()` | `freq_map['DeviceInfo'].get(v, NaN)` | ✅ |
| `EmailProviderFrequency` | `df['P_emaildomain'].str.extract(…).value_counts()` | `freq_map['EmailProvider'].get(v, NaN)` | ✅ |
| `Amount_Percentile` | `np.searchsorted(sorted_amts, v) / n` | `np.searchsorted(sorted_amts, v) / n` | ✅ |
| `Transaction_Per_Card` | `df.groupby('card1').cumcount()` | Redis INCR (rolling 30-day window) | ⚠️ Approximation |
| `Card_Frequency` | `df.groupby('card1')['TransactionDT'].transform('count')` | Redis GET (rolling 30-day window) | ⚠️ Approximation |
| `Card_Time_Diff` | `df.groupby('card1')['TransactionDT'].diff()` | `NOW - Redis last_ts` | ⚠️ Approximation |
| `Transaction_Per_Device` | `df.groupby('DeviceInfo').cumcount()` | Redis INCR | ⚠️ Approximation |
| `Address_Frequency` | `df.groupby('addr1')['TransactionDT'].transform('count')` | Redis GET | ⚠️ Approximation |
| `Email_Transaction_Count` | `df.groupby('P_emaildomain').cumcount()` | Redis INCR | ⚠️ Approximation |

> ⚠️ **Velocity features** are a known, accepted approximation. See the
> implementation plan for details. They are monitored via
> `ml_redis_fallback_total`. Exact reproducibility would require a streaming
> aggregation sink (e.g. Flink, Kafka Streams) mirroring the training groupby.

---

## 8. Startup Validation Sequence

The ML Worker performs these checks **before** accepting any Kafka messages:

```
1. Load runtime_preprocessing.joblib
2. Assert schema_version == deployment_config["runtime_preprocessing"]["schema_version"]
3. Assert artifact_version == deployment_config["runtime_preprocessing"]["artifact_version"]
4. Assert feature_engineering_version == deployment_config["runtime_preprocessing"]["feature_engineering_version"]
5. Assert aggregation_mappings keys == deployment_config["runtime_preprocessing"]["aggregation_groups"]
6. Assert frequency_mappings keys == deployment_config["runtime_preprocessing"]["frequency_groups"]
7. Assert len(percentile_mapping) == deployment_config["runtime_preprocessing"]["percentile_buckets"]
8. Assert every mapping group is non-empty (size > 0)
9. Wrap in MappingProxyType (immutability enforcement)
10. Set health_state["preprocessing_loaded"] = True
```

Steps 5-7 are guaranteed to pass if `export_artifacts.py` ran cleanly, because
it performs an **explicit post-write cross-check**: after writing
`deployment_config.json` it re-reads the file from disk and asserts that
`runtime_preprocessing.aggregation_groups`, `frequency_groups`, and
`percentile_buckets` exactly match the values extracted from the artifact
during `_validate_runtime_preprocessing()`. A mismatch raises
`ExportArtifactsError` immediately, blocking deployment.

Failure at any step → `ArtifactLoadError` or `ArtifactVersionError` → worker
process exits with status 1 → Kubernetes restarts pod → alert fires.

---

## 9. Files Involved

| File | Role |
|---|---|
| [`training/feature_engineering.py`](../training/feature_engineering.py) | Generates the artifact; defines `ARTIFACT_SCHEMA_VERSION` and `UNKNOWN_KEY_POLICY` |
| [`training/export_artifacts.py`](../training/export_artifacts.py) | Validates the artifact before deployment; writes `deployment_config.json` with `runtime_preprocessing` section |
| `artifacts/runtime_preprocessing.joblib` | The artifact (generated, not committed to git) |
| `artifacts/runtime_preprocessing_metadata.json` | Human-readable summary (generated) |
| `deployment/runtime_preprocessing.joblib` | Deployment copy (checksum-verified) |
| `deployment/deployment_config.json` | Schema/version expectations for ML Worker startup |
| `app/inference/artifact_loader.py` | Loads, validates, and freezes the artifact at worker startup |
| `app/features/feature_engineering.py` | Consumes the frozen artifact for inference-time feature computation |
| `app/monitoring/metrics.py` | Defines `ml_unknown_lookup_total` counter |

---

*Last updated: 2026-07-05 | Maintained by: ML Platform team*
