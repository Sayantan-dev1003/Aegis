package database

import (
	"errors"
	"fmt"
	"os"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/rs/zerolog/log"
)

// RunMigrations connects to PostgreSQL and applies all pending migrations from migrationsPath.
func RunMigrations(host, port, user, password, dbName, migrationsPath string) error {
	if migrationsPath == "" {
		migrationsPath = "migrations"
	}

	log.Info().Str("path", migrationsPath).Msg("Running database migrations...")

	// Verify migrations path exists
	if _, err := os.Stat(migrationsPath); os.IsNotExist(err) {
		return fmt.Errorf("migrations directory does not exist at path: %s", migrationsPath)
	}

	// Construct DSN specifically for golang-migrate's postgres driver
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, password, host, port, dbName)

	m, err := migrate.New("file://"+migrationsPath, dsn)
	if err != nil {
		return fmt.Errorf("failed to initialize migrate instance: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil {
		if errors.Is(err, migrate.ErrNoChange) {
			log.Info().Msg("No database migrations to apply")
			return nil
		}
		return fmt.Errorf("failed to apply migrations: %w", err)
	}

	log.Info().Msg("Database migrations applied successfully")
	return nil
}
