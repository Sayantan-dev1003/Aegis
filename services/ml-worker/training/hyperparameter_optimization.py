"""
Aegis - Real-Time Fraud Detection System
Module: Hyperparameter Optimization

This module discovers optimal XGBoost hyperparameters using Optuna to maximize 
Validation PR-AUC, while ensuring deterministic behavior, preventing data leakage, 
and providing robust failure recovery and memory management.
"""

import os
import gc
import json
import time
import logging
import datetime
import platform
import argparse
import random
import traceback
import typing
from typing import Dict, Any, List

import numpy as np
import pandas as pd
import joblib
import xgboost as xgb
from xgboost import XGBClassifier
import optuna
from optuna.pruners import MedianPruner
from optuna.samplers import TPESampler
from sklearn.metrics import (
    precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, 
    matthews_corrcoef, log_loss, brier_score_loss
)

try:
    import matplotlib.pyplot as plt
    from optuna.visualization.matplotlib import (
        plot_optimization_history,
        plot_param_importances,
        plot_parallel_coordinate,
        plot_slice,
        plot_contour
    )
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False


class HyperparameterOptimizationError(Exception):
    """Custom exception for hyperparameter optimization errors."""
    pass


class HyperparameterOptimizer:
    """
    Production-grade Hyperparameter Optimization module for Aegis.
    Optimizes for Validation PR-AUC.
    """

    def __init__(
        self,
        train_path: str = "data/selected/train.parquet",
        val_path: str = "data/selected/validation.parquet",
        feature_metadata_path: str = "artifacts/feature_selector_metadata.json",
        artifact_dir: str = "artifacts",
        report_dir: str = "reports",
        plots_dir: str = "plots",
        n_trials: int = 100,
        random_state: int = 42
    ):
        self.train_path = train_path
        self.val_path = val_path
        self.feature_metadata_path = feature_metadata_path
        self.artifact_dir = artifact_dir
        self.report_dir = report_dir
        self.plots_dir = plots_dir
        self.n_trials = n_trials
        self.random_state = random_state

        self.logger = self._setup_logger()

        self.train_df: pd.DataFrame = pd.DataFrame()
        self.val_df: pd.DataFrame = pd.DataFrame()
        self.candidate_features: List[str] = []
        
        self.study_path = os.path.join(self.artifact_dir, "optuna_study.db")
        self.storage_url = f"sqlite:///{self.study_path}"
        self.study = None

    def _setup_logger(self) -> logging.Logger:
        logger = logging.getLogger(self.__class__.__name__)
        logger.setLevel(logging.INFO)
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger

    def _set_deterministic_seeds(self):
        """Sets random seeds for reproducibility."""
        random.seed(self.random_state)
        np.random.seed(self.random_state)
        os.environ['PYTHONHASHSEED'] = str(self.random_state)
        self.logger.info(f"Fixed random seeds to {self.random_state}")

    def load_data(self):
        """Loads and validates required datasets."""
        self.logger.info("Loading train and validation datasets...")
        if not os.path.exists(self.train_path) or not os.path.exists(self.val_path):
            raise HyperparameterOptimizationError("Train or validation dataset missing.")
            
        self.train_df = pd.read_parquet(self.train_path)
        self.val_df = pd.read_parquet(self.val_path)
        
        if not os.path.exists(self.feature_metadata_path):
            raise HyperparameterOptimizationError("Feature selector metadata missing.")
            
        with open(self.feature_metadata_path, 'r') as f:
            metadata = json.load(f)
            self.candidate_features = metadata.get("selected_features", [])
            
        if not self.candidate_features:
            raise HyperparameterOptimizationError("No candidate features found in metadata.")
            
        missing_train = set(self.candidate_features) - set(self.train_df.columns)
        missing_val = set(self.candidate_features) - set(self.val_df.columns)
        if missing_train or missing_val:
            raise HyperparameterOptimizationError(f"Features missing in dataset. Train: {missing_train}, Val: {missing_val}")

    def objective(self, trial: optuna.Trial) -> float:
        """Optuna objective function to maximize Validation PR-AUC."""
        
        # Hyperparameter Search Space
        param = {
            'max_depth': trial.suggest_int('max_depth', 3, 12),
            'min_child_weight': trial.suggest_int('min_child_weight', 1, 15),
            'gamma': trial.suggest_float('gamma', 0, 10),
            'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.30, log=True),
            'n_estimators': trial.suggest_int('n_estimators', 200, 2000),
            'subsample': trial.suggest_float('subsample', 0.5, 1.0),
            'colsample_bytree': trial.suggest_float('colsample_bytree', 0.5, 1.0),
            'colsample_bylevel': trial.suggest_float('colsample_bylevel', 0.5, 1.0),
            'reg_alpha': trial.suggest_float('reg_alpha', 0, 20),
            'reg_lambda': trial.suggest_float('reg_lambda', 0.1, 30, log=True),
            'scale_pos_weight': trial.suggest_float('scale_pos_weight', 10, 40),
            'max_delta_step': trial.suggest_int('max_delta_step', 0, 10),
            'grow_policy': trial.suggest_categorical('grow_policy', ['depthwise', 'lossguide']),
            'max_bin': trial.suggest_categorical('max_bin', [128, 256, 512]),
            # Fixed Parameters
            'tree_method': 'hist',
            'objective': 'binary:logistic',
            'eval_metric': 'aucpr',
            'random_state': self.random_state,
            'n_jobs': -1
        }
        
        X_train = self.train_df[self.candidate_features]
        y_train = self.train_df['isFraud']
        X_val = self.val_df[self.candidate_features]
        y_val = self.val_df['isFraud']
        
        model = None
        try:
            start_time = time.time()
            if 'early_stopping_rounds' in XGBClassifier().get_params():
                model = XGBClassifier(**param, early_stopping_rounds=100)
                model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
            else:
                model = XGBClassifier(**param)
                model.fit(X_train, y_train, eval_set=[(X_val, y_val)], early_stopping_rounds=100, verbose=False)
            
            val_probs = model.predict_proba(X_val)[:, 1]
            val_preds = (val_probs >= 0.5).astype(int)
            
            # Compute target metric
            pr_auc = float(average_precision_score(y_val, val_probs))
            
            # Compute other metrics
            roc_auc = float(roc_auc_score(y_val, val_probs))
            precision = float(precision_score(y_val, val_preds, zero_division=0))
            recall = float(recall_score(y_val, val_preds, zero_division=0))
            f1 = float(f1_score(y_val, val_preds, zero_division=0))
            mcc = float(matthews_corrcoef(y_val, val_preds))
            ll = float(log_loss(y_val, val_probs))
            brier = float(brier_score_loss(y_val, val_probs))
            best_iteration = getattr(model, 'best_iteration', getattr(model, 'best_iteration_', -1))
            training_time = time.time() - start_time
            
            # Store auxiliary metrics in trial
            trial.set_user_attr('roc_auc', roc_auc)
            trial.set_user_attr('precision', precision)
            trial.set_user_attr('recall', recall)
            trial.set_user_attr('f1', f1)
            trial.set_user_attr('mcc', mcc)
            trial.set_user_attr('log_loss', ll)
            trial.set_user_attr('brier_score', brier)
            trial.set_user_attr('best_iteration', best_iteration)
            trial.set_user_attr('training_time', training_time)
            
        except Exception as e:
            self.logger.error(f"Trial failed: {e}")
            raise optuna.TrialPruned() from e
        
        finally:
            if model is not None:
                del model
            del X_train, y_train, X_val, y_val
            gc.collect()

        return pr_auc

    def logging_callback(self, study: optuna.study.Study, trial: optuna.trial.FrozenTrial) -> None:
        """Callback to log progress per trial."""
        completed_trials = len([t for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE])
        total = self.n_trials
        
        best_val = study.best_value if study.best_trials else 0.0
        current_val = trial.value if trial.value is not None else 0.0
        
        elapsed = time.time() - self._start_time
        avg_time = elapsed / max(1, completed_trials)
        remaining = avg_time * (total - completed_trials)
        
        self.logger.info(
            f"Trial {completed_trials}/{total} | "
            f"Current PR-AUC: {current_val:.4f} | Best PR-AUC: {best_val:.4f} | "
            f"Elapsed: {elapsed:.1f}s | Est. Remaining: {remaining:.1f}s"
        )
        self.logger.info(f"Current Hyperparameters: {trial.params}")

    def run_optimization(self):
        """Runs or resumes Optuna study."""
        os.makedirs(self.artifact_dir, exist_ok=True)
        os.makedirs(self.report_dir, exist_ok=True)
        self._start_time = time.time()
        
        try:
            self.logger.info(f"Initializing Optuna study at {self.storage_url}...")
            sampler = TPESampler(seed=self.random_state)
            pruner = MedianPruner(n_startup_trials=5, n_warmup_steps=20)
            self.study = optuna.create_study(
                study_name="aegis_optimization",
                storage=self.storage_url,
                direction="maximize",
                sampler=sampler,
                pruner=pruner,
                load_if_exists=True
            )
        except Exception as e:
            self.logger.error(f"Failed to initialize study: {e}")
            raise HyperparameterOptimizationError("Could not initialize Optuna study.") from e
        
        trials_to_run = max(0, self.n_trials - len(self.study.trials))
        
        if trials_to_run > 0:
            self.logger.info(f"Running {trials_to_run} trials...")
            try:
                self.study.optimize(
                    self.objective, 
                    n_trials=trials_to_run,
                    callbacks=[self.logging_callback],
                    catch=(Exception,)
                )
            except KeyboardInterrupt:
                self.logger.warning("Optimization interrupted by user. State is safely saved in SQLite database.")
            except Exception as e:
                self.logger.error(f"Optimization error: {e}")
            finally:
                self.logger.info(f"Study state persisted at {self.study_path}")
        else:
            self.logger.info("Requested number of trials already completed in the loaded study.")

    def save_artifacts(self):
        """Validates and saves best hyperparameters, reports, and history."""
        self.logger.info("Validating and saving artifacts...")
        
        if self.study is None or len(self.study.best_trials) == 0:
            raise HyperparameterOptimizationError("Optuna study is empty or failed to find any valid trials.")
            
        best_trial = self.study.best_trial
        
        # Save best parameters
        best_params = best_trial.params.copy()
        best_params['tree_method'] = 'hist'
        best_params['objective'] = 'binary:logistic'
        best_params['eval_metric'] = 'aucpr'
        best_params['early_stopping_rounds'] = 100
        best_params['random_state'] = self.random_state
        best_params['n_jobs'] = -1
        
        params_path = os.path.join(self.artifact_dir, "best_hyperparameters.json")
        with open(params_path, "w") as f:
            json.dump(best_params, f, indent=4)
            
        # Optimization History CSV
        history_data = []
        for trial in self.study.trials:
            if trial.state != optuna.trial.TrialState.COMPLETE:
                continue
            row = {'Trial Number': trial.number, 'Validation PR-AUC': trial.value}
            row.update(trial.params)
            row.update(trial.user_attrs)
            history_data.append(row)
            
        if history_data:
            history_df = pd.DataFrame(history_data)
            history_path = os.path.join(self.report_dir, "optimization_history.csv")
            history_df.to_csv(history_path, index=False)
            
        # Best Trial Metrics
        best_metrics_path = os.path.join(self.artifact_dir, "best_trial_metrics.json")
        best_metrics = {'Validation PR-AUC': best_trial.value}
        best_metrics.update(best_trial.user_attrs)
        with open(best_metrics_path, "w") as f:
            json.dump(best_metrics, f, indent=4)
            
        # Report
        completed_trials = [t for t in self.study.trials if t.state == optuna.trial.TrialState.COMPLETE]
        pruned_trials = [t for t in self.study.trials if t.state == optuna.trial.TrialState.PRUNED]
        
        avg_time = sum(t.user_attrs.get('training_time', 0) for t in completed_trials) / max(1, len(completed_trials)) if completed_trials else 0
        worst_trial = min(completed_trials, key=lambda t: t.value) if completed_trials else None
        
        report = {
            "Pipeline Version": "Aegis-1.0.0",
            "Optimization Target": "Validation PR-AUC",
            "Search Space": {
                "max_depth": "3-12",
                "min_child_weight": "1-15",
                "learning_rate": "0.01-0.30 log",
                "n_estimators": "200-2000"
            },
            "Trials Completed": len(completed_trials),
            "Trials Pruned": len(pruned_trials),
            "Best Trial": best_trial.number,
            "Worst Trial": worst_trial.number if worst_trial else None,
            "Average Trial Time": avg_time,
            "Total Runtime": time.time() - self._start_time,
            "Best Hyperparameters": best_params,
            "Best Validation Metrics": best_metrics,
            "Seed": self.random_state,
            "Library Versions": {
                "optuna": optuna.__version__,
                "xgboost": xgb.__version__,
                "pandas": pd.__version__,
                "python": platform.python_version()
            }
        }
        
        report_path = os.path.join(self.report_dir, "optimization_report.json")
        with open(report_path, "w") as f:
            json.dump(report, f, indent=4)
            
        self.logger.info("Artifacts saved successfully.")

    def generate_visualizations(self):
        """Generates plots via Optuna's matplotlib visualization module."""
        if not MATPLOTLIB_AVAILABLE:
            self.logger.warning("Matplotlib not available. Skipping visualizations.")
            return
            
        self.logger.info("Generating visualizations...")
        try:
            fig1 = plot_optimization_history(self.study)
            plt.savefig(os.path.join(self.plots_dir, "optuna_history.png"), bbox_inches='tight')
            plt.close()
            
            fig2 = plot_param_importances(self.study)
            plt.savefig(os.path.join(self.plots_dir, "optuna_param_importance.png"), bbox_inches='tight')
            plt.close()
            
            fig3 = plot_parallel_coordinate(self.study)
            plt.savefig(os.path.join(self.plots_dir, "optuna_parallel_coordinate.png"), bbox_inches='tight')
            plt.close()
            
            top_params = [
                k for k, v in optuna.importance.get_param_importances(self.study).items()
            ][:2]
            
            if top_params:
                fig4 = plot_slice(self.study, params=top_params)
                plt.savefig(os.path.join(self.plots_dir, "optuna_slice.png"), bbox_inches='tight')
                plt.close()
                
                if len(top_params) >= 2:
                    fig5 = plot_contour(self.study, params=top_params)
                    plt.savefig(os.path.join(self.plots_dir, "optuna_contour.png"), bbox_inches='tight')
                    plt.close()
                    
            self.logger.info("Visualizations generated and saved.")
        except Exception as e:
            self.logger.error(f"Failed to generate visualizations: {e}")
            self.logger.debug(traceback.format_exc())

    def run(self):
        self._set_deterministic_seeds()
        self.load_data()
        self.run_optimization()
        self.save_artifacts()
        self.generate_visualizations()
        self.logger.info("Hyperparameter Optimization completed successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Aegis Hyperparameter Optimization")
    parser.add_argument("--trials", type=int, default=100, help="Number of trials (50, 100, 200, 500)")
    args = parser.parse_args()
    
    try:
        optimizer = HyperparameterOptimizer(n_trials=args.trials)
        optimizer.run()
    except Exception as e:
        logging.getLogger("HyperparameterOptimizer").error(f"Execution failed: {e}")
        import sys
        sys.exit(1)
