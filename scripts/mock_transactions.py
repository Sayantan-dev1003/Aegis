#!/usr/bin/env python3
"""
Aegis — v2 Corrected Architecture Mock Transaction Generator
============================================================
Generates realistic payloads for all 6 v2 architectural workflows and sends them
to POST /api/v1/ingest/transactions.

Supported Test Modes (--mode):
  all        : Balanced mix of all 6 cases below (default, default count=300)
  legit      : Case 1 - Legitimate approved purchases (< 0.45 ML score -> scored_approved)
  borderline : Case 2 - ML Borderline Review cases (0.45-0.94 ML score -> ML Borderline Review queue)
  critical   : Case 3 - ML Critical Auto-Block (>= 0.95 ML score -> 100% ml_auto_block audit sample)
  vip        : Case 4 - VIP High-Value Exception rule (amount >= 1,00,000 -> High Value Exceptions queue)
  ato        : Case 5 - ATO Rapid Night Transfer rule (amount >= 60,000 transfer -> ATO Suspects queue / step-up)
  block      : Case 6 - Rule Auto-Block (amount >= 2,50,000 -> rule auto-blocked, audit sampled)

Usage Examples:
  # Send 300 transactions across all 6 workflows (default)
  python scripts/mock_transactions.py --count 300 --rps 15 --mode all

  # Test only VIP High-Value Exceptions (e.g. to test Case 10 VIP 50% SLA warning)
  python scripts/mock_transactions.py --count 20 --mode vip

  # Test ML Critical Auto-Blocks (score >= 0.95) for 100% Audit Ledger inspection
  python scripts/mock_transactions.py --count 30 --mode critical
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any

try:
    import httpx
except ImportError:
    print("[ERROR] httpx is required. Install it with: pip install httpx", file=sys.stderr)
    sys.exit(1)

# ──────────────────────────────────────────────────────────────────────────────
# Merchant & Device Pools
# ──────────────────────────────────────────────────────────────────────────────

_MERCHANTS_LEGIT = [
    ("M_AMAZON",    "Amazon India",    "retail",        "IN"),
    ("M_FLIPKART",  "Flipkart",        "retail",        "IN"),
    ("M_SWIGGY",    "Swiggy",          "food_delivery", "IN"),
    ("M_ZOMATO",    "Zomato",          "food_delivery", "IN"),
    ("M_UBER",      "Uber India",      "transport",     "IN"),
    ("M_NETFLIX",   "Netflix India",   "streaming",     "IN"),
    ("M_BIGBAZAAR", "Big Bazaar",      "grocery",       "IN"),
    ("M_MYNTRA",    "Myntra Fashion",  "fashion",       "IN"),
    ("M_MAKEMYTRIP","MakeMyTrip",      "travel",        "IN"),
]

_MERCHANTS_BORDERLINE = [
    ("M_CRYPTO_EX", "Global CryptoEx", "fintech",       "SG"),
    ("M_DIGI_GAME", "DigiGame Store",  "gaming",        "AE"),
    ("M_OVERSEAS",  "Overseas Trade",  "wholesale",     "GB"),
]

_MERCHANTS_SHADOW = [
    ("M_SHADOW1",   "Tech Solutions",  "electronics",   "RU"),
    ("M_SHADOW2",   "Global Imports",  "wholesale",     "NG"),
    ("M_SHADOW3",   "QuickBuy Store",  "retail",        "PH"),
]

_DEVICE_PREFIXES = ["DEV", "MOB", "TAB", "POS"]


def _rand_account(idx_range: int = 50) -> str:
    return f"ACCT_{random.randint(1001, 1000 + idx_range)}"


def _rand_device() -> str:
    prefix = random.choice(_DEVICE_PREFIXES)
    return f"{prefix}_{random.randint(10000, 99999)}"


def _rand_ip() -> str:
    return f"{random.randint(11,192)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"


# ──────────────────────────────────────────────────────────────────────────────
# Case-Specific Payload Generators
# ──────────────────────────────────────────────────────────────────────────────

def _payload_case1_legit(account_id: str) -> tuple[dict[str, Any], str, str]:
    """Case 1: Legitimate daytime purchase (score < 0.45 -> scored_approved)."""
    merchant = random.choice(_MERCHANTS_LEGIT)
    now = datetime.now(timezone.utc)
    ts = now - timedelta(minutes=random.randint(1, 30))
    amount = round(random.uniform(150, 4_500), 2)

    payload = {
        "external_id":       str(uuid.uuid4()),
        "account_id":        account_id,
        "merchant_id":       merchant[0],
        "merchant_name":     merchant[1],
        "merchant_category": merchant[2],
        "amount":            amount,
        "currency":          "INR",
        "country_code":      merchant[3],
        "transaction_type":  "purchase",
        "channel":           random.choice(["online", "pos", "upi"]),
        "timestamp":         ts.isoformat(),
        "device_id":         _rand_device(),
        "ip_address":        _rand_ip(),
    }
    return payload, "CASE_1_LEGIT", "✅ LEGIT (Approved)"


def _payload_case2_borderline(account_id: str) -> tuple[dict[str, Any], str, str]:
    """Case 2: ML Borderline Review (score 0.45-0.94 -> ML Borderline Review queue)."""
    merchant = random.choice(_MERCHANTS_BORDERLINE)
    now = datetime.now(timezone.utc)
    ts = now - timedelta(minutes=random.randint(1, 60))
    amount = round(random.uniform(18_000, 42_000), 2)

    payload = {
        "external_id":       str(uuid.uuid4()),
        "account_id":        account_id,
        "merchant_id":       merchant[0],
        "merchant_name":     merchant[1],
        "merchant_category": merchant[2],
        "amount":            amount,
        "currency":          "INR",
        "country_code":      merchant[3],
        "transaction_type":  "purchase",
        "channel":           "online",
        "timestamp":         ts.isoformat(),
        "device_id":         _rand_device(),
        "ip_address":        _rand_ip(),
    }
    return payload, "CASE_2_BORDERLINE", "🟠 ML BORDERLINE (0.45-0.94)"


def _payload_case3_critical(account_id: str) -> tuple[dict[str, Any], str, str]:
    """Case 3: ML Critical Auto-Block (score >= 0.95 -> auto_blocked + 100% audit sample)."""
    merchant = random.choice(_MERCHANTS_SHADOW)
    now = datetime.now(timezone.utc)
    # Late night timestamp
    ts = now.replace(hour=random.randint(1, 4), minute=random.randint(0, 59))
    if ts > now:
        ts -= timedelta(days=1)
    amount = round(random.uniform(48_000, 58_000), 2)

    payload = {
        "external_id":       str(uuid.uuid4()),
        "account_id":        account_id,
        "merchant_id":       merchant[0],
        "merchant_name":     merchant[1],
        "merchant_category": merchant[2],
        "amount":            amount,
        "currency":          "INR",
        "country_code":      merchant[3],
        "transaction_type":  random.choice(["purchase", "transfer"]),
        "channel":           "online",
        "timestamp":         ts.isoformat(),
        "device_id":         f"DEV_CHURN_{uuid.uuid4().hex[:6].upper()}",
        "ip_address":        _rand_ip(),
    }
    return payload, "CASE_3_CRITICAL", "🔴 ML CRITICAL (>= 0.95 Auto-Block)"


def _payload_case4_vip(account_id: str) -> tuple[dict[str, Any], str, str]:
    """Case 4: VIP High-Value Exception rule (amount >= 1,00,000 -> High Value Exceptions queue)."""
    merchant = random.choice(_MERCHANTS_LEGIT)
    now = datetime.now(timezone.utc)
    ts = now - timedelta(minutes=random.randint(1, 15))
    amount = round(random.uniform(1_05_000, 1_85_000), 2)

    payload = {
        "external_id":       str(uuid.uuid4()),
        "account_id":        account_id,
        "merchant_id":       merchant[0],
        "merchant_name":     merchant[1],
        "merchant_category": merchant[2],
        "amount":            amount,
        "currency":          "INR",
        "country_code":      merchant[3],
        "transaction_type":  "purchase",
        "channel":           "online",
        "timestamp":         ts.isoformat(),
        "device_id":         _rand_device(),
        "ip_address":        _rand_ip(),
    }
    return payload, "CASE_4_VIP", "💎 VIP RULE (>= ₹1L Flag)"


def _payload_case5_ato(account_id: str) -> tuple[dict[str, Any], str, str]:
    """Case 5: ATO Rapid Night Transfer rule (amount >= 60,000 transfer -> ATO Suspects / Step-Up)."""
    now = datetime.now(timezone.utc)
    ts = now.replace(hour=random.randint(1, 4), minute=random.randint(0, 59))
    if ts > now:
        ts -= timedelta(days=1)
    amount = round(random.uniform(62_000, 88_000), 2)

    payload = {
        "external_id":       str(uuid.uuid4()),
        "account_id":        account_id,
        "merchant_id":       "M_PAYTM_BANK",
        "merchant_name":     "Paytm Transfer",
        "merchant_category": "fintech",
        "amount":            amount,
        "currency":          "INR",
        "country_code":      "IN",
        "transaction_type":  "transfer",
        "channel":           "mobile_wallet",
        "timestamp":         ts.isoformat(),
        "device_id":         f"MOB_NEW_{random.randint(1000,9999)}",
        "ip_address":        _rand_ip(),
    }
    return payload, "CASE_5_ATO", "⚠️ ATO RULE (Night Transfer Step-Up)"


def _payload_case6_block(account_id: str) -> tuple[dict[str, Any], str, str]:
    """Case 6: Known Rule Auto-Block (amount >= 2,50,000 -> rule auto-block, audit sampled)."""
    merchant = random.choice(_MERCHANTS_SHADOW)
    now = datetime.now(timezone.utc)
    ts = now - timedelta(minutes=random.randint(1, 20))
    amount = round(random.uniform(2_60_000, 4_50_000), 2)

    payload = {
        "external_id":       str(uuid.uuid4()),
        "account_id":        account_id,
        "merchant_id":       merchant[0],
        "merchant_name":     merchant[1],
        "merchant_category": merchant[2],
        "amount":            amount,
        "currency":          "INR",
        "country_code":      merchant[3],
        "transaction_type":  "transfer",
        "channel":           "online",
        "timestamp":         ts.isoformat(),
        "device_id":         _rand_device(),
        "ip_address":        _rand_ip(),
    }
    return payload, "CASE_6_BLOCK", "🚫 RULE AUTO-BLOCK (>= ₹2.5L)"


def select_payload(mode: str, account_id: str) -> tuple[dict[str, Any], str, str]:
    if mode == "legit":
        return _payload_case1_legit(account_id)
    elif mode == "borderline":
        return _payload_case2_borderline(account_id)
    elif mode == "critical":
        return _payload_case3_critical(account_id)
    elif mode == "vip":
        return _payload_case4_vip(account_id)
    elif mode == "ato":
        return _payload_case5_ato(account_id)
    elif mode == "block":
        return _payload_case6_block(account_id)
    else:
        # Mode == "all": balanced realistic mix across 300+ transactions
        # Distribution: 45% Legit, 15% Borderline, 10% Critical, 10% VIP, 12% ATO, 8% Rule Block
        r = random.random()
        if r < 0.45:
            return _payload_case1_legit(account_id)
        elif r < 0.60:
            return _payload_case2_borderline(account_id)
        elif r < 0.70:
            return _payload_case3_critical(account_id)
        elif r < 0.80:
            return _payload_case4_vip(account_id)
        elif r < 0.92:
            return _payload_case5_ato(account_id)
        else:
            return _payload_case6_block(account_id)


# ──────────────────────────────────────────────────────────────────────────────
# Statistics Tracker
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class Stats:
    sent:     int = 0
    accepted: int = 0
    failed:   int = 0
    case_counts: dict[str, int] = field(default_factory=dict)
    latencies: list[float] = field(default_factory=list)

    def record(self, latency_ms: float, status_code: int, case_type: str) -> None:
        self.sent += 1
        self.latencies.append(latency_ms)
        self.case_counts[case_type] = self.case_counts.get(case_type, 0) + 1
        if status_code in (200, 201, 202):
            self.accepted += 1
        else:
            self.failed += 1

    def print_summary(self) -> None:
        total = self.sent
        if total == 0:
            print("\nNo transactions sent.")
            return
        avg_lat = sum(self.latencies) / len(self.latencies)
        p95_lat = sorted(self.latencies)[int(len(self.latencies) * 0.95)] if self.latencies else 0
        print("\n" + "=" * 70)
        print("  AEGIS v2 ARCHITECTURE — MOCK TRANSACTION LOAD SUMMARY")
        print("=" * 70)
        print(f"  Total sent      : {total}")
        print(f"  Accepted (2xx)  : {self.accepted}  ({self.accepted/total*100:.1f}%)")
        print(f"  Failed          : {self.failed}  ({self.failed/total*100:.1f}%)")
        print("-" * 70)
        print("  WORKFLOW CASE BREAKDOWN:")
        for case_k, count in sorted(self.case_counts.items()):
            print(f"   • {case_k:<20} : {count:>5} transactions  ({count/total*100:.1f}%)")
        print("-" * 70)
        print(f"  Latency Avg     : {avg_lat:.1f} ms")
        print(f"  Latency P95     : {p95_lat:.1f} ms")
        print("=" * 70)


# ──────────────────────────────────────────────────────────────────────────────
# Async Sender
# ──────────────────────────────────────────────────────────────────────────────

async def send_one(
    client: httpx.AsyncClient,
    url: str,
    payload: dict[str, Any],
    case_key: str,
    case_label: str,
    stats: Stats,
    verbose: bool,
    api_key: str,
) -> None:
    start = time.perf_counter()
    headers = {"X-Bank-API-Key": api_key} if api_key else {}
    try:
        resp = await client.post(url, json=payload, headers=headers, timeout=10.0)
        latency_ms = (time.perf_counter() - start) * 1000
        stats.record(latency_ms, resp.status_code, case_key)
        status_icon = "✓" if resp.status_code in (200, 201, 202) else "✗"
        if verbose or resp.status_code not in (200, 201, 202):
            body_preview = resp.text[:80].replace("\n", "")
            print(
                f"  {status_icon} {case_label:<32} "
                f"₹{payload['amount']:>10,.2f}  "
                f"{resp.status_code}  {latency_ms:6.1f}ms  {body_preview}"
            )
        else:
            print(
                f"  {status_icon} {case_label:<32} "
                f"₹{payload['amount']:>10,.2f}  "
                f"{resp.status_code}  {latency_ms:6.1f}ms"
            )
    except httpx.RequestError as exc:
        latency_ms = (time.perf_counter() - start) * 1000
        stats.record(latency_ms, 0, case_key)
        print(f"  ✗ NETWORK ERROR: {exc}", file=sys.stderr)


async def run(
    api_url: str,
    count: int,
    mode: str,
    rps: float,
    concurrency: int,
    verbose: bool,
    account_pool_size: int,
    api_key: str,
) -> Stats:
    ingest_url = f"{api_url.rstrip('/')}/api/v1/ingest/transactions"
    accounts = [_rand_account(account_pool_size) for _ in range(account_pool_size)]
    stats = Stats()
    semaphore = asyncio.Semaphore(concurrency)
    min_interval = 1.0 / rps if rps > 0 else 0.0

    print(f"\n  Aegis Mock Transactions (v2 Architecture) → {ingest_url}")
    print(f"  mode={mode.upper()}  count={count or '∞'}  rps={rps}  concurrency={concurrency}")
    print("-" * 70)

    async with httpx.AsyncClient() as client:
        tasks: list[asyncio.Task] = []
        i = 0
        while count == 0 or i < count:
            account_id = random.choice(accounts)
            payload, case_key, case_label = select_payload(mode, account_id)

            async def _bounded(p=payload, k=case_key, lbl=case_label):
                async with semaphore:
                    await send_one(client, ingest_url, p, k, lbl, stats, verbose, api_key)

            task = asyncio.create_task(_bounded())
            tasks.append(task)
            i += 1

            if min_interval > 0:
                await asyncio.sleep(min_interval)

        await asyncio.gather(*tasks, return_exceptions=True)

    return stats


# ──────────────────────────────────────────────────────────────────────────────
# CLI Parsing & Main
# ──────────────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Aegis v2 Corrected Architecture Mock Transaction Generator",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument(
        "--api-url",
        default="http://localhost:8080",
        help="Base URL of the Aegis API server",
    )
    p.add_argument(
        "--count",
        type=int,
        default=300,
        help="Number of transactions to generate across the test suite (at least 300 recommended).",
    )
    p.add_argument(
        "--mode",
        choices=["all", "legit", "borderline", "critical", "vip", "ato", "block"],
        default="all",
        help="Select which architectural case to generate (all = balanced mix of all 6 cases).",
    )
    p.add_argument(
        "--rps",
        type=float,
        default=15.0,
        help="Target requests per second (0 = unlimited burst)",
    )
    p.add_argument(
        "--concurrency",
        type=int,
        default=10,
        help="Max concurrent in-flight HTTP requests",
    )
    p.add_argument(
        "--account-pool",
        type=int,
        default=30,
        help="Number of distinct account IDs to cycle through",
    )
    p.add_argument(
        "--verbose",
        action="store_true",
        help="Print full response body for each request",
    )

    default_api_key = ""
    try:
        from pathlib import Path
        env_path = Path(__file__).parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("BANK_API_KEY="):
                    default_api_key = line.split("=", 1)[1].strip('"\'')
                    break
    except Exception:
        pass

    p.add_argument(
        "--api-key",
        default=default_api_key,
        help="API key for X-Bank-API-Key header",
    )
    return p


def main() -> None:
    args = build_parser().parse_args()

    if args.concurrency < 1:
        print("[ERROR] --concurrency must be at least 1", file=sys.stderr)
        sys.exit(1)

    try:
        stats = asyncio.run(
            run(
                api_url=args.api_url,
                count=args.count,
                mode=args.mode,
                rps=args.rps,
                concurrency=args.concurrency,
                verbose=args.verbose,
                account_pool_size=args.account_pool,
                api_key=args.api_key,
            )
        )
    except KeyboardInterrupt:
        print("\n[Interrupted by user]")
        stats = Stats()

    stats.print_summary()


if __name__ == "__main__":
    main()
