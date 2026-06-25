package main

import (
	"errors"
	"fmt"
	"os"

	"github.com/Sayantan-dev1003/aegis/api/internal/config"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	// Initialize Zerolog (JSON output)
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = zerolog.New(os.Stdout).With().Timestamp().Logger()

	cfg := config.Load()

	migrationsPath := os.Getenv("MIGRATIONS_PATH")
	if migrationsPath == "" {
		migrationsPath = cfg.MigrationsPath
	}

	command := "up"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		cfg.PostgresUser, cfg.PostgresPassword, cfg.PostgresHost, cfg.PostgresPort, cfg.PostgresDB)

	m, err := migrate.New("file://"+migrationsPath, dsn)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize migrate instance")
	}
	defer m.Close()

	switch command {
	case "up":
		log.Info().Str("path", migrationsPath).Msg("Applying up migrations...")
		if err := m.Up(); err != nil {
			if errors.Is(err, migrate.ErrNoChange) {
				log.Info().Msg("No migrations to apply")
				return
			}
			log.Fatal().Err(err).Msg("Failed to apply migrations")
		}
		log.Info().Msg("Migrations applied successfully")
	case "down":
		log.Info().Str("path", migrationsPath).Msg("Reverting migrations...")
		if err := m.Down(); err != nil {
			if errors.Is(err, migrate.ErrNoChange) {
				log.Info().Msg("No migrations to revert")
				return
			}
			log.Fatal().Err(err).Msg("Failed to revert migrations")
		}
		log.Info().Msg("Migrations reverted successfully")
	default:
		log.Fatal().Str("command", command).Msg("Unknown migration command. Use 'up' or 'down'")
	}
}
