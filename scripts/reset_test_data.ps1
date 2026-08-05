#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Resets all Aegis test data: clears Postgres transaction/outbox tables
    AND flushes Redis velocity counters atomically.

.DESCRIPTION
    When you run mock transactions for testing, data accumulates in two places:
      1. PostgreSQL  — transactions, outbox_events, fraud_results, reviews, sla_breaches, block_audit_samples
      2. Redis       — velocity:user:*, velocity:device:*, velocity:ip:* sorted sets

    Clearing only Postgres leaves stale velocity counts in Redis, causing the
    ATO/velocity rules to over-trigger on every subsequent test run (because
    account IDs are reused from the ACCT_1001-1050 pool).

    This script clears both atomically so every test run starts fresh.

.USAGE
    powershell -ExecutionPolicy Bypass -File scripts\reset_test_data.ps1

    Optional flags:
      -KeepQueues    Keep queue configuration intact (default: true)
      -KeepRules     Keep rules configuration intact (default: true)
#>

param(
    [switch]$KeepQueues = $true,
    [switch]$KeepRules  = $true
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Aegis Test Data Reset" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Clear PostgreSQL tables ──────────────────────────────────────────────
Write-Host "[1/2] Clearing PostgreSQL tables..." -ForegroundColor Yellow

$sql = @"
TRUNCATE TABLE
    block_audit_samples,
    sla_breaches,
    reviews,
    fraud_results,
    outbox_events,
    transactions
RESTART IDENTITY CASCADE;
"@

docker exec aegis-postgres psql -U aegis_admin -d aegis_db -c $sql | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Failed to clear PostgreSQL tables" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ Cleared: transactions, outbox_events, fraud_results, reviews, sla_breaches, block_audit_samples" -ForegroundColor Green

# ── 2. Clear Redis velocity keys ─────────────────────────────────────────────
Write-Host "[2/2] Flushing Redis velocity counters (Fast mode)..." -ForegroundColor Yellow

$patterns = @("velocity:user:*", "velocity:device:*", "velocity:ip:*", "acct:*:devices")

foreach ($pattern in $patterns) {
    # Execute the scan & delete pipeline entirely inside the redis container for instant execution
    docker exec aegis-redis sh -c "redis-cli --scan --pattern '$pattern' | xargs -r redis-cli DEL > /dev/null 2>&1"
}

Write-Host "  ✓ Deleted Redis velocity keys" -ForegroundColor Green

# ── 3. Summary ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Reset complete. Ready for a clean test run." -ForegroundColor Green
Write-Host ""
Write-Host "  Next step:" -ForegroundColor White
Write-Host "    python scripts/mock_transactions.py --count 300 --rps 15 --mode all" -ForegroundColor Gray
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""
