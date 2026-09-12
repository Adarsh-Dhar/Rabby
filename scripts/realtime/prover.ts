/**
 * On-chain prover — checks transaction receipts for all Pending events and
 * transitions them to Verified (receipt status 0x1) or Failed (status 0x0).
 *
 * We batch receipt lookups with Promise.all and throttle to avoid rate-limiting
 * on public RPC nodes. The prover runs after each indexer pass.
 */

import { getEvents, updateEventStatus } from './store.ts';

const RPC_URL =
  process.env.ETH_RPC_URL ?? 'https://cloudflare-eth.com';

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

interface TxReceipt {
  status: string; // "0x1" = success, "0x0" = failed
  transactionHash: string;
}

async function getTransactionReceipt(txHash: string): Promise<TxReceipt | null> {
  return (await rpcCall('eth_getTransactionReceipt', [txHash])) as TxReceipt | null;
}

/** Max concurrent receipt lookups — keeps us below public node rate limits. */
const CONCURRENCY = 10;

async function processInBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function runProverOnce(): Promise<void> {
  const pending = getEvents({ status: 'Pending' });
  if (pending.length === 0) return;

  console.log(`[prover] checking ${pending.length} pending event(s)…`);

  let verified = 0;
  let failed = 0;
  let missing = 0;

  await processInBatches(
    pending,
    async (ev) => {
      try {
        const receipt = await getTransactionReceipt(ev.txHash);
        if (!receipt) {
          // tx not yet mined — stay Pending
          missing++;
          return;
        }
        if (receipt.status === '0x1') {
          updateEventStatus(ev.id, 'Verified');
          verified++;
        } else {
          updateEventStatus(ev.id, 'Failed');
          failed++;
        }
      } catch (err) {
        // Network / RPC error — leave Pending so we retry next round
        console.warn(`[prover] receipt lookup failed for ${ev.txHash}: ${(err as Error).message}`);
      }
    },
    CONCURRENCY
  );

  console.log(
    `[prover] done — ✓ ${verified} verified, ✗ ${failed} failed, ⏳ ${missing} still pending`
  );
}
