package service

import (
	"context"
	"fmt"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

type SLAMonitor struct {
	db           *pgxpool.Pool
	queueRepo    *repository.QueueRepository
	outboxRepo   *repository.OutboxRepository
	txRepo       *repository.TransactionRepository
	incidentRepo *repository.IncidentRepository
	notifService *NotificationService
	hub          WebSocketHub
}

func NewSLAMonitor(
	db *pgxpool.Pool,
	queueRepo *repository.QueueRepository,
	outboxRepo *repository.OutboxRepository,
	txRepo *repository.TransactionRepository,
	incidentRepo *repository.IncidentRepository,
	notifService *NotificationService,
	hub WebSocketHub,
) *SLAMonitor {
	return &SLAMonitor{
		db:           db,
		queueRepo:    queueRepo,
		outboxRepo:   outboxRepo,
		txRepo:       txRepo,
		incidentRepo: incidentRepo,
		notifService: notifService,
		hub:          hub,
	}
}

func (m *SLAMonitor) Start(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	log.Info().Msg("SLA Monitor background service started")

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("SLA Monitor shutting down")
			return
		case <-ticker.C:
			m.checkBreaches(ctx)
		}
	}
}

func (m *SLAMonitor) checkBreaches(ctx context.Context) {
	if err := m.processTier1Breaches(ctx); err != nil {
		log.Error().Err(err).Msg("Error processing Tier 1 SLA breaches")
	}
	if err := m.processTier2Breaches(ctx); err != nil {
		log.Error().Err(err).Msg("Error processing Tier 2 SLA breaches")
	}
	if err := m.processInvestigationTimeouts(ctx); err != nil {
		log.Error().Err(err).Msg("Error processing Investigation Timeouts")
	}
	if err := m.processVIPWarnings(ctx); err != nil {
		log.Error().Err(err).Msg("Error processing VIP SLA Warnings")
	}
}

