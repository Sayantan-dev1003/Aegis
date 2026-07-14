#!/usr/bin/env python3
"""
Aegis — Mock Transaction Load Generator
========================================
Sends realistic (and adversarial-fraud) transaction payloads to the
POST /api/v1/ingest/transactions endpoint.

Usage examples
--------------
# 50 transactions at 5 RPS, 20% fraud, using default localhost URL
python scripts/mock_transactions.py --count 50 --rps 5 --fraud-ratio 0.2

# 200 transactions, 10 concurrent workers, all legit
python scripts/mock_transactions.py --count 200 --concurrency 10 --fraud-ratio 0

# Continuous burst — runs until Ctrl+C
python scripts/mock_transactions.py --count 0 --rps 10 --fraud-ratio 0.15

Requirements
------------
pip install httpx  (already in venv if httpx is present, else: pip install httpx)
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
# Realistic data pools
# ──────────────────────────────────────────────────────────────────────────────

_MERCHANTS = [
    ("M_AMAZON",    "Amazon",          "retail",       "IN"),
    ("M_FLIPKART",  "Flipkart",        "retail",       "IN"),
    ("M_SWIGGY",    "Swiggy",          "food_delivery","IN"),
    ("M_ZOMATO",    "Zomato",          "food_delivery","IN"),
    ("M_UBER",      "Uber",            "transport",    "IN"),
    ("M_PAYTM",     "Paytm",           "fintech",      "IN"),
    ("M_NETFLIX",   "Netflix",         "streaming",    "IN"),
    ("M_BIGBAZAAR", "Big Bazaar",      "grocery",      "IN"),
    ("M_MYNTRA",    "Myntra",          "fashion",      "IN"),
    ("M_MAKEMYTRIP","MakeMyTrip",      "travel",       "IN"),
]

_FRAUD_MERCHANTS = [
    ("M_SHADOW1",   "Tech Solutions",  "electronics",  "RU"),
    ("M_SHADOW2",   "Global Imports",  "wholesale",    "NG"),
    ("M_SHADOW3",   "QuickBuy Store",  "retail",       "PH"),
]

_CHANNELS        = ["online", "pos", "atm"]
_TX_TYPES        = ["purchase", "withdrawal", "transfer"]
_CURRENCIES      = ["INR"]
_DEVICE_PREFIXES = ["DEV", "MOB", "TAB"]


def _rand_account() -> str:
    return f"ACCT_{random.randint(1000, 9999)}"


def _rand_device() -> str | None:
    if random.random() < 0.85:          # 85% transactions have a device_id
        prefix = random.choice(_DEVICE_PREFIXES)
        return f"{prefix}_{random.randint(10000, 99999)}"
    return None


def _rand_ip() -> str | None:
    if random.random() < 0.7:
        return f"{random.randint(1,254)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"
    return None


def _legit_payload(account_id: str) -> dict[str, Any]:
    """Generates a plausible legitimate transaction payload."""
    merchant = random.choice(_MERCHANTS)
    now = datetime.now(timezone.utc)
    # Legit: business hours (8:00–22:00), moderate amounts
    hour_offset = random.randint(0, 14) - 6          # −6h to +8h around now
    ts = now + timedelta(hours=hour_offset)
    if ts > now:
        ts = now - timedelta(minutes=random.randint(1, 30))

    amount = round(random.uniform(50, 8_000), 2)
    device = _rand_device()

    payload: dict[str, Any] = {
        "external_id":        str(uuid.uuid4()),
        "account_id":         account_id,
        "merchant_id":        merchant[0],
        "merchant_name":      merchant[1],
        "merchant_category":  merchant[2],
        "amount":             amount,
        "currency":           "INR",
        "country_code":       merchant[3],
        "transaction_type":   "purchase",
        "channel":            random.choice(["online", "pos"]),
        "timestamp":          ts.isoformat(),
    }
    if device:
        payload["device_id"] = device
    ip = _rand_ip()
    if ip:
        payload["ip_address"] = ip
    return payload


def _fraud_payload(account_id: str) -> dict[str, Any]:
    """
    Generates an adversarial fraud transaction:
    - Unusually high amount (₹50k–₹5L)
    - Night hours (00:00–04:59 local)
    - Foreign / shadow merchant
    - New/rotating device IDs
    - Multiple rapid transfers pattern
    """
    merchant = random.choice(_FRAUD_MERCHANTS)
    now = datetime.now(timezone.utc)
    # Force a late-night timestamp (00:00–04:59 UTC)
    night_hour = random.randint(0, 4)
    ts = now.replace(hour=night_hour, minute=random.randint(0, 59), second=random.randint(0, 59))
    if ts > now:
        ts -= timedelta(days=1)

    amount = round(random.uniform(50_000, 500_000), 2)

    payload: dict[str, Any] = {
        "external_id":        str(uuid.uuid4()),
        "account_id":         account_id,
        "merchant_id":        merchant[0],
        "merchant_name":      merchant[1],
        "merchant_category":  merchant[2],
        "amount":             amount,
        "currency":           "INR",
        "country_code":       merchant[3],
        "transaction_type":   random.choice(["purchase", "transfer"]),
        "channel":            "online",
        "timestamp":          ts.isoformat(),
        # New device each time — device_id churn is a strong fraud signal
        "device_id":          f"DEV_{uuid.uuid4().hex[:8].upper()}",
        "ip_address":         f"{random.randint(1,254)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}",
    }
    return payload


# ──────────────────────────────────────────────────────────────────────────────
# Stats tracker
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class Stats:
    sent:     int = 0
    accepted: int = 0
    failed:   int = 0
    fraud_sent: int = 0
    latencies: list[float] = field(default_factory=list)

    def record(self, latency_ms: float, status_code: int, is_fraud: bool) -> None:
        self.sent += 1
        self.latencies.append(latency_ms)
        if is_fraud:
            self.fraud_sent += 1
        if status_code in (200, 202):
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
        print("\n" + "=" * 60)
        print(f"  AEGIS LOAD GENERATOR — SUMMARY")
        print("=" * 60)
        print(f"  Total sent    : {total}")
        print(f"  Accepted (2xx): {self.accepted}  ({self.accepted/total*100:.1f}%)")
        print(f"  Failed        : {self.failed}  ({self.failed/total*100:.1f}%)")
        print(f"  Fraud payloads: {self.fraud_sent}  ({self.fraud_sent/total*100:.1f}%)")
        print(f"  Latency avg   : {avg_lat:.1f} ms")
        print(f"  Latency p95   : {p95_lat:.1f} ms")
        print("=" * 60)


# ──────────────────────────────────────────────────────────────────────────────
# Async worker
# ──────────────────────────────────────────────────────────────────────────────

async def send_one(
    client: httpx.AsyncClient,
    url: str,
    payload: dict[str, Any],
    is_fraud: bool,
    stats: Stats,
    verbose: bool,
) -> None:
    start = time.perf_counter()
    try:
        resp = await client.post(url, json=payload, timeout=10.0)
        latency_ms = (time.perf_counter() - start) * 1000
        stats.record(latency_ms, resp.status_code, is_fraud)
        tag = "🔴 FRAUD" if is_fraud else "✅ LEGIT"
        status_icon = "✓" if resp.status_code in (200, 202) else "✗"
        if verbose or resp.status_code not in (200, 202):
            body_preview = resp.text[:80].replace("\n", "")
            print(
                f"  {status_icon} {tag}  {payload['account_id']:<12} "
                f"₹{payload['amount']:>10,.2f}  "
                f"{resp.status_code}  {latency_ms:6.1f}ms  {body_preview}"
            )
        else:
            # Compact one-liner
            print(
                f"  {status_icon} {tag}  {payload['account_id']:<12} "
                f"₹{payload['amount']:>10,.2f}  "
                f"{resp.status_code}  {latency_ms:6.1f}ms"
            )
    except httpx.RequestError as exc:
        latency_ms = (time.perf_counter() - start) * 1000
        stats.record(latency_ms, 0, is_fraud)
        print(f"  ✗ NETWORK ERROR: {exc}", file=sys.stderr)


async def run(
    api_url: str,
    count: int,
    fraud_ratio: float,
    rps: float,
    concurrency: int,
    verbose: bool,
    account_pool_size: int,
) -> Stats:
    ingest_url = f"{api_url.rstrip('/')}/api/v1/ingest/transactions"
    # Pre-generate a small account pool — re-used across transactions to build history
    accounts = [_rand_account() for _ in range(account_pool_size)]

    stats = Stats()
    semaphore = asyncio.Semaphore(concurrency)

    min_interval = 1.0 / rps if rps > 0 else 0.0
    i = 0

    print(f"\n  Aegis Mock Transactions → {ingest_url}")
    print(f"  count={count or '∞'}  rps={rps}  concurrency={concurrency}  fraud_ratio={fraud_ratio:.0%}")
    print("-" * 60)

    async with httpx.AsyncClient() as client:
        tasks: list[asyncio.Task] = []

        while count == 0 or i < count:
            account_id = random.choice(accounts)
            is_fraud   = random.random() < fraud_ratio
            payload    = _fraud_payload(account_id) if is_fraud else _legit_payload(account_id)

            async def _bounded(p=payload, f=is_fraud):
                async with semaphore:
                    await send_one(client, ingest_url, p, f, stats, verbose)

            task = asyncio.create_task(_bounded())
            tasks.append(task)
            i += 1

            if min_interval > 0:
                await asyncio.sleep(min_interval)

        # Wait for all in-flight tasks
        await asyncio.gather(*tasks, return_exceptions=True)

    return stats


# ──────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ──────────────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Aegis Mock Transaction Load Generator",
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
        default=50,
        help="Number of transactions to send. Use 0 for continuous mode (Ctrl+C to stop).",
    )
    p.add_argument(
        "--rps",
        type=float,
        default=5.0,
        help="Target requests per second (0 = unlimited burst)",
    )
    p.add_argument(
        "--concurrency",
        type=int,
        default=5,
        help="Max concurrent in-flight HTTP requests",
    )
    p.add_argument(
        "--fraud-ratio",
        type=float,
        default=0.15,
        help="Fraction of transactions to send as adversarial/fraud payloads (0.0–1.0)",
    )
    p.add_argument(
        "--account-pool",
        type=int,
        default=20,
        help="Number of distinct account IDs to cycle through",
    )
    p.add_argument(
        "--verbose",
        action="store_true",
        help="Print full response body for each request",
    )
    return p


def main() -> None:
    args = build_parser().parse_args()

    if not 0.0 <= args.fraud_ratio <= 1.0:
        print("[ERROR] --fraud-ratio must be between 0.0 and 1.0", file=sys.stderr)
        sys.exit(1)
    if args.concurrency < 1:
        print("[ERROR] --concurrency must be at least 1", file=sys.stderr)
        sys.exit(1)

    try:
        stats = asyncio.run(
            run(
                api_url=args.api_url,
                count=args.count,
                fraud_ratio=args.fraud_ratio,
                rps=args.rps,
                concurrency=args.concurrency,
                verbose=args.verbose,
                account_pool_size=args.account_pool,
            )
        )
    except KeyboardInterrupt:
        print("\n[Interrupted by user]")
        stats = Stats()   # partial stats already printed

    stats.print_summary()


if __name__ == "__main__":
    main()
