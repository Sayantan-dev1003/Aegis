package model

import "time"

type ModelVersion struct {
	ID           string     `json:"id" db:"id"`
	Version      string     `json:"version" db:"version"`
	ArtifactPath string     `json:"artifact_path" db:"artifact_path"`
	IsActive     bool       `json:"is_active" db:"is_active"`
	F1Score      float64    `json:"f1_score" db:"f1_score"`
	Precision    float64    `json:"precision" db:"precision"`
	Recall       float64    `json:"recall" db:"recall"`
	Accuracy     float64    `json:"accuracy" db:"accuracy"`
	RocAuc       float64    `json:"roc_auc" db:"roc_auc"`
	PrAuc        float64    `json:"pr_auc" db:"pr_auc"`
	TrainedAt    time.Time  `json:"trained_at" db:"trained_at"`
	DeployedAt   *time.Time `json:"deployed_at" db:"deployed_at"`
}
