package service

import (
	"context"
	"fmt"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
)

type RulesEngine struct {
	ruleRepo *repository.RuleRepository
	txRepo   *repository.TransactionRepository
	tracer   trace.Tracer
}

func NewRulesEngine(ruleRepo *repository.RuleRepository, txRepo *repository.TransactionRepository) *RulesEngine {
	return &RulesEngine{
		ruleRepo: ruleRepo,
		txRepo:   txRepo,
		tracer:   otel.Tracer("aegis/api/service"),
	}
}

// Evaluate runs active rules against a transaction. Returns (action, triggeredRuleName, error).
// Action can be "", "block", "flag", "step_up". "" means it passed cleanly.
func (e *RulesEngine) Evaluate(ctx context.Context, t *model.Transaction) (string, string, error) {
	ctx, span := e.tracer.Start(ctx, "rules_engine.evaluate")
	defer span.End()

	rules, err := e.ruleRepo.List(ctx)
	if err != nil {
		return "", "", fmt.Errorf("failed to fetch rules: %w", err)
	}

	// Filter active rules
	var activeRules []model.Rule
	for _, r := range rules {
		if r.IsActive {
			activeRules = append(activeRules, r)
		}
	}

	if len(activeRules) == 0 {
		return "", "", nil // No rules present or active, passes cleanly
	}

	for _, rule := range activeRules {
		matched, err := e.evaluateRule(ctx, rule, t)
		if err != nil {
			continue // Skip failing rules, or log error
		}
		if matched {
			// Rule triggered! Return the action and rule name.
			// In a real system, you might aggregate flags, but block takes precedence.
			return rule.Action, rule.Name, nil
		}
	}

	return "", "", nil
}

func (e *RulesEngine) evaluateRule(ctx context.Context, rule model.Rule, t *model.Transaction) (bool, error) {
	var metricValue float64

	switch rule.Metric {
	case "amount":
		metricValue = t.Amount
	case "velocity":
		if rule.Window == nil {
			return false, nil // Invalid rule
		}
		duration, err := parseWindow(*rule.Window)
		if err != nil {
			return false, err
		}
		
		// Query database for count of transactions by this entity in the time window
		since := time.Now().UTC().Add(-duration)
		
		var count int
		if rule.Entity == "user" {
			c, err := e.txRepo.CountByAccount(ctx, t.AccountID, since)
			if err != nil {
				return false, err
			}
			count = c
		} else if rule.Entity == "card" {
			// Placeholder for non-user entities
			count = 1 
		}
		metricValue = float64(count)
	default:
		return false, nil
	}

	switch rule.Operator {
	case ">":
		return metricValue > rule.Value, nil
	case ">=":
		return metricValue >= rule.Value, nil
	case "<":
		return metricValue < rule.Value, nil
	case "==":
		return metricValue == rule.Value, nil
	default:
		return false, nil
	}
}

func parseWindow(window string) (time.Duration, error) {
	switch window {
	case "1m":
		return time.Minute, nil
	case "5m":
		return 5 * time.Minute, nil
	case "1h":
		return time.Hour, nil
	case "24h":
		return 24 * time.Hour, nil
	case "7d":
		return 7 * 24 * time.Hour, nil
	case "30d":
		return 30 * 24 * time.Hour, nil
	default:
		return time.ParseDuration(window)
	}
}
