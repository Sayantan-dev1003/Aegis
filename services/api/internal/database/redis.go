package database

import (
	"context"
	"fmt"
	"log"

	"github.com/redis/go-redis/v9"
)

// ConnectRedis initializes a Redis client and verifies connectivity.
func ConnectRedis(ctx context.Context, redisURL string) (*redis.Client, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("unable to parse redis URL: %w", err)
	}

	client := redis.NewClient(opt)

	// Ping to verify connection
	if err := client.Ping(ctx).Err(); err != nil {
		client.Close()
		return nil, fmt.Errorf("unable to ping redis: %w", err)
	}

	log.Println("Redis connected")
	return client, nil
}
