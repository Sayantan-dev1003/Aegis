Write-Host "Starting Aegis ML Pipeline..."

Set-Location -Path $PSScriptRoot

$python = ".\venv\Scripts\python.exe"

Write-Host "1/10: Preprocessing..."
& $python -m training.preprocessing
if ($LASTEXITCODE -ne 0) { throw "Pipeline failed at Preprocessing" }

Write-Host "2/10: Cleaning..."
& $python -m training.cleaning
if ($LASTEXITCODE -ne 0) { throw "Pipeline failed at Cleaning" }

Write-Host "3/10: Feature Engineering..."
& $python -m training.feature_engineering
if ($LASTEXITCODE -ne 0) { throw "Pipeline failed at Feature Engineering" }

Write-Host "4/10: Train / Validation Split..."
& $python -m training.split
if ($LASTEXITCODE -ne 0) { throw "Pipeline failed at Split" }

Write-Host "5/10: Missing Value Handler..."
& $python -m training.missing_value_handler
if ($LASTEXITCODE -ne 0) { throw "Pipeline failed at Missing Value Handler" }

Write-Host "6/10: Categorical Encoder..."
& $python -m training.categorical_encoder
if ($LASTEXITCODE -ne 0) { throw "Pipeline failed at Categorical Encoder" }

Write-Host "7/10: Feature Selection..."
& $python -m training.feature_selection
if ($LASTEXITCODE -ne 0) { throw "Pipeline failed at Feature Selection" }

Write-Host "8/10: Hyperparameter Optimization (Skipping in normal run)..."
& $python -m training.hyperparameter_optimization 
# ignoring exit code for optimization

Write-Host "9/14: Best Model Training (XGBoost)..."
& $python -m training.train
if ($LASTEXITCODE -ne 0) { throw "Pipeline failed at Training" }

Write-Host "10/14: Probability Calibration..."
& $python -m training.probability_calibration
if ($LASTEXITCODE -ne 0) { throw "Pipeline failed at Probability Calibration" }

Write-Host "11/14: Model Evaluation..."
& $python -m training.evaluate
if ($LASTEXITCODE -ne 0) { throw "Pipeline failed at Model Evaluation" }

Write-Host "12/14: Threshold Optimization..."
& $python -m training.threshold_optimizer
if ($LASTEXITCODE -ne 0) { throw "Pipeline failed at Threshold Optimization" }

Write-Host "13/14: SHAP Explainability..."
& $python -m training.shap_explainability 
if ($LASTEXITCODE -ne 0) { throw "Pipeline failed at SHAP Explainability" }

Write-Host "14/14: Export Artifacts (Packaging Deployment)..."
& $python -m training.export_artifacts
if ($LASTEXITCODE -ne 0) { throw "Pipeline failed at Export Artifacts" }

Write-Host "ML Pipeline Completed Successfully."