// processTier1Breaches moves expired unclaimed transactions from primary queues to Default Fallback Queue with 50% reduced SLA.
func (m *SLAMonitor) processTier1Breaches(ctx context.Context) error {
	fallbackQ, err := m.queueRepo.GetFallbackQueue(ctx)
	if err != nil || fallbackQ == nil {
		return fmt.Errorf("failed to get fallback queue: %w", err)
	}

	query := `
		SELECT t.id, q.id, q.sla_target_minutes
		FROM transactions t
		JOIN queues q ON t.queue_id = q.id
		WHERE (t.status = 'escalated' OR (t.status = 'reviewed' AND EXISTS (SELECT 1 FROM reviews WHERE transaction_id = t.id ORDER BY reviewed_at DESC LIMIT 1) AND (SELECT decision FROM reviews WHERE transaction_id = t.id ORDER BY reviewed_at DESC LIMIT 1) = 'escalate'))
		  AND t.claimed_by IS NULL
		  AND q.id != $1
		  AND NOT EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.tier = 1)
		  AND ((t.sla_remaining_seconds IS NOT NULL AND t.sla_remaining_seconds - EXTRACT(EPOCH FROM (NOW() - t.sla_start_at)) <= 0)
		    OR (t.sla_remaining_seconds IS NULL AND EXTRACT(EPOCH FROM (NOW() - t.sla_start_at)) / 60.0 > q.sla_target_minutes))
	`

	rows, err := m.db.Query(ctx, query, fallbackQ.ID)
	if err != nil {
		return err
	}
	defer rows.Close()

	type breachedItem struct {
		txID          string
		queueID       string
		slaTargetMins int
	}
	var items []breachedItem
	for rows.Next() {
		var item breachedItem
		if err := rows.Scan(&item.txID, &item.queueID, &item.slaTargetMins); err == nil {
			items = append(items, item)
		}
	}
	rows.Close()

	for _, item := range items {
		// 1. Record breach event in sla_breaches table
		insertBreachQ := `
			INSERT INTO sla_breaches (
				transaction_id, original_queue_id, fallback_queue_id, tier, sla_target_minutes, sla_remaining_seconds, status, breached_at
			) VALUES (
				$1, $2, $3, 1, $4, 0, 'breached', NOW()
			)
		`
		if _, err := m.db.Exec(ctx, insertBreachQ, item.txID, item.queueID, fallbackQ.ID, int(item.slaTargetMins)); err != nil {
			log.Error().Err(err).Msg("failed to insert into sla_breaches")
		}

		// 2. 50% reduced SLA for auto breach (Symmetric SLA)
		reducedSec := (fallbackQ.SlaTargetMinutes * 60) / 2

		updateQ := `
			UPDATE transactions 
			SET queue_id = $3, status = 'escalated', priority_level = 'high_risk', sla_start_at = NOW(),
			    sla_remaining_seconds = $2, sla_breach_type = 'auto_breach', claimed_by = NULL, claimed_at = NULL, updated_at = NOW()
			WHERE id = $1
		`
		if _, err := m.db.Exec(ctx, updateQ, item.txID, reducedSec, fallbackQ.ID); err == nil {
			log.Warn().Str("transaction_id", item.txID).Msg("Tier 1 SLA Breach: Transferred to Default Queue with 50% reduced SLA")
			
			origReviewer, _ := m.resolveQueueReviewer(ctx, item.queueID)
			if origReviewer != "" && m.notifService != nil {
				m.notifService.Notify(ctx, model.Notification{
					ReviewerID:    origReviewer,
					EventType:     "queue.case_escalated_out",
					Priority:      "info",
					Title:         "Case Escalated Out",
					Message:       fmt.Sprintf("TXN %s breached SLA in your queue and moved to Fallback", item.txID),
					TransactionID: &item.txID,
				})
			}

			fallbackReviewer, _ := m.resolveQueueReviewer(ctx, fallbackQ.ID)
			if fallbackReviewer != "" && m.notifService != nil {
				m.notifService.Notify(ctx, model.Notification{
					ReviewerID:    fallbackReviewer,
					EventType:     "queue.case_received",
					Priority:      "critical",
					Title:         "⚠️ Urgent Case Received",
					Message:       fmt.Sprintf("TXN %s breached in original queue, now in yours with reduced SLA", item.txID),
					TransactionID: &item.txID,
				})
			}

			if m.hub != nil {
				event := map[string]any{
					"event_type":     "transaction.sla_breached_tier1",
					"transaction_id": item.txID,
					"new_queue_id":   fallbackQ.ID,
					"priority_level": "high_risk",
					"timestamp":      time.Now().UTC(),
				}
				m.hub.Broadcast(item.txID, event)
			}
		}
	}

	// Broadcast updated queue stats for affected queues
	queueUpdates := make(map[string]bool)
	for _, item := range items {
		queueUpdates[item.queueID] = true
	}

	for qID := range queueUpdates {
		q, err := m.queueRepo.GetByID(ctx, qID)
		if err == nil && m.hub != nil {
			event := map[string]any{
				"event_type":     "queue.stats_updated",
				"queue_id":       q.ID,
				"cases_breached": *q.CasesBreached,
				"breach_rate":    *q.BreachRate,
				"total_cases":    *q.TotalCases,
				"open_cases":     *q.OpenCases,
				"timestamp":      time.Now().UTC(),
			}
			m.hub.Broadcast(q.ID, event)
		}
	}

	return nil
}

