/**
 * Protocol indexer — polls eth_getLogs for Aave V3, Liquity V1, and Compound V2
 * on Ethereum mainnet and writes new events into the store.
 *
 * Each protocol exposes a different set of event signatures; we decode only the
 * fields we need (action label, primary address, amount) from the raw log data.
 *
 * RPC: reads ETH_RPC_URL from the environment, falls back to Cloudflare's
 * public Ethereum gateway so the script works out-of-the-box.
 */

import { upsertEvents, type ProtocolEvent } from './store.ts';

// ---------------------------------------------------------------------------
// RPC helpers
// ---------------------------------------------------------------------------

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

async function getLatestBlock(): Promise<number> {
  const hex = (await rpcCall('eth_blockNumber', [])) as string;
  return parseInt(hex, 16);
}

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
  blockTimestamp?: string; // not all nodes return this
}

async function getLogs(filter: {
  address?: string | string[];
  topics: (string | null | string[])[];
  fromBlock: string;
  toBlock: string;
}): Promise<RawLog[]> {
  return (await rpcCall('eth_getLogs', [filter])) as RawLog[];
}

// ---------------------------------------------------------------------------
// Keccak256 topic constants (computed via viem's keccak256(toBytes(sig)))
// ---------------------------------------------------------------------------

// keccak256("Supply(address,address,address,uint256,uint16)")
const AAVE_SUPPLY =
  '0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61';
// keccak256("Withdraw(address,address,address,uint256)")
const AAVE_WITHDRAW =
  '0x3115d1449a7b732c986cba18244e897a450f61e1bb8d589cd2e69e6c8924f9f7';
// keccak256("Borrow(address,address,address,uint256,uint8,uint256,uint16)")
const AAVE_BORROW =
  '0xb3d084820fb1a9decffb176436bd02558d15fac9b0ddfed8c465bc7359d7dce0';
// keccak256("Repay(address,address,address,uint256,bool)")
const AAVE_REPAY =
  '0xa534c8dbe71f871f9f3530e97a74601fea17b426cae02e1c5aee42c96c784051';

// keccak256("TroveUpdated(address,uint256,uint256,uint256,uint8)")
const LIQUITY_TROVE_UPDATED =
  '0xc3770d654ed33aeea6bf11ac8ef05d02a6a04ed4686dd2f624d853bbec43cc8b';
// keccak256("TroveLiquidated(address,uint256,uint256,uint8)")
const LIQUITY_TROVE_LIQUIDATED =
  '0xea67486ed7ebe3eea8ab3390efd4a3c8aae48be5bea27df104a8af786c408434';

// keccak256("Mint(address,uint256,uint256)")   Compound V2 cToken
const COMPOUND_MINT =
  '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f';
// keccak256("Redeem(address,uint256,uint256)")
const COMPOUND_REDEEM =
  '0xe5b754fb1abb7f01b499791d0b820ae3b6af3424ac1c59768edb53f4ec31a929';
// keccak256("Borrow(address,uint256,uint256,uint256)")
const COMPOUND_BORROW =
  '0x13ed6866d4e1ee6da46f845c46d7e54120883d75c5ea9a2dacc1c4ca8984ab80';
// keccak256("RepayBorrow(address,address,uint256,uint256,uint256)")
const COMPOUND_REPAY =
  '0x1a2a22cb034d26d1854bdc6666a5b91fe25efbbb5dcad3b0355478d6f5c362a1';

// ---------------------------------------------------------------------------
// Contract addresses (Ethereum mainnet, checksummed)
// ---------------------------------------------------------------------------

const AAVE_V3_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';

// Liquity V1 TroveManager
const LIQUITY_TROVE_MANAGER = '0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2';

// A representative set of Compound V2 cToken contracts
const COMPOUND_CTOKENS = [
  '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643', // cDAI
  '0x39AA39c021dfbaE8faC545936693aC917d5E7563', // cUSDC
  '0xf650C3d88D12dB855b8bf7D11Be6C55A4e07dCC9', // cUSDT
  '0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5', // cETH
];

