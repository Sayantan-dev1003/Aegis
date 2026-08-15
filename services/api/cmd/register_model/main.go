package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/Sayantan-dev1003/aegis/api/internal/config"
	"github.com/Sayantan-dev1003/aegis/api/internal/database"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/google/uuid"
)

func main() {
	// Load config
	cfg := config.Load()

	ctx := context.Background()

	// Connect to Postgres
	dbPool, err := database.ConnectPostgres(ctx, cfg.PostgresHost, cfg.PostgresPort, cfg.PostgresUser, cfg.PostgresPassword, cfg.PostgresDB, cfg.PostgresSSLMode)
	if err != nil {
		log.Fatalf("Failed to connect to postgres: %v", err)
	}
	defer dbPool.Close()

	modelRepo := repository.NewModelRepository(dbPool)

	// We assume this script is run from services/api
	cwd, _ := os.Getwd()
	mlWorkerDir := filepath.Join(cwd, "..", "ml-worker")
	if os.Getenv("ML_WORKER_DIR") != "" {
		mlWorkerDir = os.Getenv("ML_WORKER_DIR")
	}

	// 1. Parse model metadata
	metadataPath := filepath.Join(mlWorkerDir, "artifacts", "model_metadata.json")
	metadataFile, err := os.ReadFile(metadataPath)
	if err != nil {
		log.Fatalf("Failed to read model_metadata.json: %v\nRun the pipeline first.", err)
	}

	var metadata map[string]interface{}
	if err := json.Unmarshal(metadataFile, &metadata); err != nil {
		log.Fatalf("Failed to unmarshal model_metadata.json: %v", err)
	}

	f1Score, _ := metadata["f1_score"].(float64)
	precision, _ := metadata["precision"].(float64)
	recall, _ := metadata["recall"].(float64)
	accuracy, _ := metadata["accuracy"].(float64)
	rocAuc, _ := metadata["roc_auc"].(float64)
	prAuc, _ := metadata["pr_auc"].(float64)

	// 2. Read threshold metrics
	thresholdPath := filepath.Join(mlWorkerDir, "reports", "threshold_analysis.json")
	thresholdBytes, err := os.ReadFile(thresholdPath)
	if err != nil {
		log.Printf("Warning: Failed to read threshold_analysis.json, using empty array. Err: %v", err)
		thresholdBytes = []byte("[]")
	}

	// 3. Read SHAP metrics
	shapPath := filepath.Join(mlWorkerDir, "reports", "shap_feature_importance.json")
	shapBytes, err := os.ReadFile(shapPath)
	if err != nil {
		log.Printf("Warning: Failed to read shap_feature_importance.json, using empty array. Err: %v", err)
		shapBytes = []byte("[]")
	}

	// 4. Read deployment_config.json to get deployment_version
	depConfigPath := filepath.Join(mlWorkerDir, "deployment", "deployment_config.json")
	depConfigBytes, err := os.ReadFile(depConfigPath)
	var newVersion string
	if err == nil {
		var depConfig map[string]interface{}
		if err := json.Unmarshal(depConfigBytes, &depConfig); err == nil {
			if ver, ok := depConfig["deployment_version"].(string); ok && ver != "" {
				newVersion = ver
			}
		}
	}
	if newVersion == "" {
		newVersion = "Aegis-1.0.0"
	}

	// 5. Determine artifact path (default to container path "/app/deployment", overridable via ARTIFACT_PATH env var)
	artifactPath := "/app/deployment"
	if os.Getenv("ARTIFACT_PATH") != "" {
		artifactPath = os.Getenv("ARTIFACT_PATH")
	}

	id := uuid.New().String()

	fmt.Printf("Registering model %s (artifact path: %s) to database...\n", newVersion, artifactPath)

	err = modelRepo.CreateVersion(
		ctx,
		id,
		newVersion,
		artifactPath,
		f1Score,
		precision,
		recall,
		accuracy,
		rocAuc,
		prAuc,
		thresholdBytes,
		shapBytes,
	)
	if err != nil {
		log.Fatalf("Failed to insert new model version: %v", err)
	}

	fmt.Printf("Activating model %s (ID: %s)...\n", newVersion, id)
	if err := modelRepo.Deploy(ctx, id); err != nil {
		log.Fatalf("Failed to activate model version %s: %v", id, err)
	}

	fmt.Printf("Success! Model %s (ID: %s) successfully registered and activated in the database.\n", newVersion, id)
}