// processTier2Breaches handles expired unclaimed transactions in Default Fallback Queue with cached ML resolution.
func (m *SLAMonitor) processTier2Breaches(ctx context.Context) error {
	fallbackQ, err := m.queueRepo.GetFallbackQueue(ctx)
	if err != nil || fallbackQ == nil {
		return fmt.Errorf("failed to get fallback queue: %w", err)
	}

	query := `
		SELECT t.id, t.risk_score, t.queue_id, t.claimed_by, fr.created_at
		FROM transactions t
		LEFT JOIN fraud_results fr ON fr.transaction_id = t.id
		WHERE t.status IN ('escalated', 'breached')
		  AND t.claimed_by IS NULL
		  AND (
		      t.queue_id = $1
		      OR EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.fallback_queue_id = $1 AND sb.tier = 1 AND sb.status = 'breached')
		  )
		  AND NOT EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.tier = 2)
		  AND ((t.sla_remaining_seconds IS NOT NULL AND t.sla_remaining_seconds - EXTRACT(EPOCH FROM (NOW() - t.sla_start_at)) <= 0)
		    OR (t.sla_remaining_seconds IS NULL AND EXTRACT(EPOCH FROM (NOW() - t.sla_start_at)) / 60.0 > $2))
	`

	rows, err := m.db.Query(ctx, query, fallbackQ.ID, fallbackQ.SlaTargetMinutes)
	if err != nil {
		return err
	}
	defer rows.Close()

	type tier2Item struct {
		txID        string
		riskScore   *float64
		queueID     *string
		claimedBy   *string
		frCreatedAt *time.Time
	}
	var items []tier2Item
	for rows.Next() {
		var item tier2Item
		if err := rows.Scan(&item.txID, &item.riskScore, &item.queueID, &item.claimedBy, &item.frCreatedAt); err == nil {
			items = append(items, item)
		}
	}
	rows.Close()

	for _, item := range items {
		// Check for valid cached ML score (< 30 minutes old)
		if item.riskScore != nil && item.frCreatedAt != nil && time.Since(*item.frCreatedAt) <= 30*time.Minute {
			status := "scored_approved"
			if *item.riskScore >= 0.45 {
				status = "auto_blocked"
			}
			updateQ := `UPDATE transactions SET status = $1, claimed_by = NULL, claimed_at = NULL, updated_at = NOW() WHERE id = $2`
			if _, err := m.db.Exec(ctx, updateQ, status, item.txID); err == nil {
				insertBreachQ := `
					INSERT INTO sla_breaches (
						transaction_id, original_queue_id, fallback_queue_id, tier, sla_target_minutes, sla_remaining_seconds, status, breached_at
					) VALUES (
						$1, $2, NULL, 2, $3, 0, 'breached_tier2_cached', NOW()
					)
				`
				if _, err := m.db.Exec(ctx, insertBreachQ, item.txID, fallbackQ.ID, int(fallbackQ.SlaTargetMinutes)); err != nil {
					log.Error().Err(err).Msg("failed to insert into sla_breaches (Tier 2)")
				}
				if m.incidentRepo != nil {
					_ = m.incidentRepo.Create(ctx, &model.Incident{
						TransactionID: strPtr(item.txID),
						IncidentType:  strPtr("sla_breach"),
						Description:   strPtr(fmt.Sprintf("Tier 2 SLA breach resolved via cached ML score (score: %.2f, verdict: %s)", *item.riskScore, status)),
					})
				}
				log.Warn().Str("transaction_id", item.txID).Msgf("Tier 2 SLA Breach: Resolved via cached ML score (%s)", status)
				
				if item.queueID != nil {
					curReviewer, _ := m.resolveQueueReviewer(ctx, *item.queueID)
					if curReviewer != "" && m.notifService != nil {
						m.notifService.Notify(ctx, model.Notification{
							ReviewerID:    curReviewer,
							EventType:     "queue.case_auto_resolved",
							Priority:      "info",
							Title:         "Case Auto-Resolved",
							Message:       fmt.Sprintf("TXN %s auto-resolved due to investigation timeout (ML score: %.2f)", item.txID, *item.riskScore),
							TransactionID: &item.txID,
						})
					}
				}
				continue
			}
		}

		// Fallback: No valid cached score -> Re-score via ML
		tx, err := m.db.Begin(ctx)
		if err != nil {
			continue
		}

		var t model.Transaction
		err = tx.QueryRow(ctx, `
			SELECT id, external_id, account_id, merchant_id, merchant_name, merchant_category,
			       amount, currency, country_code, transaction_type, channel, device_id,
			       ip_address::text, timestamp, ingested_at
			FROM transactions WHERE id = $1
		`, item.txID).Scan(
			&t.ID, &t.ExternalID, &t.AccountID, &t.MerchantID, &t.MerchantName, &t.MerchantCategory,
			&t.Amount, &t.Currency, &t.CountryCode, &t.TransactionType, &t.Channel, &t.DeviceID,
			&t.IPAddress, &t.Timestamp, &t.IngestedAt,
		)
		if err != nil {
			tx.Rollback(ctx)
			continue
		}

		insertBreachQ := `
			INSERT INTO sla_breaches (
				transaction_id, original_queue_id, fallback_queue_id, tier, sla_target_minutes, sla_remaining_seconds, status, breached_at
			) VALUES (
				$1, $2, NULL, 2, $3, 0, 'breached_tier2', NOW()
			)
		`
		if _, err := tx.Exec(ctx, insertBreachQ, item.txID, fallbackQ.ID, int(fallbackQ.SlaTargetMinutes)); err != nil {
			log.Error().Err(err).Msg("failed to insert into sla_breaches (Tier 2 ML)")
		}

		updateQ := `
			UPDATE transactions 
			SET status = 'pending', queue_id = NULL, claimed_by = NULL, claimed_at = NULL, updated_at = NOW()
			WHERE id = $1
		`
		if _, err := tx.Exec(ctx, updateQ, item.txID); err != nil {
			tx.Rollback(ctx)
			continue
		}

		payloadBytes, err := buildMLPayload(&t)
		if err != nil {
			tx.Rollback(ctx)
			continue
		}

		if err := m.outboxRepo.CreateEvent(ctx, tx, item.txID, "transactions.raw", payloadBytes); err != nil {
			tx.Rollback(ctx)
			continue
		}

		if err := tx.Commit(ctx); err == nil {
			log.Warn().Str("transaction_id", item.txID).Msg("Tier 2 SLA Breach: Converted to pending status and written to outbox for ML Model")
			
			if item.queueID != nil {
				curReviewer, _ := m.resolveQueueReviewer(ctx, *item.queueID)
				if curReviewer != "" && m.notifService != nil {
					m.notifService.Notify(ctx, model.Notification{
						ReviewerID:    curReviewer,
						EventType:     "queue.case_unloaded",
						Priority:      "info",
						Title:         "Case Sent for Re-evaluation",
						Message:       fmt.Sprintf("TXN %s unloaded due to investigation timeout and sent for re-scoring", item.txID),
						TransactionID: &item.txID,
					})
				}
			}

			if m.hub != nil {
				event := map[string]any{
					"event_type":     "transaction.sla_breached_tier2",
					"transaction_id": item.txID,
					"status":         "pending",
					"timestamp":      time.Now().UTC(),
				}
				m.hub.Broadcast(item.txID, event)
			}
		}
	}

	// Broadcast updated queue stats for fallback queue if any items were processed
	if len(items) > 0 {
		q, err := m.queueRepo.GetByID(ctx, fallbackQ.ID)
		if err == nil && m.hub != nil {
			event := map[string]any{
				"event_type":     "queue.stats_updated",
				"queue_id":       q.ID,
				"cases_breached": *q.CasesBreached,
				"breach_rate":    *q.BreachRate,
				"total_cases":    *q.TotalCases,
				"open_cases":     *q.OpenCases,
				"timestamp":      time.Now().UTC(),
			}
			m.hub.Broadcast(q.ID, event)
		}
	}

	return nil
}

