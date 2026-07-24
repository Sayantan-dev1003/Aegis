package repository

import (
	"context"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ModelRepository struct {
	db *pgxpool.Pool
}

func NewModelRepository(db *pgxpool.Pool) *ModelRepository {
	return &ModelRepository{db: db}
}

func (r *ModelRepository) List(ctx context.Context) ([]model.ModelVersion, error) {
	query := `
		SELECT id, version, artifact_path, is_active, f1_score, precision, recall, accuracy, roc_auc, pr_auc, trained_at, deployed_at
		FROM model_versions
		ORDER BY trained_at DESC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var models []model.ModelVersion
	for rows.Next() {
		var m model.ModelVersion
		err := rows.Scan(
			&m.ID, &m.Version, &m.ArtifactPath, &m.IsActive, &m.F1Score, &m.Precision, &m.Recall, &m.Accuracy, &m.RocAuc, &m.PrAuc, &m.TrainedAt, &m.DeployedAt,
		)
		if err != nil {
			return nil, err
		}
		models = append(models, m)
	}
	return models, nil
}

func (r *ModelRepository) GetByID(ctx context.Context, id string) (*model.ModelVersion, error) {
	query := `
		SELECT id, version, artifact_path, is_active, f1_score, precision, recall, accuracy, roc_auc, pr_auc, trained_at, deployed_at
		FROM model_versions
		WHERE id = $1
	`
	var m model.ModelVersion
	err := r.db.QueryRow(ctx, query, id).Scan(
		&m.ID, &m.Version, &m.ArtifactPath, &m.IsActive, &m.F1Score, &m.Precision, &m.Recall, &m.Accuracy, &m.RocAuc, &m.PrAuc, &m.TrainedAt, &m.DeployedAt,
	)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *ModelRepository) GetActive(ctx context.Context) (*model.ModelVersion, error) {
	query := `
		SELECT id, version, artifact_path, is_active, f1_score, precision, recall, accuracy, roc_auc, pr_auc, trained_at, deployed_at
		FROM model_versions
		WHERE is_active = true
		LIMIT 1
	`
	var m model.ModelVersion
	err := r.db.QueryRow(ctx, query).Scan(
		&m.ID, &m.Version, &m.ArtifactPath, &m.IsActive, &m.F1Score, &m.Precision, &m.Recall, &m.Accuracy, &m.RocAuc, &m.PrAuc, &m.TrainedAt, &m.DeployedAt,
	)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *ModelRepository) Deploy(ctx context.Context, id string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Deactivate current active model
	_, err = tx.Exec(ctx, `UPDATE model_versions SET is_active = false WHERE is_active = true`)
	if err != nil {
		return err
	}

	// Activate new model
	_, err = tx.Exec(ctx, `UPDATE model_versions SET is_active = true, deployed_at = NOW() WHERE id = $1`, id)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *ModelRepository) Rollback(ctx context.Context, id string) error {
	// Functionally the same as deploy, but named rollback for semantic clarity
	return r.Deploy(ctx, id)
}

func (r *ModelRepository) CreateVersion(ctx context.Context, id, version, artifactPath string, f1Score, precision, recall, accuracy, rocAuc, prAuc float64, thresholdMetrics []byte, shapImportance []byte) error {
	query := `
		INSERT INTO model_versions (id, version, artifact_path, is_active, f1_score, precision, recall, accuracy, roc_auc, pr_auc, trained_at, threshold_metrics, shap_importance)
		VALUES ($1, $2, $3, false, $4, $5, $6, $7, $8, $9, NOW(), $10, $11)
	`
	_, err := r.db.Exec(ctx, query, id, version, artifactPath, f1Score, precision, recall, accuracy, rocAuc, prAuc, thresholdMetrics, shapImportance)
	return err
}

func (r *ModelRepository) GetActiveMetrics(ctx context.Context) (*model.ModelVersion, error) {
	query := `
		SELECT threshold_metrics, shap_importance
		FROM model_versions
		WHERE is_active = true
		LIMIT 1
	`
	var m model.ModelVersion
	err := r.db.QueryRow(ctx, query).Scan(&m.ThresholdMetrics, &m.ShapImportance)
	if err != nil {
		return nil, err
	}
	return &m, nil
}