// ---------------------------------------------------------------------------
// Decoders — all log data is ABI-encoded; we decode only the fields we need
// ---------------------------------------------------------------------------

/** Decode a uint256 from 32-byte padded hex, return as decimal string. */
function decodeUint256(hex32: string): string {
  return BigInt(hex32).toString();
}

/** Pull a 20-byte address out of a 32-byte ABI word. */
function decodeAddress(hex32: string): string {
  return '0x' + hex32.slice(26);
}

function decodeAaveEvent(
  topicSig: string,
  log: RawLog,
  blockTs: number
): ProtocolEvent | null {
  const actionMap: Record<string, string> = {
    [AAVE_SUPPLY]: 'Supply',
    [AAVE_WITHDRAW]: 'Withdraw',
    [AAVE_BORROW]: 'Borrow',
    [AAVE_REPAY]: 'Repay',
  };
  const action = actionMap[topicSig];
  if (!action) return null;
  if (!log.topics[1] || !log.data || log.data.length < 66) return null;

  // topics[1] = reserve address (indexed)
  const contractAddress = decodeAddress(log.topics[1]);
  // data = amount (first 32 bytes, possibly followed by more fields)
  const amount = decodeUint256('0x' + log.data.slice(2, 66));

  return {
    id: `aave:${log.transactionHash}:${parseInt(log.logIndex, 16)}`,
    protocol: 'aave',
    action,
    contractAddress,
    amount,
    timestamp: blockTs,
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
    logIndex: parseInt(log.logIndex, 16),
    status: 'Pending',
  };
}

function decodeLiquityEvent(
  topicSig: string,
  log: RawLog,
  blockTs: number
): ProtocolEvent | null {
  const actionMap: Record<string, string> = {
    [LIQUITY_TROVE_UPDATED]: 'Repay',
    [LIQUITY_TROVE_LIQUIDATED]: 'Borrow',
  };
  if (!log.topics[1] || !log.data || log.data.length < 66) return null;

  let action = actionMap[topicSig] ?? 'TroveUpdated';
  if (topicSig === LIQUITY_TROVE_UPDATED && log.topics[2]) {
    const op = parseInt(log.topics[2], 16);
    // 0=openTrove,1=closeTrove,2=adjustTrove
    if (op === 0) action = 'Supply';
    else if (op === 1) action = 'Withdraw';
    else action = 'Repay';
  }

  // topics[1] = borrower address
  const contractAddress = decodeAddress(log.topics[1]);
  // data words: debt, coll, stake, operation (TroveUpdated)
  const amount = decodeUint256('0x' + log.data.slice(2, 66));

  return {
    id: `liquity:${log.transactionHash}:${parseInt(log.logIndex, 16)}`,
    protocol: 'liquity',
    action,
    contractAddress,
    amount,
    timestamp: blockTs,
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
    logIndex: parseInt(log.logIndex, 16),
    status: 'Pending',
  };
}

function decodeCompoundEvent(
  topicSig: string,
  log: RawLog,
  blockTs: number
): ProtocolEvent | null {
  const actionMap: Record<string, string> = {
    [COMPOUND_MINT]: 'Supply',
    [COMPOUND_REDEEM]: 'Withdraw',
    [COMPOUND_BORROW]: 'Borrow',
    [COMPOUND_REPAY]: 'Repay',
  };
  const action = actionMap[topicSig];
  if (!action) return null;
  if (!log.topics[1] || !log.data || log.data.length < 66) return null;

  // For Compound events the minter/redeemer/borrower is topics[1]
  const contractAddress = decodeAddress(log.topics[1]);
  // First 32-byte word of data is the underlying amount
  const amount = decodeUint256('0x' + log.data.slice(2, 66));

  return {
    id: `compound:${log.transactionHash}:${parseInt(log.logIndex, 16)}`,
    protocol: 'compound',
    action,
    contractAddress,
    amount,
    timestamp: blockTs,
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
    logIndex: parseInt(log.logIndex, 16),
    status: 'Pending',
  };
}

