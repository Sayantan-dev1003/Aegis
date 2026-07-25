package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
)

type RulesEngine struct {
	ruleRepo      *repository.RuleRepository
	txRepo        *repository.TransactionRepository
	velocityStore *repository.VelocityStore
	tracer        trace.Tracer
}

func NewRulesEngine(ruleRepo *repository.RuleRepository, txRepo *repository.TransactionRepository, velocityStore *repository.VelocityStore) *RulesEngine {
	return &RulesEngine{
		ruleRepo:      ruleRepo,
		txRepo:        txRepo,
		velocityStore: velocityStore,
		tracer:        otel.Tracer("aegis/api/service"),
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
		var count int
		switch rule.Entity {
		case "user":
			count, err = e.velocityStore.Count(ctx, "user", t.AccountID, duration)
		case "device":
			if t.DeviceID != nil && *t.DeviceID != "" {
				count, err = e.velocityStore.Count(ctx, "device", *t.DeviceID, duration)
			}
		case "ip":
			if t.IPAddress != nil && *t.IPAddress != "" {
				count, err = e.velocityStore.Count(ctx, "ip", *t.IPAddress, duration)
			}
		}
		// If rule.Entity is "card", it will gracefully ignore (count remains 0) as discussed

		if err != nil {
			return false, err
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
	if strings.HasSuffix(window, "d") {
		daysStr := strings.TrimSuffix(window, "d")
		days, err := strconv.Atoi(daysStr)
		if err != nil {
			return 0, err
		}
		return time.Duration(days) * 24 * time.Hour, nil
	}
	return time.ParseDuration(window)
}
