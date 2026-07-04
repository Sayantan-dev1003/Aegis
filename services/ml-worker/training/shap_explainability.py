"""
Aegis - Real-Time Fraud Detection System
Module: SHAP Explainability

This module provides production-grade global and local explainability 
for the trained XGBoost model using SHAP (SHapley Additive exPlanations).

It generates deterministic explanations without retraining, 
validates input artifacts, and strictly conforms to memory/time constraints.
"""

import os
import gc
import json
import time
import logging
import datetime
import platform
import traceback
from typing import List, Dict, Any, Tuple, Optional

try:
    import psutil
except ImportError:
    psutil = None

import numpy as np
import pandas as pd
import joblib
import xgboost as xgb
import shap
import matplotlib.pyplot as plt
import seaborn as sns
from scipy.stats import spearmanr


class ExplainabilityError(Exception):
    """Custom exception for errors during the SHAP explainability process."""
    pass


class ExplainabilityGenerator:
    """
    Production-grade SHAP Explainability Generator for Aegis Pipeline.
    """

    def __init__(
        self,
        val_path: str = "data/selected/validation.parquet",
        model_path: str = "artifacts/xgboost_model.joblib",
        metadata_path: str = "artifacts/model_metadata.json",
        calibrator_path: str = "artifacts/probability_calibrator.joblib",
        calibration_meta_path: str = "artifacts/calibration_metadata.json",
        threshold_path: str = "artifacts/deployment_threshold.json",
        feature_metadata_path: str = "artifacts/feature_selector_metadata.json",
        report_dir: str = "reports",
        plots_dir: str = "plots",
        artifacts_dir: str = "artifacts",
        max_background_samples: int = 1000,
        max_explained_samples: int = 2000,
        random_state: int = 42
    ):
        self.val_path = val_path
        self.model_path = model_path
        self.metadata_path = metadata_path
        self.calibrator_path = calibrator_path
        self.calibration_meta_path = calibration_meta_path
        self.threshold_path = threshold_path
        self.feature_metadata_path = feature_metadata_path
        
        self.report_dir = report_dir
        self.plots_dir = plots_dir
        self.artifacts_dir = artifacts_dir
        
        self.max_background_samples = max_background_samples
        self.max_explained_samples = max_explained_samples
        self.random_state = random_state
        
        # Make directories
        os.makedirs(self.report_dir, exist_ok=True)
        os.makedirs(self.plots_dir, exist_ok=True)
        os.makedirs(self.artifacts_dir, exist_ok=True)
        
        self.logger = self._setup_logger()
        
        # State
        self.df: pd.DataFrame = pd.DataFrame()
        self.model: Any = None
        self.calibrator: Any = None
        self.model_metadata: Dict[str, Any] = {}
        self.calibration_metadata: Dict[str, Any] = {}
        self.threshold_config: Dict[str, Any] = {}
        self.feature_metadata: Dict[str, Any] = {}
        
        self.features: List[str] = []
        self.target: str = "isFraud"
        
        self.background_data: pd.DataFrame = pd.DataFrame()
        self.explanation_data: pd.DataFrame = pd.DataFrame()
        self.explanation_target: pd.Series = pd.Series(dtype=int)
        self.explanation_ids: pd.Series = pd.Series(dtype=str)
        
        # SHAP specific state
        self.explainer: Optional[shap.TreeExplainer] = None
        self.shap_values: Optional[np.ndarray] = None
        self.shap_interaction_values: Optional[np.ndarray] = None
        self.expected_value: float = 0.0
        
        self.global_importance: pd.DataFrame = pd.DataFrame()
        self.business_insights: Dict[str, Any] = {}
        self.local_explanations: List[Dict[str, Any]] = []
        self.misclassification_explanations: List[Dict[str, Any]] = []
        
        self.run_start_time: float = 0.0
        self.timings: Dict[str, float] = {}
        self.memory_usage: Dict[str, float] = {}
        
    def _setup_logger(self) -> logging.Logger:
        """Configures the logger."""
        logger = logging.getLogger("ExplainabilityGenerator")
        logger.setLevel(logging.INFO)
        if not logger.handlers:
            os.makedirs("logs", exist_ok=True)
            fh = logging.FileHandler(f"logs/shap_explainability_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.log")
            ch = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            fh.setFormatter(formatter)
            ch.setFormatter(formatter)
            logger.addHandler(fh)
            logger.addHandler(ch)
        return logger

    def _record_memory(self, stage: str):
        """Records current memory usage."""
        if psutil:
            process = psutil.Process(os.getpid())
            mem_mb = process.memory_info().rss / (1024 * 1024)
            self.memory_usage[stage] = mem_mb
            self.logger.info(f"Memory usage at {stage}: {mem_mb:.2f} MB")
            if mem_mb > 8000:
                self.logger.warning(f"Memory threshold (8GB) exceeded at {stage}: {mem_mb:.2f} MB")

    def _json_safe(self, obj):
        """
        Recursively converts NumPy/Pandas objects into JSON-serializable
        native Python types.
        """
        if isinstance(obj, dict):
            return {k: self._json_safe(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self._json_safe(v) for v in obj]
        if isinstance(obj, tuple):
            return tuple(self._json_safe(v) for v in obj)
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return obj

    def _load_metadata(self):
        """Loads and validates all metadata artifacts."""
        self.logger.info("Loading metadata artifacts...")
        try:
            with open(self.metadata_path, 'r') as f:
                self.model_metadata = json.load(f)
            
            with open(self.calibration_meta_path, 'r') as f:
                self.calibration_metadata = json.load(f)
                
            with open(self.threshold_path, 'r') as f:
                self.threshold_config = json.load(f)
                
            with open(self.feature_metadata_path, 'r') as f:
                self.feature_metadata = json.load(f)
                
            self.features = self.feature_metadata.get('selected_features', [])
            if not self.features:
                raise ExplainabilityError("No selected_features found in feature metadata.")
                
            self.logger.info(f"Loaded metadata. Expected feature count: {len(self.features)}")
        except FileNotFoundError as e:
            raise ExplainabilityError(f"Missing required artifact: {e}")
        except json.JSONDecodeError as e:
            raise ExplainabilityError(f"Invalid JSON in artifact: {e}")
        except Exception as e:
            raise ExplainabilityError(f"Error loading metadata: {e}")

    def _load_model(self):
        """Loads and validates the XGBoost model and calibrator."""
        self.logger.info("Loading model and calibrator...")
        try:
            self.model = joblib.load(self.model_path)
            self.calibrator = joblib.load(self.calibrator_path)
            
            if not isinstance(self.model, xgb.XGBClassifier):
                raise ExplainabilityError(f"Loaded model is not an XGBClassifier. Found: {type(self.model)}")
                
            if not hasattr(self.model, 'get_booster'):
                raise ExplainabilityError("Loaded XGBClassifier is not fitted or missing booster.")
                
            booster = self.model.get_booster()
            model_features = booster.feature_names
            if model_features is None:
                raise ExplainabilityError("Model does not contain feature names.")
                
            if len(model_features) != len(self.features):
                raise ExplainabilityError(f"Model feature count ({len(model_features)}) != Metadata feature count ({len(self.features)})")
                
            if list(model_features) != self.features:
                raise ExplainabilityError("Model feature ordering does not match metadata exactly.")
                
            self.logger.info("Model validated successfully.")
        except FileNotFoundError as e:
            raise ExplainabilityError(f"Missing required model artifact: {e}")
        except Exception as e:
            raise ExplainabilityError(f"Error loading model: {e}")

    def _load_dataset(self):
        """Loads and validates the validation dataset."""
        self.logger.info("Loading validation dataset...")
        t0 = time.time()
        try:
            if not os.path.exists(self.val_path):
                raise ExplainabilityError(f"Validation dataset not found: {self.val_path}")
                
            self.df = pd.read_parquet(self.val_path)
            
            # Validations
            if 'TransactionID' not in self.df.columns:
                raise ExplainabilityError("TransactionID column missing from dataset.")
            if self.df['TransactionID'].duplicated().any():
                raise ExplainabilityError("Duplicate TransactionIDs found in dataset.")
            if self.df.columns.duplicated().any():
                raise ExplainabilityError("Duplicate columns found in dataset.")
                
            if self.target not in self.df.columns:
                raise ExplainabilityError(f"Target column '{self.target}' missing from dataset.")
                
            missing_features = [f for f in self.features if f not in self.df.columns]
            if missing_features:
                raise ExplainabilityError(f"Missing required features in dataset: {missing_features[:5]}...")
                
            X = self.df[self.features]
            if X.isnull().any().any():
                raise ExplainabilityError("NaN values found in selected features.")
            if np.isinf(X).any().any():
                raise ExplainabilityError("Infinite values found in selected features.")
                
            for col in self.features:
                if self.df[col].dtype == 'object':
                    raise ExplainabilityError(f"Feature {col} is object dtype. Must be numeric.")
                    
            self.timings['load_dataset'] = time.time() - t0
            self.logger.info(f"Dataset loaded successfully. Shape: {self.df.shape}")
        except Exception as e:
            if isinstance(e, ExplainabilityError):
                raise
            raise ExplainabilityError(f"Error loading dataset: {e}")

    def _sample_data(self):
        """Samples background and explanation datasets deterministically."""
        self.logger.info("Sampling data for SHAP computation...")
        
        # Note: Ideally, the background dataset for TreeExplainer should be sampled 
        # from the training distribution, as it represents the data the model learned from.
        # However, due to data availability in this pipeline stage, we use a sample 
        # from the validation dataset, which is an acceptable approximation.
        
        # Explanation data
        if len(self.df) <= self.max_explained_samples:
            sampled_df = self.df.copy()
        else:
            sampled_df = self.df.sample(n=self.max_explained_samples, random_state=self.random_state)
            
        self.explanation_data = sampled_df[self.features]
        self.explanation_target = sampled_df[self.target]
        self.explanation_ids = sampled_df['TransactionID']
        
        # Background data
        if len(self.df) <= self.max_background_samples:
            bg_df = self.df.copy()
        else:
            bg_df = self.df.sample(n=self.max_background_samples, random_state=self.random_state)
            
        self.background_data = bg_df[self.features]
        
        self.logger.info(f"Background samples: {len(self.background_data)}")
        self.logger.info(f"Explanation samples: {len(self.explanation_data)}")

    def _compute_shap_values(self):
        """Computes SHAP values using TreeExplainer."""
        self.logger.info("Computing SHAP values...")
        t0 = time.time()
        
        try:
            self.explainer = shap.TreeExplainer(
                self.model, 
                feature_perturbation="tree_path_dependent"
            )
            
            # Calculate expected value
            if isinstance(self.explainer.expected_value, np.ndarray):
                self.expected_value = float(self.explainer.expected_value[1] if len(self.explainer.expected_value) > 1 else self.explainer.expected_value[0])
            else:
                self.expected_value = float(self.explainer.expected_value)
                
            # Compute SHAP values
            shap_output = self.explainer.shap_values(self.explanation_data)
            
            # Handle list output (multi-class logic even for binary sometimes in shap)
            if isinstance(shap_output, list):
                self.shap_values = shap_output[1] if len(shap_output) > 1 else shap_output[0]
            else:
                self.shap_values = shap_output
                
            self.timings['compute_shap_values'] = time.time() - t0
            self._record_memory("after_shap_computation")
            
            # Interaction values conditionally
            num_features = len(self.features)
            if num_features <= 300:
                self.logger.info(f"Feature count ({num_features}) <= 300. Computing interaction values...")
                t1 = time.time()
                interaction_output = self.explainer.shap_interaction_values(self.explanation_data)
                if isinstance(interaction_output, list):
                    self.shap_interaction_values = interaction_output[1] if len(interaction_output) > 1 else interaction_output[0]
                else:
                    self.shap_interaction_values = interaction_output
                self.timings['compute_interaction_values'] = time.time() - t1
                self._record_memory("after_interaction_computation")
            else:
                self.logger.info(f"Feature count ({num_features}) > 300. Skipping interaction values for memory/time efficiency.")
                self.shap_interaction_values = None
                
        except Exception as e:
            raise ExplainabilityError(f"Failed to compute SHAP values: {e}")
            
        finally:
            gc.collect()

    def _generate_global_explanations(self):
        """Generates global explainability metrics and comparisons."""
        self.logger.info("Generating global explanations...")
        t0 = time.time()
        
        try:
            # Mean absolute SHAP
            mean_abs_shap = np.abs(self.shap_values).mean(axis=0)
            median_shap = np.median(np.abs(self.shap_values), axis=0)
            std_shap = np.std(self.shap_values, axis=0)
            max_shap = np.max(self.shap_values, axis=0)
            min_shap = np.min(self.shap_values, axis=0)
            
            importance_df = pd.DataFrame({
                'feature': self.features,
                'mean_abs_shap': mean_abs_shap,
                'median_abs_shap': median_shap,
                'std_shap': std_shap,
                'max_shap': max_shap,
                'min_shap': min_shap
            })
            
            # XGBoost native importance
            xgb_importance_dict = self.model.get_booster().get_score(importance_type='gain')
            xgb_imp_df = pd.DataFrame({
                'feature': list(xgb_importance_dict.keys()),
                'xgb_gain': list(xgb_importance_dict.values())
            })
            
            importance_df = importance_df.merge(xgb_imp_df, on='feature', how='left').fillna(0)
            importance_df = importance_df.sort_values(by='mean_abs_shap', ascending=False).reset_index(drop=True)
            
            # Compute Spearman correlation
            spearman_corr, p_value = spearmanr(importance_df['mean_abs_shap'], importance_df['xgb_gain'])
            self.logger.info(f"Spearman correlation between SHAP and XGBoost importance: {spearman_corr:.4f}")
            
            # Identify Drift / Disagreement
            importance_df['shap_rank'] = importance_df['mean_abs_shap'].rank(ascending=False)
            importance_df['xgb_rank'] = importance_df['xgb_gain'].rank(ascending=False)
            importance_df['rank_diff'] = np.abs(importance_df['shap_rank'] - importance_df['xgb_rank'])
            
            self.global_importance = importance_df
            self.business_insights['spearman_correlation'] = spearman_corr
            self.business_insights['correlation_p_value'] = p_value
            self.business_insights['top_disagreements'] = importance_df.sort_values('rank_diff', ascending=False).head(10)['feature'].tolist()
            
            self.timings['global_explanations'] = time.time() - t0
        except Exception as e:
            raise ExplainabilityError(f"Error generating global explanations: {e}")

    def _generate_business_insights(self):
        """Extracts actionable business insights from SHAP values."""
        self.logger.info("Generating business insights...")
        
        top_10 = self.global_importance.head(10)['feature'].tolist()
        
        # Fraud drivers (positive SHAP means driving prediction towards 1)
        mean_shap = np.mean(self.shap_values, axis=0)
        driver_df = pd.DataFrame({'feature': self.features, 'mean_shap': mean_shap})
        
        top_fraud_drivers = driver_df.sort_values('mean_shap', ascending=False).head(10)['feature'].tolist()
        top_legit_drivers = driver_df.sort_values('mean_shap', ascending=True).head(10)['feature'].tolist()
        
        # Sparsity
        zero_shap_ratio = (self.shap_values == 0).mean(axis=0)
        sparsity_df = pd.DataFrame({'feature': self.features, 'sparsity': zero_shap_ratio})
        weak_features = sparsity_df[sparsity_df['sparsity'] > 0.9]['feature'].tolist()
        
        self.business_insights.update({
            'most_influential_overall': top_10,
            'top_fraud_drivers': top_fraud_drivers,
            'top_legit_drivers': top_legit_drivers,
            'weak_features': weak_features,
            'potential_removable_features': len(weak_features),
            'average_features_influencing': float(np.mean((self.shap_values != 0).sum(axis=1)))
        })
        
    def _get_predictions_and_probabilities(self) -> Tuple[np.ndarray, np.ndarray, float]:
        """Gets predictions and calibrated probabilities for the explanation dataset."""
        self.logger.info("Generating predictions for local explanations...")
        
        # Using the original XGBoost predict_proba since that's what the calibrator was fit on
        raw_probs = self.model.predict_proba(self.explanation_data)[:, 1] if hasattr(self.model, "predict_proba") else self.model.predict(self.explanation_data)
        
        # Calibrate probabilities
        if hasattr(self.calibrator, "predict_proba"):
            calibrated_probs = self.calibrator.predict_proba(self.explanation_data)[:, 1]
        elif hasattr(self.calibrator, "transform"):
            calibrated_probs = self.calibrator.transform(raw_probs)
        elif hasattr(self.calibrator, "predict"):
            calibrated_probs = self.calibrator.predict(raw_probs)
        else:
            raise ExplainabilityError("Unsupported probability calibrator.")
            
        threshold = self.threshold_config.get("recommended_threshold", 0.5)
        predictions = (calibrated_probs >= threshold).astype(int)
        
        return predictions, calibrated_probs, threshold

    def _generate_local_explanations(self):
        """Generates local explanations for key instances."""
        self.logger.info("Generating local explanations...")
        t0 = time.time()
        
        try:
            predictions, probs, threshold = self._get_predictions_and_probabilities()
            
            results_df = pd.DataFrame({
                'TransactionID': self.explanation_ids.values,
                'Actual': self.explanation_target.values,
                'Probability': probs,
                'Prediction': predictions,
                'Index': np.arange(len(probs))
            })
            
            top_fraud_idx = results_df.nlargest(10, 'Probability')['Index'].tolist()
            top_legit_idx = results_df.nsmallest(10, 'Probability')['Index'].tolist()
            
            false_positives = results_df[(results_df['Actual'] == 0) & (results_df['Prediction'] == 1)]
            top_fp_idx = false_positives.nlargest(10, 'Probability')['Index'].tolist()
            
            false_negatives = results_df[(results_df['Actual'] == 1) & (results_df['Prediction'] == 0)]
            top_fn_idx = false_negatives.nsmallest(10, 'Probability')['Index'].tolist()
            
            misclassified = pd.concat([false_positives, false_negatives]).sort_values('Probability', ascending=False)
            top_misclassified_idx = misclassified.head(20)['Index'].tolist()
            
            def extract_explanation(idx: int) -> Dict[str, Any]:
                row_shap = self.shap_values[idx]
                
                feature_contrib = list(zip(self.features, row_shap))
                feature_contrib.sort(key=lambda x: x[1], reverse=True)
                
                top_pos = [{'feature': f, 'contribution': float(v)} for f, v in feature_contrib[:5] if v > 0]
                top_neg = [{'feature': f, 'contribution': float(v)} for f, v in feature_contrib[-5:] if v < 0]
                
                return {
                    'TransactionID': str(results_df.iloc[idx]['TransactionID']),
                    'Actual': int(results_df.iloc[idx]['Actual']),
                    'Prediction': int(results_df.iloc[idx]['Prediction']),
                    'Probability': float(results_df.iloc[idx]['Probability']),
                    'Threshold': float(threshold),
                    'Expected_Value': self.expected_value,
                    'Top_Positive_Contributors': top_pos,
                    'Top_Negative_Contributors': top_neg
                }
                
            self.logger.info("Extracting standard local explanations...")
            for idx in set(top_fraud_idx + top_legit_idx):
                self.local_explanations.append(extract_explanation(idx))
                
            self.logger.info("Extracting misclassification explanations...")
            for idx in set(top_fp_idx + top_fn_idx + top_misclassified_idx):
                self.misclassification_explanations.append(extract_explanation(idx))
                
            self.timings['local_explanations'] = time.time() - t0
        except Exception as e:
            raise ExplainabilityError(f"Error generating local explanations: {e}")

    def _generate_visualizations(self):
        """Generates all required SHAP plots."""
        self.logger.info("Generating SHAP visualizations...")
        t0 = time.time()
        
        try:
            plt.ioff()
            
            # Summary Bar
            shap.summary_plot(self.shap_values, self.explanation_data, plot_type="bar", show=False)
            plt.savefig(os.path.join(self.plots_dir, "shap_summary_bar.png"), dpi=300, bbox_inches='tight')
            plt.close()
            
            # Summary Beeswarm
            shap.summary_plot(self.shap_values, self.explanation_data, show=False)
            plt.savefig(os.path.join(self.plots_dir, "shap_summary_beeswarm.png"), dpi=300, bbox_inches='tight')
            plt.close()
            
            # Dependence Plot Top 10
            top_1 = self.global_importance.iloc[0]['feature']
            shap.dependence_plot(top_1, self.shap_values, self.explanation_data, show=False)
            plt.savefig(os.path.join(self.plots_dir, "shap_dependence_top10.png"), dpi=300, bbox_inches='tight')
            plt.close()
            
            # Heatmap
            shap.plots.heatmap(shap.Explanation(values=self.shap_values, base_values=self.expected_value, data=self.explanation_data, feature_names=self.features), show=False)
            plt.savefig(os.path.join(self.plots_dir, "shap_heatmap.png"), dpi=300, bbox_inches='tight')
            plt.close()
            
            # Decision Plot (subset for clarity)
            rng = np.random.default_rng(self.random_state)
            subset_idx = rng.choice(len(self.shap_values), min(50, len(self.shap_values)), replace=False)
            shap.decision_plot(self.expected_value, self.shap_values[subset_idx], self.explanation_data.iloc[subset_idx], show=False)
            plt.savefig(os.path.join(self.plots_dir, "shap_decision_plot.png"), dpi=300, bbox_inches='tight')
            plt.close()
            
            # Violin Plot
            shap.summary_plot(self.shap_values, self.explanation_data, plot_type="violin", show=False)
            plt.savefig(os.path.join(self.plots_dir, "shap_violin_plot.png"), dpi=300, bbox_inches='tight')
            plt.close()
            
            # Feature Importance Comparison
            plt.figure(figsize=(10, 6))
            sns.scatterplot(data=self.global_importance.head(20), x='mean_abs_shap', y='xgb_gain')
            plt.title('SHAP vs XGBoost Native Importance (Top 20)')
            plt.xlabel('Mean Absolute SHAP')
            plt.ylabel('XGBoost Gain')
            plt.savefig(os.path.join(self.plots_dir, "feature_importance_comparison.png"), dpi=300, bbox_inches='tight')
            plt.close()
            
            # Local explanations (waterfalls and force plots)
            predictions, probs, threshold = self._get_predictions_and_probabilities()
            fraud_idx = np.argmax(probs)
            legit_idx = np.argmin(probs)
            
            # Top Fraud
            exp_fraud = shap.Explanation(values=self.shap_values[fraud_idx], base_values=self.expected_value, data=self.explanation_data.iloc[fraud_idx], feature_names=self.features)
            shap.plots.waterfall(exp_fraud, show=False)
            plt.savefig(os.path.join(self.plots_dir, "shap_waterfall_top_fraud.png"), dpi=300, bbox_inches='tight')
            plt.close()
            shap.save_html(os.path.join(self.plots_dir, "shap_force_top_fraud.html"), shap.force_plot(self.expected_value, self.shap_values[fraud_idx], self.explanation_data.iloc[fraud_idx], feature_names=self.features))
            
            # Top Legit
            exp_legit = shap.Explanation(values=self.shap_values[legit_idx], base_values=self.expected_value, data=self.explanation_data.iloc[legit_idx], feature_names=self.features)
            shap.plots.waterfall(exp_legit, show=False)
            plt.savefig(os.path.join(self.plots_dir, "shap_waterfall_top_legitimate.png"), dpi=300, bbox_inches='tight')
            plt.close()
            shap.save_html(os.path.join(self.plots_dir, "shap_force_top_legitimate.html"), shap.force_plot(self.expected_value, self.shap_values[legit_idx], self.explanation_data.iloc[legit_idx], feature_names=self.features))
            
            # Interaction Heatmap conditionally
            if self.shap_interaction_values is not None:
                plt.figure(figsize=(12, 10))
                mean_interaction = np.abs(self.shap_interaction_values).mean(axis=0)
                sns.heatmap(mean_interaction[:20, :20], xticklabels=self.features[:20], yticklabels=self.features[:20], cmap="viridis")
                plt.title("SHAP Interaction Values (Top 20 Features)")
                plt.savefig(os.path.join(self.plots_dir, "shap_interaction_heatmap.png"), dpi=300, bbox_inches='tight')
                plt.close()
                
            self.timings['visualizations'] = time.time() - t0
        except Exception as e:
            self.logger.warning(f"Error during visualization generation: {e}")
            traceback.print_exc()

    def _generate_reports(self):
        """Generates required reports and artifacts."""
        self.logger.info("Generating reports...")
        t0 = time.time()
        
        try:
            # 1. shap_feature_importance.csv and json
            self.global_importance.to_csv(os.path.join(self.report_dir, "shap_feature_importance.csv"), index=False)
            self.global_importance.to_json(os.path.join(self.report_dir, "shap_feature_importance.json"), orient="records", indent=4)
            
            # 2. local_explanations.csv and misclassification_explanations.csv
            pd.DataFrame(self.local_explanations).to_csv(os.path.join(self.report_dir, "local_explanations.csv"), index=False)
            pd.DataFrame(self.misclassification_explanations).to_csv(os.path.join(self.report_dir, "misclassification_explanations.csv"), index=False)
            
            # 3. feature_importance_comparison.csv
            comparison_df = self.global_importance[['feature', 'shap_rank', 'xgb_rank', 'rank_diff']]
            comparison_df.to_csv(os.path.join(self.report_dir, "feature_importance_comparison.csv"), index=False)
            
            # 4. shap_summary_statistics.json
            summary_stats = {
                "expected_value": self.expected_value,
                "mean_abs_shap": self.global_importance['mean_abs_shap'].mean(),
                "max_shap_value": float(self.global_importance['max_shap'].max()),
                "min_shap_value": float(self.global_importance['min_shap'].min()),
                "feature_count": len(self.features),
                "business_insights": self.business_insights
            }
            with open(os.path.join(self.report_dir, "shap_summary_statistics.json"), "w") as f:
                json.dump(self._json_safe(summary_stats), f, indent=4)
                
            # 5. shap_metadata.json
            metadata = {
                "pipeline_version": self.model_metadata.get("pipeline_version", "1.0.0"),
                "timestamp": datetime.datetime.now().isoformat(),
                "model_version": self.model_metadata.get("model_version", "latest"),
                "calibration_version": self.calibration_metadata.get("version", "latest"),
                "threshold_version": self.threshold_config.get("version", "latest"),
                "shap_version": shap.__version__,
                "random_seed": self.random_state,
                "dataset_shape": [int(self.df.shape[0]), int(self.df.shape[1])],
                "explained_samples": len(self.explanation_data),
                "background_samples": len(self.background_data),
                "expected_value": self.expected_value,
                "feature_count": len(self.features),
                "top_feature": self.global_importance.iloc[0]['feature'],
                "execution_time_seconds": float(sum(self.timings.values())),
                "memory_usage_mb": self.memory_usage
            }
            with open(os.path.join(self.artifacts_dir, "shap_metadata.json"), "w") as f:
                json.dump(self._json_safe(metadata), f, indent=4)
                
            # 6. shap_explainability_report.json
            report = {
                "input_validation": "SUCCESS",
                "output_validation": "PENDING",
                "execution_summary": {
                    "status": "COMPLETED",
                    "total_time": float(sum(self.timings.values())),
                    "memory": self.memory_usage,
                    "background_sample_size": len(self.background_data),
                    "explanation_sample_size": len(self.explanation_data)
                },
                "top_features": self.global_importance.head(20).to_dict(orient="records"),
                "business_insights": self.business_insights,
                "global_explainability": summary_stats,
                "local_explainability": {
                    "num_local_explanations": len(self.local_explanations),
                    "num_misclassifications_explained": len(self.misclassification_explanations)
                },
                "warnings": [],
                "notes": [
                    "SHAP explanations are generated on the underlying XGBoost model. Probability calibration is not included in the SHAP attribution."
                ],
                "recommendations": ["Review top disagreements between SHAP and XGBoost importance."] if len(self.business_insights.get('top_disagreements', [])) > 0 else []
            }
            with open(os.path.join(self.report_dir, "shap_explainability_report.json"), "w") as f:
                json.dump(self._json_safe(report), f, indent=4)
                
            self.timings['generate_reports'] = time.time() - t0
        except Exception as e:
            raise ExplainabilityError(f"Error generating reports: {e}")

    def _validate_outputs(self):
        """Validates that all expected outputs were correctly generated."""
        self.logger.info("Validating output artifacts...")
        
        expected_files = [
            os.path.join(self.report_dir, "shap_explainability_report.json"),
            os.path.join(self.report_dir, "shap_summary_statistics.json"),
            os.path.join(self.report_dir, "shap_feature_importance.csv"),
            os.path.join(self.report_dir, "shap_feature_importance.json"),
            os.path.join(self.report_dir, "local_explanations.csv"),
            os.path.join(self.report_dir, "misclassification_explanations.csv"),
            os.path.join(self.report_dir, "feature_importance_comparison.csv"),
            os.path.join(self.artifacts_dir, "shap_metadata.json"),
            os.path.join(self.plots_dir, "shap_summary_bar.png"),
            os.path.join(self.plots_dir, "shap_summary_beeswarm.png"),
            os.path.join(self.plots_dir, "shap_waterfall_top_fraud.png"),
            os.path.join(self.plots_dir, "shap_waterfall_top_legitimate.png"),
            os.path.join(self.plots_dir, "shap_force_top_fraud.html"),
            os.path.join(self.plots_dir, "shap_force_top_legitimate.html"),
            os.path.join(self.plots_dir, "shap_dependence_top10.png"),
            os.path.join(self.plots_dir, "shap_heatmap.png"),
            os.path.join(self.plots_dir, "feature_importance_comparison.png"),
            os.path.join(self.plots_dir, "shap_decision_plot.png"),
            os.path.join(self.plots_dir, "shap_violin_plot.png")
        ]
        
        if self.shap_interaction_values is not None:
            expected_files.append(os.path.join(self.plots_dir, "shap_interaction_heatmap.png"))
            
        for file_path in expected_files:
            if not os.path.exists(file_path):
                raise ExplainabilityError(f"Output validation failed. Missing file: {file_path}")
            if os.path.getsize(file_path) == 0:
                raise ExplainabilityError(f"Output validation failed. File is empty: {file_path}")
                
            # Validate HTML files
            if file_path.endswith('.html'):
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    if "<html" not in content.lower() and "shap" not in content.lower():
                        raise ExplainabilityError(f"Output validation failed. Invalid HTML content in {file_path}")
                
        # Validate CSV properties
        df_imp = pd.read_csv(os.path.join(self.report_dir, "shap_feature_importance.csv"))
        if df_imp.isnull().any().any():
            raise ExplainabilityError("NaN values found in generated shap_feature_importance.csv")
            
        # Update final report status
        report_path = os.path.join(self.report_dir, "shap_explainability_report.json")
        with open(report_path, 'r') as f:
            report = json.load(f)
        report['output_validation'] = "SUCCESS"
        with open(report_path, 'w') as f:
            json.dump(self._json_safe(report), f, indent=4)
            
        self.logger.info("Output validation successful.")

    def run(self):
        """Executes the SHAP explainability pipeline stage."""
        self.run_start_time = time.time()
        self.logger.info("Starting SHAP Explainability Generation...")
        
        try:
            self._record_memory("start")
            self._load_metadata()
            self._load_model()
            self._load_dataset()
            self._sample_data()
            self._compute_shap_values()
            self._generate_global_explanations()
            self._generate_business_insights()
            self._generate_local_explanations()
            self._generate_visualizations()
            self._generate_reports()
            self._validate_outputs()
            
            total_time = time.time() - self.run_start_time
            if total_time > 600:
                self.logger.warning(f"Runtime exceeded 10 minutes: {total_time:.2f}s")
                
            self.logger.info(f"SHAP Explainability completed successfully in {total_time:.2f}s.")
            
        except Exception as e:
            self.logger.error(f"SHAP Explainability failed: {e}")
            traceback.print_exc()
            raise


if __name__ == "__main__":
    generator = ExplainabilityGenerator()
    generator.run()
