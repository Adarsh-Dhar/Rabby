/**
 * File-backed event store.
 *
 * Events are written to `tmp/realtime-events.json` so they persist across
 * restarts and can be inspected directly. The prover reads from the same
 * file and updates individual records in-place.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../'
);
export const STORE_PATH = path.join(ROOT, 'tmp', 'realtime-events.json');

export type EventStatus = 'Pending' | 'Verified' | 'Failed';

export interface ProtocolEvent {
  /** Unique key: `${protocol}:${txHash}:${logIndex}` */
  id: string;
  protocol: 'aave' | 'liquity' | 'compound';
  action: string;
  /** The primary contract address involved (pool, cdp manager, etc.) */
  contractAddress: string;
  /** Raw amount from the log, as a decimal string */
  amount: string;
  /** Unix timestamp in ms */
  timestamp: number;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  status: EventStatus;
}

type Store = { events: ProtocolEvent[] };

function readStore(): Store {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as Store;
  } catch {
    return { events: [] };
  }
}

function writeStore(store: Store): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

/** Insert new events, skipping duplicates by id. Returns count added. */
export function upsertEvents(incoming: ProtocolEvent[]): number {
  const store = readStore();
  const existing = new Set(store.events.map((e) => e.id));
  const fresh = incoming.filter((e) => !existing.has(e.id));
  store.events.push(...fresh);
  if (fresh.length > 0) writeStore(store);
  return fresh.length;
}

/** Update the status of a single event. */
export function updateEventStatus(id: string, status: EventStatus): void {
  const store = readStore();
  const ev = store.events.find((e) => e.id === id);
  if (ev && ev.status !== status) {
    ev.status = status;
    writeStore(store);
  }
}

/** Return all events, optionally filtered by status. */
export function getEvents(filter?: { status?: EventStatus }): ProtocolEvent[] {
  const store = readStore();
  if (!filter?.status) return store.events;
  return store.events.filter((e) => e.status === filter.status);
}
