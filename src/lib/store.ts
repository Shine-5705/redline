import { openDB, type IDBPDatabase } from 'idb';

export type Source = 'on_device' | 'in_cloud';

export interface Correction {
  id: string;
  ticketId: string;
  createdAt: number;
  draft: string;      // model draft (placeholders, never raw PII)
  final: string;      // agent's edited reply (placeholders)
  added: number;      // words added
  removed: number;    // words removed
  status: 'distilled' | 'held' | 'manual' | 'accepted'; // accepted = sent unchanged
  ruleId?: string;
}

export interface Rule {
  id: string;
  text: string;
  category: 'tone' | 'policy' | 'format' | 'facts' | 'other';
  createdAt: number;
  distilledBy: Source | 'manual';
  correctionId?: string;
  active: boolean;
  promoted: boolean;
  promotedAt?: number;
  uses: number;
}

export interface LedgerEntry {
  id: string;
  at: number;
  feature: 'draft' | 'distill' | 'promote-check';
  mode: string;          // requested InferenceMode
  source: Source | 'blocked' | 'error';
  model: string;
  latencyMs: number;
  promptChars: number;
  charsOffDevice: number; // characters that left the device (0 when on-device)
  piiRedacted: number;
  piiInPrompt: number;    // independent re-scan of the exact prompt sent
  note?: string;
}

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB('redline', 1, {
    upgrade(d) {
      d.createObjectStore('corrections', { keyPath: 'id' });
      d.createObjectStore('rules', { keyPath: 'id' });
      d.createObjectStore('ledger', { keyPath: 'id' });
    },
  });
  return dbp;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export async function all<T>(store: 'corrections' | 'rules' | 'ledger'): Promise<T[]> {
  return (await (await db()).getAll(store)) as T[];
}
export async function put(store: 'corrections' | 'rules' | 'ledger', v: unknown) {
  await (await db()).put(store, v);
}
export async function del(store: 'corrections' | 'rules' | 'ledger', id: string) {
  await (await db()).delete(store, id);
}
export async function clearAll() {
  const d = await db();
  await Promise.all(['corrections', 'rules', 'ledger'].map((s) => d.clear(s)));
}
