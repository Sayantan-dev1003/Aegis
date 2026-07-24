ALTER TABLE model_versions
ADD COLUMN threshold_metrics JSONB,
ADD COLUMN shap_importance JSONB;
