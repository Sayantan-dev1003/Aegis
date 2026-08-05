package service

import (
	"context"
	"fmt"
	"sort"
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
	analyticsRepo *repository.RuleAnalyticsRepository
	tracer        trace.Tracer
}

func NewRulesEngine(ruleRepo *repository.RuleRepository, txRepo *repository.TransactionRepository, velocityStore *repository.VelocityStore, analyticsRepo *repository.RuleAnalyticsRepository) *RulesEngine {
	return &RulesEngine{
		ruleRepo:      ruleRepo,
		txRepo:        txRepo,
		velocityStore: velocityStore,
		analyticsRepo: analyticsRepo,
		tracer:        otel.Tracer("aegis/api/service"),
	}
}

func getRulePriority(rule model.Rule) int {
	if strings.EqualFold(rule.Action, "block") {
		return 0 // Priority 0: block rules always take precedence
	}
	name := strings.ToLower(rule.Name)
	if strings.Contains(name, "vip") || strings.Contains(name, "high-value") || strings.Contains(name, "high value") || rule.Metric == "amount" {
		return 20 // Priority 2: VIP / high-value flag rules
	}
	if strings.Contains(name, "ato") || strings.Contains(name, "takeover") || strings.Contains(name, "drain") {
		return 30 // Priority 3: Account takeover flag rules
	}
	if strings.Contains(name, "aml") || strings.Contains(name, "smurf") || strings.Contains(name, "structur") ||
		strings.Contains(name, "kyc") || strings.Contains(name, "unverified") || strings.Contains(name, "dispute") || strings.Contains(name, "chargeback") {
		return 40 // Priority 4: AML / KYC flag rules
	}
	return 50 // Priority 5: General flag rules
}

// Evaluate runs active rules against a transaction. Returns (action, triggeredRule, error).
// Action can be "", "block", "flag". "" means it passed cleanly.
func (e *RulesEngine) Evaluate(ctx context.Context, t *model.Transaction) (string, *model.Rule, error) {
	ctx, span := e.tracer.Start(ctx, "rules_engine.evaluate")
	defer span.End()

	rules, err := e.ruleRepo.List(ctx)
	if err != nil {
		return "", nil, fmt.Errorf("failed to fetch rules: %w", err)
	}

	// Filter active rules
	var activeRules []model.Rule
	for _, r := range rules {
		if r.IsActive {
			activeRules = append(activeRules, r)
		}
	}

	if len(activeRules) == 0 {
		return "", nil, nil // No rules present or active, passes cleanly
	}

	// Sort active rules by business priority hierarchy
	sort.SliceStable(activeRules, func(i, j int) bool {
		return getRulePriority(activeRules[i]) < getRulePriority(activeRules[j])
	})

	for _, rule := range activeRules {
		matched, err := e.evaluateRule(ctx, rule, t)
		if err != nil {
			continue // Skip failing rules, or log error
		}
		if matched {
			if e.analyticsRepo != nil {
				go func(rID, txID string) {
					bgCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
					defer cancel()
					_ = e.analyticsRepo.RecordTrigger(bgCtx, rID, txID)
				}(rule.ID, t.ID)
			}
			// Rule triggered! Return the action and rule pointer.
			r := rule
			return rule.Action, &r, nil
		}
	}

	return "", nil, nil
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
