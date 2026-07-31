# Payment Channel & Portfolio Performance: Dynamic DB Integration & 7 Multi-Channel Support

This implementation plan upgrades the **Payment Channel & Portfolio Performance** table in the Viewer Executive Overview dashboard (`page.tsx`) from hardcoded static data to **100% dynamic DB-driven metrics and heuristics**.

It supports the 7 specified banking/fintech payment channels:
1. `online` / `card_ecommerce` → **Card (E-Commerce)**
2. `pos` → **POS Terminal (Retail)**
3. `atm` → **ATM Withdrawal**
4. `upi` → **UPI Instant Payment**
5. `ach_transfer` / `neft_rtgs` → **ACH / NEFT / RTGS**
6. `wire_transfer` → **Wire Transfer (SWIFT)**
7. `mobile_wallet` → **Mobile Wallet**

---

## User Review Required

> [!IMPORTANT]
> **SQL Channel Mapping with Full 7-Channel Coverage**:
> Even if a specific channel has `0` transactions in the selected time horizon (`12H`, `24H`, `7D`, etc.), all 7 payment channels will appear dynamically in the table. We achieve this using a PostgreSQL CTE (`WITH all_channels AS (VALUES ...)`) that `LEFT JOIN`s onto `transactions` and `reviews`. Zero static fallback or mock UI data will be used.

> [!NOTE]
> **Heuristics for Risk Index (0–100) & System SLA Health**:
> - **Risk Index Formula**: $\min\left(100, \; \text{ROUND}\Big( (\text{Fraud Rate} \times 15) + (\text{Avg Requeues} \times 10) \Big) \right)$. This dynamic score scales from 0 (cleanest) to 100 (highest risk).
> - **System SLA Health**:
>   - **`Nominal`** (Green): Risk Index `< 35` and average requeues `< 1.0`.
>   - **`Elevated`** (Orange): Risk Index `35–69` or average requeues `1.0–1.9`.
>   - **`Critical`** (Red): Risk Index `≥ 70` or average requeues `≥ 2.0`.

---

## Proposed Changes

### API Repository & Handler (`services/api`)

#### [MODIFY] [api_response.go](file:///c:/PROJECTS/Aegis/services/api/internal/model/api_response.go)
- Define `ChannelPerformancePoint` struct:
  ```go
  type ChannelPerformancePoint struct {
      Channel      string  `json:"channel"`
      RawChannel   string  `json:"raw_channel"`
      Volume       int     `json:"volume"`
      FraudRate    float64 `json:"fraud_rate"`
      PreventedINR float64 `json:"prevented_inr"`
      SlaHealth    string  `json:"sla_health"`
      RiskIndex    int     `json:"risk_index"`
  }
  ```

#### [MODIFY] [stats.go](file:///c:/PROJECTS/Aegis/services/api/internal/repository/stats.go)
- Implement `GetChannelPerformance(ctx context.Context, timeFrame string) ([]model.ChannelPerformancePoint, error)`:
  - Query PostgreSQL across all 7 channels using a CTE `VALUES` table.
  - Calculate `monitored_volume`, `fraud_rate_percentage`, and `prevented_inr` (sum of transaction amounts in INR for `auto_blocked` or `confirmed_fraud` transactions).
  - Calculate `SlaHealth` (`Nominal`, `Elevated`, `Critical`) and `RiskIndex` (`0-100`) dynamically in Go.

#### [MODIFY] [stats_api.go](file:///c:/PROJECTS/Aegis/services/api/internal/handler/stats_api.go)
- Add `ChannelPerformance(w http.ResponseWriter, r *http.Request)` handler:
  - Supports `?time_frame=` filter (`12h`, `24h`, `7d`, `30d`, `90d`).
  - Implements Redis caching (`aegis:stats:channel_performance:{time_frame}`, 15-second TTL).

#### [MODIFY] [main.go](file:///c:/PROJECTS/Aegis/services/api/cmd/server/main.go)
- Register route: `r.Get("/api/v1/stats/channel-performance", statsHandler.ChannelPerformance)`.

---

### Mock Transaction Generator & Ingest Service (`scripts/` & `services/api`)

#### [MODIFY] [mock_transactions.py](file:///c:/PROJECTS/Aegis/scripts/mock_transactions.py)
- Expand `_CHANNELS` list to generate transactions across all 7 channels:
  `_CHANNELS = ["online", "pos", "atm", "upi", "ach_transfer", "wire_transfer", "mobile_wallet"]`

#### [MODIFY] [ingest.go](file:///c:/PROJECTS/Aegis/services/api/internal/service/ingest.go)
- In `buildMLPayload`, map `pos`, `atm`, `upi`, `mobile_wallet` to `"mobile device"` and `online`, `ach_transfer`, `wire_transfer` to `"desktop"`.

---

### Frontend Dashboard (`services/dashboard`)

#### [MODIFY] [page.tsx](file:///c:/PROJECTS/Aegis/services/dashboard/src/app/(dashboard)/viewer/overview/page.tsx)
- Add `channelData` state (`const [channelData, setChannelData] = useState<any[]>([]);`).
- Fetch `/api/v1/stats/channel-performance?time_frame=${timeHorizon}` in `useEffect`.
- Replace static `channelBreakdown` table rendering with dynamic `channelData`.
- Format `Prevented INR` using currency formatter (`₹`).
- Dynamically style SLA status badge (`Nominal` Green, `Elevated` Orange, `Critical` Red) and pass `RiskIndex` score into `RadialRiskGauge`.

---

## Verification Plan

### Automated Tests
1. **API Backend Build & Lint**:
   ```bash
   cd services/api && go build -v ./cmd/server
   ```
2. **Dashboard Build & Type-Check**:
   ```bash
   cd services/dashboard && npm run build
   ```

### Manual Verification
1. Run load generator:
   ```bash
   python scripts/mock_transactions.py --count 70 --rps 10
   ```
2. Verify all 7 payment channels appear in the **Payment Channel & Portfolio Performance** table with dynamic monitored volumes, INR loss prevented, SLA status badges, and radial risk gauges.
