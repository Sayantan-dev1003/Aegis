package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

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
	dbPool, err := database.ConnectPostgres(ctx, cfg.PostgresHost, cfg.PostgresPort, cfg.PostgresUser, cfg.PostgresPassword, cfg.PostgresDB)
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

	// Create new version string
	newVersion := fmt.Sprintf("v%s-manual", time.Now().Format("20060102.1504"))
	deploymentPath := filepath.Join(mlWorkerDir, "deployment")

	id := uuid.New().String()

	fmt.Printf("Registering model %s to database...\n", newVersion)

	err = modelRepo.CreateVersion(
		ctx,
		id,
		newVersion,
		deploymentPath,
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

	fmt.Printf("Success! Model %s (ID: %s) successfully registered in the database.\n", newVersion, id)
}