// ---------------------------------------------------------------------------
// Block timestamp cache — avoid fetching the same block twice
// ---------------------------------------------------------------------------

const tsCache = new Map<number, number>();

async function getBlockTimestamp(blockNumber: number): Promise<number> {
  if (tsCache.has(blockNumber)) return tsCache.get(blockNumber)!;
  const block = (await rpcCall('eth_getBlockByNumber', [
    '0x' + blockNumber.toString(16),
    false,
  ])) as { timestamp: string } | null;
  const ts = block ? parseInt(block.timestamp, 16) * 1000 : Date.now();
  tsCache.set(blockNumber, ts);
  return ts;
}

// ---------------------------------------------------------------------------
// Main indexer loop
// ---------------------------------------------------------------------------

/** How far back we look on the first run (approximately 1 hour of blocks). */
const INITIAL_LOOKBACK = 300;
/** How many blocks to fetch per getLogs call (stays well under node limits). */
const CHUNK_SIZE = 50;

let lastIndexedBlock = 0;

/** Encode a block number as a canonical 0x-prefixed hex quantity (no leading zeros). */
function toBlockHex(n: number): string {
  return '0x' + n.toString(16);
}

export async function runIndexerOnce(): Promise<void> {
  const latest = await getLatestBlock();
  const fromBlock = lastIndexedBlock === 0
    ? latest - INITIAL_LOOKBACK
    : lastIndexedBlock + 1;

  if (fromBlock > latest) return; // nothing new

  // Process in chunks to avoid oversized getLogs responses
  for (let from = fromBlock; from <= latest; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, latest);
    const fromHex = toBlockHex(from);
    const toHex = toBlockHex(to);

    const aaveLogs = await getLogs({
      address: AAVE_V3_POOL,
      topics: [[AAVE_SUPPLY, AAVE_WITHDRAW, AAVE_BORROW, AAVE_REPAY]],
      fromBlock: fromHex,
      toBlock: toHex,
    });

    const liquityLogs = await getLogs({
      address: LIQUITY_TROVE_MANAGER,
      topics: [[LIQUITY_TROVE_UPDATED, LIQUITY_TROVE_LIQUIDATED]],
      fromBlock: fromHex,
      toBlock: toHex,
    });

    const compoundLogs = await getLogs({
      address: COMPOUND_CTOKENS,
      topics: [[COMPOUND_MINT, COMPOUND_REDEEM, COMPOUND_BORROW, COMPOUND_REPAY]],
      fromBlock: fromHex,
      toBlock: toHex,
    });

    const allLogs = [...aaveLogs, ...liquityLogs, ...compoundLogs];

    const events: ProtocolEvent[] = [];
    for (const log of allLogs) {
      const sig = log.topics[0];
      if (!sig) continue;
      try {
        const blockTs = await getBlockTimestamp(parseInt(log.blockNumber, 16));

        let ev: ProtocolEvent | null = null;
        if ([AAVE_SUPPLY, AAVE_WITHDRAW, AAVE_BORROW, AAVE_REPAY].includes(sig)) {
          ev = decodeAaveEvent(sig, log, blockTs);
        } else if ([LIQUITY_TROVE_UPDATED, LIQUITY_TROVE_LIQUIDATED].includes(sig)) {
          ev = decodeLiquityEvent(sig, log, blockTs);
        } else if ([COMPOUND_MINT, COMPOUND_REDEEM, COMPOUND_BORROW, COMPOUND_REPAY].includes(sig)) {
          ev = decodeCompoundEvent(sig, log, blockTs);
        }
        if (ev) events.push(ev);
      } catch (err) {
        // Skip malformed logs rather than aborting the whole batch
        console.warn(`[indexer] skipped log ${log.transactionHash}:${log.logIndex}: ${(err as Error).message}`);
      }
    }

    const added = upsertEvents(events);
    if (added > 0) {
      console.log(
        `[indexer] blocks ${from}–${to}: +${added} new events (${events.length} decoded from ${allLogs.length} logs)`
      );
    }
  }

  lastIndexedBlock = latest;
}
