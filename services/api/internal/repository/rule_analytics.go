package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RuleAnalyticsRepository struct {
	rdb *redis.Client
}

func NewRuleAnalyticsRepository(rdb *redis.Client) *RuleAnalyticsRepository {
	return &RuleAnalyticsRepository{rdb: rdb}
}

// RecordTrigger adds a trigger event to the rule's sorted set and prunes old events.
func (r *RuleAnalyticsRepository) RecordTrigger(ctx context.Context, ruleID string, txID string) error {
	key := fmt.Sprintf("rule:%s:triggers", ruleID)
	now := time.Now().UTC()
	
	pipe := r.rdb.Pipeline()
	
	pipe.ZAdd(ctx, key, redis.Z{
		Score:  float64(now.Unix()),
		Member: txID,
	})
	
	cutoff := now.Add(-24 * time.Hour).Unix()
	pipe.ZRemRangeByScore(ctx, key, "-inf", fmt.Sprintf("%d", cutoff))
	pipe.Expire(ctx, key, 48*time.Hour)
	
	_, err := pipe.Exec(ctx)
	return err
}

// GetTriggersBatch fetches the 24h trigger counts for multiple rules efficiently.
func (r *RuleAnalyticsRepository) GetTriggersBatch(ctx context.Context, ruleIDs []string) (map[string]int, error) {
	if len(ruleIDs) == 0 {
		return map[string]int{}, nil
	}

	cutoff := time.Now().UTC().Add(-24 * time.Hour).Unix()
	minScore := fmt.Sprintf("%d", cutoff)
	maxScore := "+inf"

	pipe := r.rdb.Pipeline()
	cmds := make(map[string]*redis.IntCmd)

	for _, id := range ruleIDs {
		key := fmt.Sprintf("rule:%s:triggers", id)
		cmds[id] = pipe.ZCount(ctx, key, minScore, maxScore)
	}

	_, err := pipe.Exec(ctx)
	if err != nil && err != redis.Nil {
		return nil, err
	}

	result := make(map[string]int)
	for id, cmd := range cmds {
		count, err := cmd.Result()
		if err == nil {
			result[id] = int(count)
		} else {
			result[id] = 0
		}
	}

	return result, nil
}
