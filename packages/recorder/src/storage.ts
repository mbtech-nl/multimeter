// IndexedDB persistence for recordings (PLAN §3.3, plan-7.md §3.3). Recordings survive a reload or
// an accidental disconnect, and CSV export reads full-resolution Readings straight from here —
// never the decimated chart series (§3.3). No external DB lib; raw IndexedDB behind a small
// promise wrapper. All IO lives here so hooks/components stay storage-agnostic.
//
// Phase 7: multi-channel. The `samples` store is keyed [sessionId, channelId, seq], so a recording
// stores each meter/derived channel as its own ordered run. The key path changed, and key paths are
// immutable per store, so the upgrade **deletes and recreates** the store — destructive, dropping
// any pre-Phase-7 dev recordings (fine pre-1.0, no back-compat). DB_VERSION is bumped accordingly.

import type { Reading, Session } from '@ble-multimeter/protocol';

const DB_NAME = 'ut60bt';
const DB_VERSION = 2; // bumped for the multi-channel re-key (destructive)
const SESSIONS = 'sessions';
const SAMPLES = 'samples';

// One stored sample row. The composite key [sessionId, channelId, seq] keeps each channel's samples
// contiguous and ordered within a session, so a range scan reads one channel back in capture order.
interface SampleRow {
  sessionId: string;
  channelId: string;
  seq: number;
  r: Reading;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSIONS)) {
        db.createObjectStore(SESSIONS, { keyPath: 'id' });
      }
      // Re-key samples to [sessionId, channelId, seq]. The key path is immutable, so we drop and
      // recreate — any existing dev recordings' samples are wiped (the session index rows survive,
      // but their samples are gone; acceptable pre-1.0). New sessions are multi-channel from here.
      if (db.objectStoreNames.contains(SAMPLES)) db.deleteObjectStore(SAMPLES);
      db.createObjectStore(SAMPLES, { keyPath: ['sessionId', 'channelId', 'seq'] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Resolve when the transaction commits (not just when the request succeeds) so callers
// can trust the data is durable before continuing.
function tx(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  body: (t: IDBTransaction) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
    body(t);
  });
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// All [sessionId, *] keys (every channel + seq of one session): [id] sorts before any
// [id, channelId, …], and [id, []] after any of them (arrays rank above strings/numbers in
// IndexedDB key order), so this brackets exactly one session's samples across all channels.
const sessionRange = (id: string) => IDBKeyRange.bound([id], [id, []]);

// All [sessionId, channelId, *] keys: brackets exactly one channel's samples within a session.
const channelRange = (id: string, channelId: string) =>
  IDBKeyRange.bound([id, channelId], [id, channelId, []]);

export async function createSession(session: Session): Promise<void> {
  const db = await openDb();
  await tx(db, SESSIONS, 'readwrite', t => t.objectStore(SESSIONS).put(session));
}

// Append a batch of readings for one channel under one transaction (frames arrive a few times a
// second per channel; the recorder buffers and flushes in batches rather than one tx per sample).
export async function appendSamples(
  sessionId: string,
  channelId: string,
  startSeq: number,
  readings: Reading[],
): Promise<void> {
  if (readings.length === 0) return;
  const db = await openDb();
  await tx(db, SAMPLES, 'readwrite', t => {
    const store = t.objectStore(SAMPLES);
    readings.forEach((r, i) =>
      store.put({ sessionId, channelId, seq: startSeq + i, r } as SampleRow),
    );
  });
}

// Delete one sample row by its composite key — used by the pin session's "undo last" to drop a
// mis-captured pin (pins always append at the end of a channel, so seq stays contiguous).
export async function deleteSample(
  sessionId: string,
  channelId: string,
  seq: number,
): Promise<void> {
  const db = await openDb();
  await tx(db, SAMPLES, 'readwrite', t =>
    t.objectStore(SAMPLES).delete([sessionId, channelId, seq]),
  );
}

export async function updateSession(session: Session): Promise<void> {
  const db = await openDb();
  await tx(db, SESSIONS, 'readwrite', t => t.objectStore(SESSIONS).put(session));
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await openDb();
  return reqResult(db.transaction(SESSIONS).objectStore(SESSIONS).get(id));
}

export async function listSessions(): Promise<Session[]> {
  const db = await openDb();
  const all = await reqResult<Session[]>(db.transaction(SESSIONS).objectStore(SESSIONS).getAll());
  return all.sort((a, b) => b.startedAt - a.startedAt); // newest first
}

// Full-resolution Readings for one channel of a session, in capture order.
export async function readSamples(id: string, channelId: string): Promise<Reading[]> {
  const db = await openDb();
  const rows = await reqResult<SampleRow[]>(
    db.transaction(SAMPLES).objectStore(SAMPLES).getAll(channelRange(id, channelId)),
  );
  return rows.map(row => row.r);
}

// Every channel's Readings for a session, grouped by channelId (capture order within each). The
// source for CSV export (merge-sorted across channels) and the read-only multi-channel viewer.
export async function readAllSamples(id: string): Promise<Map<string, Reading[]>> {
  const db = await openDb();
  const rows = await reqResult<SampleRow[]>(
    db.transaction(SAMPLES).objectStore(SAMPLES).getAll(sessionRange(id)),
  );
  const out = new Map<string, Reading[]>();
  for (const row of rows) {
    const arr = out.get(row.channelId) ?? [];
    arr.push(row.r);
    out.set(row.channelId, arr);
  }
  return out;
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDb();
  await tx(db, [SESSIONS, SAMPLES], 'readwrite', t => {
    t.objectStore(SESSIONS).delete(id);
    t.objectStore(SAMPLES).delete(sessionRange(id));
  });
}

export async function renameSession(id: string, name: string): Promise<void> {
  const existing = await getSession(id);
  if (!existing) return;
  await updateSession({ ...existing, name });
}