// processInvestigationTimeouts checks for claimed transactions held > 30 minutes and re-routes to Account Takeover Suspects.
func (m *SLAMonitor) processInvestigationTimeouts(ctx context.Context) error {
	atoQ, err := m.queueRepo.FindByName(ctx, "Account Takeover Suspects")
	if err != nil || atoQ == nil {
		atoQ, _ = m.queueRepo.GetFallbackQueue(ctx)
	}
	if atoQ == nil {
		return nil
	}

	query := `
		SELECT t.id, t.claimed_by, COALESCE(q.name, 'Unknown')
		FROM transactions t
		LEFT JOIN queues q ON t.queue_id = q.id
		WHERE t.status IN ('escalated', 'breached')
		  AND t.claimed_by IS NOT NULL
		  AND t.claimed_at <= NOW() - INTERVAL '30 minutes'
	`

	rows, err := m.db.Query(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()

	type timeoutItem struct {
		txID      string
		claimedBy string
		queueName string
	}
	var items []timeoutItem
	for rows.Next() {
		var item timeoutItem
		if err := rows.Scan(&item.txID, &item.claimedBy, &item.queueName); err == nil {
			items = append(items, item)
		}
	}
	rows.Close()

	for _, item := range items {
		updateQ := `
			UPDATE transactions 
			SET queue_id = $1, claimed_by = NULL, claimed_at = NULL, sla_paused_at = NULL, 
			    sla_remaining_seconds = $2, requires_admin_review = TRUE, priority_level = 'urgent', updated_at = NOW()
			WHERE id = $3
		`
		if _, err := m.db.Exec(ctx, updateQ, atoQ.ID, atoQ.SlaTargetMinutes*60, item.txID); err == nil {
			log.Warn().Str("transaction_id", item.txID).Msg("Investigation timeout (>30 min): Re-routed to Account Takeover Suspects with urgent priority")
			
			if item.claimedBy != "" && m.notifService != nil {
				m.notifService.Notify(ctx, model.Notification{
					ReviewerID:    item.claimedBy,
					EventType:     "transaction.investigation_timeout",
					Priority:      "critical",
					Title:         "⚠️ Investigation Timeout",
					Message:       fmt.Sprintf("TXN %s exceeded 30 min investigation window. Re-routed to Account Takeover Suspects.", item.txID),
					TransactionID: &item.txID,
				})
			}

			if m.incidentRepo != nil {
				_ = m.incidentRepo.Create(ctx, &model.Incident{
					TransactionID: strPtr(item.txID),
					IncidentType:  strPtr("investigation_timeout"),
					Description:   strPtr(fmt.Sprintf("Investigation timeout (>30 min) by analyst %s in queue %s. Re-routed to Account Takeover Suspects.", item.claimedBy, item.queueName)),
				})
			}
			if m.notifService != nil {
				m.notifService.NotifyAdminEscalation(ctx, atoQ, &model.Transaction{ID: item.txID}, fmt.Sprintf("Investigation timeout by analyst %s", item.claimedBy))
			}
			if m.hub != nil {
				event := map[string]any{
					"event_type":     "transaction.investigation_timeout",
					"transaction_id": item.txID,
					"new_queue_id":   atoQ.ID,
					"timestamp":      time.Now().UTC(),
				}
				m.hub.Broadcast(item.txID, event)
			}
		}
	}
	return nil
}

// processVIPWarnings sends alerts for VIP transactions (>50% SLA elapsed and unclaimed).
func (m *SLAMonitor) processVIPWarnings(ctx context.Context) error {
	query := `
		SELECT t.id, q.id, q.name, q.sla_target_minutes
		FROM transactions t
		JOIN queues q ON t.queue_id = q.id
		WHERE t.status IN ('escalated', 'breached')
		  AND t.claimed_by IS NULL
		  AND q.sla_target_minutes <= 15
		  AND EXTRACT(EPOCH FROM (NOW() - t.sla_start_at)) >= (q.sla_target_minutes * 30.0)
	`
	rows, err := m.db.Query(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var txID, qID, qName string
		var slaMins int
		if err := rows.Scan(&txID, &qID, &qName, &slaMins); err == nil {
			vipReviewer, _ := m.resolveQueueReviewer(ctx, qID)
			if vipReviewer != "" && m.notifService != nil {
				m.notifService.Notify(ctx, model.Notification{
					ReviewerID:    vipReviewer,
					EventType:     "queue.vip_case_unclaimed",
					Priority:      "critical",
					Title:         "🔴 VIP Case Urgent",
					Message:       fmt.Sprintf("High-priority TXN %s in queue '%s' (SLA: %d min) unclaimed for 50%% of window. Immediate attention required.", txID, qName, slaMins),
					TransactionID: &txID,
				})
			}

			if m.notifService != nil {
				m.notifService.NotifyAdminEscalation(ctx, &model.Queue{ID: qID, Name: qName}, &model.Transaction{ID: txID}, "VIP Transaction SLA > 50% elapsed and unclaimed")
			}
		}
	}
	return nil
}

func (m *SLAMonitor) resolveQueueReviewer(ctx context.Context, queueID string) (string, error) {
	var reviewerID string
	err := m.db.QueryRow(ctx, "SELECT id FROM analysts WHERE queue_id = $1 LIMIT 1", queueID).Scan(&reviewerID)
	return reviewerID, err
}
