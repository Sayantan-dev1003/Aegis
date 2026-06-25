package main

import (
	"context"
	"os"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/config"
	"github.com/Sayantan-dev1003/aegis/api/internal/database"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	// Initialize Zerolog (JSON output)
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = zerolog.New(os.Stdout).With().Timestamp().Logger()

	cfg := config.Load()

	// Try relative paths to locate seed script
	seedScriptPath := "scripts/seed_analysts.sql"
	if _, err := os.Stat(seedScriptPath); os.IsNotExist(err) {
		seedScriptPath = "../../scripts/seed_analysts.sql"
	}

	log.Info().Str("path", seedScriptPath).Msg("Reading seed script...")
	content, err := os.ReadFile(seedScriptPath)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to read seed script file")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	log.Info().Msg("Connecting to PostgreSQL...")
	pgPool, err := database.ConnectPostgres(ctx, cfg.PostgresHost, cfg.PostgresPort, cfg.PostgresUser, cfg.PostgresPassword, cfg.PostgresDB)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to PostgreSQL")
	}
	defer pgPool.Close()

	log.Info().Msg("Executing seeding queries...")
	_, err = pgPool.Exec(ctx, string(content))
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to execute seed queries")
	}

	log.Info().Msg("Database seeded successfully!")
}
