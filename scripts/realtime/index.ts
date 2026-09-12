#!/usr/bin/env node
/**
 * pnpm run realtime
 *
 * Continuously indexes on-chain events from Aave V3, Liquity V1, and
 * Compound V2 on Ethereum mainnet, then proves each pending event by
 * checking its transaction receipt.
 *
 * Usage:
 *   pnpm run realtime               # continuous mode (default)
 *   pnpm run realtime --once        # single pass, then exit
 *
 * Environment:
 *   ETH_RPC_URL   Ethereum JSON-RPC endpoint (default: Cloudflare public)
 *   POLL_INTERVAL_MS  Milliseconds between passes (default: 30000)
 */

import { runIndexerOnce } from './indexer.ts';
import { runProverOnce } from './prover.ts';
import { STORE_PATH, getEvents } from './store.ts';

const POLL_MS = Number(process.env.POLL_INTERVAL_MS ?? 30_000);
const RPC_URL = process.env.ETH_RPC_URL ?? 'https://cloudflare-eth.com';
const ONCE = process.argv.includes('--once');

console.log('='.repeat(60));
console.log('  Rabby realtime indexer + prover');
console.log('='.repeat(60));
console.log(`  RPC        : ${RPC_URL}`);
console.log(`  Store      : ${STORE_PATH}`);
console.log(`  Poll every : ${ONCE ? 'single pass' : `${POLL_MS / 1000}s`}`);
console.log(`  Protocols  : aave-v3, liquity-v1, compound-v2`);
console.log('='.repeat(60));
console.log();

async function runOnce(): Promise<void> {
  const start = Date.now();

  // 1. Index new on-chain events
  try {
    await runIndexerOnce();
  } catch (err) {
    console.error('[index] error:', (err as Error).message);
  }

  // 2. Prove all pending events
  try {
    await runProverOnce();
  } catch (err) {
    console.error('[prove] error:', (err as Error).message);
  }

  // 3. Print a quick summary
  const all = getEvents();
  const byProtocol = { aave: 0, liquity: 0, compound: 0 } as Record<string, number>;
  const byStatus = { Pending: 0, Verified: 0, Failed: 0 } as Record<string, number>;
  for (const ev of all) {
    byProtocol[ev.protocol] = (byProtocol[ev.protocol] ?? 0) + 1;
    byStatus[ev.status] = (byStatus[ev.status] ?? 0) + 1;
  }

  console.log(
    `[summary] total=${all.length} ` +
      `| aave=${byProtocol.aave} liquity=${byProtocol.liquity} compound=${byProtocol.compound} ` +
      `| Pending=${byStatus.Pending ?? 0} Verified=${byStatus.Verified ?? 0} Failed=${byStatus.Failed ?? 0} ` +
      `| elapsed=${Date.now() - start}ms`
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (ONCE) {
  await runOnce();
  process.exit(0);
} else {
  // Run immediately, then on a fixed interval.
  await runOnce();
  setInterval(async () => {
    try {
      await runOnce();
    } catch (err) {
      console.error('[loop] unexpected error:', (err as Error).message);
    }
  }, POLL_MS);
}
