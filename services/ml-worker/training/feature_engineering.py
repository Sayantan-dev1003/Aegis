import pandas as pd
import numpy as np
import logging
import json
import time
from pathlib import Path
from typing import Dict, Any, List

# Configurable constants
BASE_DIR = Path(__file__).resolve().parent.parent
PREPROCESSED_DIR = BASE_DIR / "data" / "preprocessed"
INPUT_FILE = PREPROCESSED_DIR / "cleaned_dataset.parquet"
OUTPUT_FILE = PREPROCESSED_DIR / "engineered_dataset.parquet"
REPORT_FILE = PREPROCESSED_DIR / "feature_engineering_report.json"
CREATED_FEATURES_FILE = PREPROCESSED_DIR / "created_features.csv"

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("FeatureEngineer")


class FeatureEngineer:
    """
    Production-grade Feature Engineering Pipeline for Fraud Detection.
    """

    def __init__(self, input_file: Path | str = INPUT_FILE, output_file: Path | str = OUTPUT_FILE):
        self.input_file = Path(input_file)
        self.output_file = Path(output_file)
        self.report: Dict[str, Any] = {}
        self.df = pd.DataFrame()
        self.initial_columns: List[str] = []
        self.created_features: List[str] = []
        self.dropped_features: List[str] = []
        self.aggregation_mappings: Dict[str, Dict[str, Dict[Any, float]]] = {}
        self.frequency_mappings: Dict[str, Dict[Any, float]] = {}

    def _add_feature(self, column_name: str, series: pd.Series) -> None:
        """Helper to add a feature and track it preserving order."""
        self.df[column_name] = series
        if column_name not in self.created_features:
            self.created_features.append(column_name)

    def load_dataset(self) -> None:
        """Loads the preprocessed dataset and initializes tracking."""
        logger.info(f"Loading dataset from {self.input_file}")
        if not self.input_file.exists():
            raise FileNotFoundError(f"Input file not found: {self.input_file}")

        start_time = time.time()
        self.df = pd.read_parquet(self.input_file)

        if self.df.empty:
            raise ValueError("The loaded dataframe is empty.")

        self.initial_columns = self.df.columns.tolist()
        self.report["initial_rows"] = len(self.df)
        self.report["initial_columns"] = len(self.initial_columns)
        self.report["memory_before_mb"] = self.df.memory_usage(deep=True).sum() / (1024 * 1024)

        logger.info(f"Dataset loaded in {time.time() - start_time:.2f} seconds. Shape: {self.df.shape}")

    def fit_aggregation_statistics(self, df_train: pd.DataFrame) -> None:
        """
        Computes mapping dictionaries for target aggregations using training data
        to prevent data leakage.
        """
        logger.info("Fitting aggregation statistics...")
        self.aggregation_mappings = {}
        agg_cols = ['card1', 'card2', 'card3', 'card5', 'addr1', 'ProductCD', 'DeviceType']
        valid_agg_cols = [c for c in agg_cols if c in df_train.columns]

        for col in valid_agg_cols:
            grouped_amt = df_train.groupby(col)['TransactionAmt']
            mapping_dict = {
                'mean': grouped_amt.mean().to_dict(),
                'median': grouped_amt.median().to_dict(),
                'count': grouped_amt.count().to_dict(),
                'std': grouped_amt.std().to_dict(),
                'max': grouped_amt.max().to_dict(),
                'min': grouped_amt.min().to_dict(),
            }
            merchant_proxy = 'addr1' if 'addr1' in df_train.columns and col != 'addr1' else 'ProductCD'
            if merchant_proxy in df_train.columns:
                mapping_dict['unique_merchant'] = df_train.groupby(col)[merchant_proxy].nunique().to_dict()
                
            self.aggregation_mappings[col] = mapping_dict

    def fit_frequency_mappings(self, df_train: pd.DataFrame) -> None:
        """
        Computes frequency mappings using training data to prevent data leakage.
        """
        logger.info("Fitting frequency mappings...")
        self.frequency_mappings = {}
        
        if 'DeviceInfo' in df_train.columns:
            self.frequency_mappings['DeviceInfo'] = df_train['DeviceInfo'].value_counts(dropna=False).to_dict()
            
        if 'DeviceType' in df_train.columns:
            self.frequency_mappings['DeviceType'] = df_train['DeviceType'].value_counts(dropna=False).to_dict()
            
        if 'DeviceInfo' in df_train.columns and 'DeviceType' in df_train.columns:
            combined_device = df_train['DeviceType'].fillna('unknown') + "_" + df_train['DeviceInfo'].fillna('unknown')
            self.frequency_mappings['DeviceCombined'] = combined_device.value_counts(dropna=False).to_dict()
            
        if 'P_emaildomain' in df_train.columns:
            email_provider = df_train['P_emaildomain'].str.extract(r'^([^.]+)', expand=False)
            self.frequency_mappings['EmailProvider'] = email_provider.value_counts(dropna=False).to_dict()

    def fit(self, df: pd.DataFrame) -> 'FeatureEngineer':
        """
        Fits all mappings (aggregations, frequencies, categories) on the provided dataset.
        Does not modify the dataframe.
        """
        logger.info("Fitting feature engineer mappings...")
        self.fit_aggregation_statistics(df)
        self.fit_frequency_mappings(df)
        return self

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Applies engineered features to the provided dataframe using pre-fitted mappings.
        """
        logger.info("Transforming dataset...")
        self.df = df.copy()
        
        self.create_transaction_features()
        self.create_time_features()
        self.create_amount_features()
        self.create_identity_features()
        self.create_device_features()
        self.create_email_features()
        self.create_aggregation_features()
        self.create_velocity_features()
        
        return self.df

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Fits mappings and transforms the dataset."""
        return self.fit(df).transform(df)

    def create_transaction_features(self) -> None:
        """
        Generates mathematical features based on transaction amounts.
        """
        logger.info("Creating Transaction Features...")
        if 'TransactionAmt' not in self.df.columns:
            raise KeyError("Column 'TransactionAmt' is required but not found.")

        amt = self.df['TransactionAmt']
        self._add_feature('TransactionAmt_Log', np.log1p(amt))
        self._add_feature('TransactionAmt_Sqrt', np.sqrt(amt))
        self._add_feature('TransactionAmt_IsZero', (amt == 0).astype(np.int8))
        self._add_feature('TransactionAmt_Rounded', np.round(amt))

        try:
            bucket_series = pd.qcut(amt, q=10, labels=False, duplicates='drop')
        except Exception as e:
            logger.warning(f"Could not calculate TransactionAmt_Bucket: {e}")
            bucket_series = np.nan
            
        self._add_feature('TransactionAmt_Bucket', bucket_series)

        self.report.setdefault("feature_groups_created", []).append("Transaction Features")

    def create_time_features(self) -> None:
        """
        Extracts and transforms temporal features from TransactionDT representing elapsed time.
        """
        logger.info("Creating Time Features...")
        if 'TransactionDT' not in self.df.columns:
            raise KeyError("Column 'TransactionDT' is required but not found.")

        dt_seconds = self.df['TransactionDT']

        self._add_feature('ElapsedDays', np.floor((dt_seconds / (3600 * 24))).astype(np.int32))
        self._add_feature('ElapsedWeeks', np.floor((dt_seconds / (3600 * 24 * 7))).astype(np.int32))
        
        hour = np.floor((dt_seconds / 3600) % 24).astype(np.int8)
        self._add_feature('Hour', hour)
        
        weekday = np.floor((dt_seconds / (3600 * 24)) % 7).astype(np.int8)
        self._add_feature('Weekday', weekday)
        self._add_feature('Weekend', (weekday >= 5).astype(np.int8))
        self._add_feature('IsNight', hour.isin([0, 1, 2, 3, 4, 5, 6]).astype(np.int8))

        self._add_feature('Hour_Sin', np.sin(2 * np.pi * hour / 24))
        self._add_feature('Hour_Cos', np.cos(2 * np.pi * hour / 24))
        self._add_feature('Weekday_Sin', np.sin(2 * np.pi * weekday / 7))
        self._add_feature('Weekday_Cos', np.cos(2 * np.pi * weekday / 7))

        self.report.setdefault("feature_groups_created", []).append("Time Features")

    def create_amount_features(self) -> None:
        """
        Derives statistical and grouping features based on transaction amounts.
        """
        logger.info("Creating Amount Features...")
        amt = self.df['TransactionAmt']
        
        self._add_feature('Amount_Rank', amt.rank())
        self._add_feature('Amount_Percentile', amt.rank(pct=True))
        
        for col in ['card1', 'addr1', 'ProductCD']:
            if col in self.df.columns and col in self.aggregation_mappings:
                mean_mapping = self.aggregation_mappings[col].get('mean', {})
                mean_series = self.df[col].map(mean_mapping)
                self._add_feature(f'TransactionAmt_vs_{col}_Mean', amt / (mean_series + 1e-9))

        self.report.setdefault("feature_groups_created", []).append("Amount Features")

    def create_identity_features(self) -> None:
        """
        Extracts features from categorical identity columns.
        """
        logger.info("Creating Identity Features...")

        if 'DeviceInfo' in self.df.columns:
            self._add_feature('DeviceInfo_Missing_Flag', self.df['DeviceInfo'].isnull().astype(np.int8))
            self._add_feature('HasDeviceInfo', self.df['DeviceInfo'].notnull().astype(np.int8))
            self._add_feature('DeviceInfo_Length', self.df['DeviceInfo'].astype(str).str.len())

        if 'DeviceType' in self.df.columns:
            self._add_feature('HasDeviceType', self.df['DeviceType'].notnull().astype(np.int8))

        id_cols = [col for col in self.df.columns if str(col).startswith('id_')]
        if id_cols:
            self._add_feature('HasIdentity', self.df[id_cols].notnull().any(axis=1).astype(np.int8))
        else:
            self._add_feature('HasIdentity', pd.Series(0, index=self.df.index, dtype=np.int8))

        if 'id_30' in self.df.columns:
            self._add_feature('OS_Type', self.df['id_30'].str.split(' ', expand=True)[0])

        if 'id_31' in self.df.columns:
            self._add_feature('Browser_Type', self.df['id_31'].str.split(' ', expand=True)[0])

        if 'id_33' in self.df.columns:
            self._add_feature('Screen_Category', self.df['id_33'].str.split('x', expand=True)[0])

        self.report.setdefault("feature_groups_created", []).append("Identity Features")

    def create_device_features(self) -> None:
        """
        Computes device usage frequencies.
        """
        logger.info("Creating Device Features...")

        if 'DeviceInfo' in self.df.columns and 'DeviceInfo' in self.frequency_mappings:
            freq_mapping = self.frequency_mappings['DeviceInfo']
            freq = self.df['DeviceInfo'].map(freq_mapping)
            self._add_feature('DeviceInfoFrequency', freq)
            self._add_feature('KnownDevice', (freq > 1).astype(np.int8))

        if 'DeviceType' in self.df.columns and 'DeviceType' in self.frequency_mappings:
            freq_mapping = self.frequency_mappings['DeviceType']
            self._add_feature('DeviceTypeFrequency', self.df['DeviceType'].map(freq_mapping))

        if 'DeviceInfo' in self.df.columns and 'DeviceType' in self.df.columns and 'DeviceCombined' in self.frequency_mappings:
            combined_device = self.df['DeviceType'].fillna('unknown') + "_" + self.df['DeviceInfo'].fillna('unknown')
            freq_mapping = self.frequency_mappings['DeviceCombined']
            self._add_feature('DeviceFrequency', combined_device.map(freq_mapping))
        elif 'DeviceInfo' in self.df.columns:
            self._add_feature('DeviceFrequency', self.df.get('DeviceInfoFrequency', pd.Series(np.nan, index=self.df.index)))
        elif 'DeviceType' in self.df.columns:
            self._add_feature('DeviceFrequency', self.df.get('DeviceTypeFrequency', pd.Series(np.nan, index=self.df.index)))

        self.report.setdefault("feature_groups_created", []).append("Device Features")

    def create_email_features(self) -> None:
        """
        Extracts domains and computes features related to email providers.
        """
        logger.info("Creating Email Features...")

        has_p = 'P_emaildomain' in self.df.columns
        has_r = 'R_emaildomain' in self.df.columns
        
        if has_p:
            self._add_feature('Email_Missing_Flag', self.df['P_emaildomain'].isnull().astype(np.int8))
            
        if has_r:
            self._add_feature('HasRecipientEmail', self.df['R_emaildomain'].notnull().astype(np.int8))

        if has_p and has_r:
            self._add_feature('SameEmailDomain', (self.df['P_emaildomain'] == self.df['R_emaildomain']).astype(np.int8))

        if has_p:
            email_provider = self.df['P_emaildomain'].str.extract(r'^([^.]+)', expand=False)
            self._add_feature('EmailProvider', email_provider)
            
            if 'EmailProvider' in self.frequency_mappings:
                freq_mapping = self.frequency_mappings['EmailProvider']
                self._add_feature('EmailProviderFrequency', self.df['EmailProvider'].map(freq_mapping))

            common_providers = ['gmail', 'yahoo', 'hotmail', 'aol', 'outlook', 'icloud']
            self._add_feature('CommonProvider', self.df['EmailProvider'].isin(common_providers).astype(np.int8))

        self.report.setdefault("feature_groups_created", []).append("Email Features")

    def create_aggregation_features(self) -> None:
        """
        Applies pre-computed aggregation statistics to prevent leakage.
        """
        logger.info("Creating Aggregation Features...")

        for col, mappings in self.aggregation_mappings.items():
            if col in self.df.columns:
                self._add_feature(f'{col}_Mean_TransactionAmt', self.df[col].map(mappings.get('mean', {})))
                self._add_feature(f'{col}_Median_TransactionAmt', self.df[col].map(mappings.get('median', {})))
                self._add_feature(f'{col}_Count_Transaction', self.df[col].map(mappings.get('count', {})))
                self._add_feature(f'{col}_Std_TransactionAmt', self.df[col].map(mappings.get('std', {})))
                self._add_feature(f'{col}_Max_TransactionAmt', self.df[col].map(mappings.get('max', {})))
                self._add_feature(f'{col}_Min_TransactionAmt', self.df[col].map(mappings.get('min', {})))

                if 'unique_merchant' in mappings:
                    self._add_feature(f'{col}_Unique_Merchant_Count', self.df[col].map(mappings['unique_merchant']))

        self.report.setdefault("feature_groups_created", []).append("Aggregation Features")

    def create_velocity_features(self) -> None:
        """
        Calculates offline velocity features based on cumulative statistics.
        """
        logger.info("Creating Offline Velocity Features...")

        if 'TransactionDT' not in self.df.columns:
            logger.warning("TransactionDT missing, cannot create velocity features.")
            return

        self.df = self.df.sort_values('TransactionDT').reset_index(drop=True)

        if 'card1' in self.df.columns:
            self._add_feature('Transaction_Per_Card', self.df.groupby('card1').cumcount())
            self._add_feature('Card_Frequency', self.df.groupby('card1')['TransactionDT'].transform('count'))
            self._add_feature('Card_Time_Diff', self.df.groupby('card1')['TransactionDT'].diff())

        if 'DeviceInfo' in self.df.columns:
            self._add_feature('Transaction_Per_Device', self.df.groupby('DeviceInfo').cumcount())
            
        if 'addr1' in self.df.columns:
            self._add_feature('Address_Frequency', self.df.groupby('addr1')['TransactionDT'].transform('count'))

        if 'P_emaildomain' in self.df.columns:
            self._add_feature('Email_Transaction_Count', self.df.groupby('P_emaildomain').cumcount())

        self.report.setdefault("feature_groups_created", []).append("Offline Velocity Features")

    def validate_features(self) -> None:
        """Validates the generated features for missing values, infinites, and duplicates."""
        logger.info("Validating Features...")

        nan_counts = self.df.isna().sum().sum()
        numeric_cols = self.df.select_dtypes(include=[np.number]).columns
        inf_counts = np.isinf(self.df[numeric_cols]).sum().sum()

        duplicate_cols = self.df.columns[self.df.columns.duplicated()].tolist()
        has_target = 'isFraud' in self.df.columns

        validation_report = {
            "total_nan_values": int(nan_counts),
            "total_infinite_values": int(inf_counts),
            "duplicate_columns_found": len(duplicate_cols),
            "target_column_exists": has_target
        }

        self.report["validation"] = validation_report
        logger.info(f"Validation Report: {json.dumps(validation_report, indent=2)}")

        if duplicate_cols:
            logger.warning(f"Found duplicate columns: {duplicate_cols}")

    def optimize_memory(self) -> None:
        """Downcasts numerical values and categorizes object types to reduce memory footprint."""
        logger.info("Optimizing Memory...")
        memory_before = self.df.memory_usage(deep=True).sum() / (1024 * 1024)

        for col in self.df.columns:
            col_type = self.df[col].dtype

            if col_type != object and not isinstance(col_type, pd.CategoricalDtype):
                c_min = self.df[col].min()
                c_max = self.df[col].max()
                has_nan = self.df[col].isna().any()

                if pd.api.types.is_integer_dtype(col_type) and not has_nan:
                    if c_min > np.iinfo(np.int8).min and c_max < np.iinfo(np.int8).max:
                        self.df[col] = self.df[col].astype(np.int8)
                    elif c_min > np.iinfo(np.int16).min and c_max < np.iinfo(np.int16).max:
                        self.df[col] = self.df[col].astype(np.int16)
                    elif c_min > np.iinfo(np.int32).min and c_max < np.iinfo(np.int32).max:
                        self.df[col] = self.df[col].astype(np.int32)
                    elif c_min > np.iinfo(np.int64).min and c_max < np.iinfo(np.int64).max:
                        self.df[col] = self.df[col].astype(np.int64)
                elif pd.api.types.is_float_dtype(col_type):
                    if c_min > np.finfo(np.float32).min and c_max < np.finfo(np.float32).max:
                        self.df[col] = self.df[col].astype(np.float32)

            elif col_type == object:
                num_unique = self.df[col].nunique()
                unique_ratio = num_unique / len(self.df)
                if num_unique < 1000 and unique_ratio < 0.5:
                    self.df[col] = self.df[col].astype('category')

        memory_after = self.df.memory_usage(deep=True).sum() / (1024 * 1024)
        self.report["memory_after_mb"] = memory_after
        self.report["memory_saved_mb"] = memory_before - memory_after
        logger.info(f"Memory optimized: {memory_before:.2f} MB -> {memory_after:.2f} MB")

    def save(self) -> None:
        """Saves the engineered dataset and reports to disk."""
        logger.info(f"Saving engineered dataset to {self.output_file}")

        self.output_file.parent.mkdir(parents=True, exist_ok=True)
        self.df.to_parquet(self.output_file, index=False)

        self.report["final_rows"] = len(self.df)
        self.report["final_columns"] = len(self.df.columns)
        self.report["new_features_created"] = len(self.created_features)
        self.report["dropped_features"] = len(self.dropped_features)

        report_path = self.output_file.parent / "feature_engineering_report.json"
        with open(report_path, "w") as f:
            json.dump(self.report, f, indent=4)

        features_df = pd.DataFrame({"created_features": self.created_features})
        features_csv_path = self.output_file.parent / "created_features.csv"
        features_df.to_csv(features_csv_path, index=False)

        logger.info("Pipeline completed successfully.")

    def run(self) -> None:
        """Executes the full feature engineering pipeline sequentially."""
        start_time = time.time()

        self.load_dataset()
        self.df = self.fit_transform(self.df)
        self.validate_features()
        self.optimize_memory()
        self.save()

        self.report["execution_time_seconds"] = time.time() - start_time
        logger.info(f"Total execution time: {self.report['execution_time_seconds']:.2f} seconds")


if __name__ == "__main__":
    try:
        pipeline = FeatureEngineer()
        pipeline.run()
    except Exception as e:
        logger.error(f"Feature Engineering pipeline failed: {str(e)}")
        raise
