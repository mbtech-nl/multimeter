// SessionsStore — framework-agnostic backing for the Sessions list (PLAN §3.3): browse
// persisted recordings, reopen one read-only, re-export its CSV, rename, or delete. All data
// comes from storage; this just holds the list + the currently-opened session and exposes a
// subscribe/getSnapshot the React/Vue bindings mirror. Extracted from the React useSessions hook.

import { toCsv, type CsvChannel, type Reading, type Session } from '@ble-multimeter/protocol';
import * as storage from './storage';
import { downloadText, slug } from './download';

// One channel's full-resolution readings for the read-only viewer (chart/stats per channel).
export interface OpenedChannel {
  id: string;
  label: string;
  kind: 'meter' | 'derived';
  readings: Reading[];
}

export interface OpenedSession {
  session: Session;
  channels: OpenedChannel[]; // full resolution per channel, for the read-only chart/stats + export
}

export interface SessionsSnapshot {
  list: Session[];
  opened: OpenedSession | null;
}

export class SessionsStore {
  private snap: SessionsSnapshot = { list: [], opened: null };
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = (): SessionsSnapshot => this.snap;

  private set(partial: Partial<SessionsSnapshot>): void {
    this.snap = { ...this.snap, ...partial };
    for (const l of this.listeners) l();
  }

  refresh = (): void => {
    void storage.listSessions().then(list => this.set({ list }));
  };

  open = (id: string): void => {
    void Promise.all([storage.getSession(id), storage.readAllSamples(id)]).then(
      ([session, byChannel]) => {
        if (!session) return;
        // Build one OpenedChannel per recorded channel, in the session's channel order, pulling
        // the full-resolution samples for each from the per-channel store.
        const channels: OpenedChannel[] = (session.channels ?? []).map(ci => ({
          id: ci.id,
          label: ci.label,
          kind: ci.kind,
          readings: byChannel.get(ci.id) ?? [],
        }));
        this.set({ opened: { session, channels } });
      },
    );
  };

  close = (): void => this.set({ opened: null });

  remove = (id: string): void => {
    void storage.deleteSession(id).then(() => {
      if (this.snap.opened?.session.id === id) this.set({ opened: null });
      this.refresh();
    });
  };

  rename = (id: string, name: string): void => {
    void storage.renameSession(id, name).then(() => {
      const o = this.snap.opened;
      if (o?.session.id === id) this.set({ opened: { ...o, session: { ...o.session, name } } });
      this.refresh();
    });
  };

  // Re-export from the durable full-resolution store — not the decimated chart (§3.3).
  exportCsv = (session: Session): void => {
    void exportSessionCsv(session);
  };

  dispose = (): void => {
    this.listeners.clear();
  };
}

// Standalone long-format CSV export for a recording (by id + name) — full-resolution from
// IndexedDB, all channels merge-sorted chronologically (plan-7.md §3.4). Shared by
// SessionsStore.exportCsv and the app's export shortcut (which has no Session object). The channel
// labels come from the Session row; samples come from the per-channel store.
export async function exportSessionCsv(target: { id: string; name: string }): Promise<void> {
  const [session, byChannel] = await Promise.all([
    storage.getSession(target.id),
    storage.readAllSamples(target.id),
  ]);
  const csvChannels: CsvChannel[] = (session?.channels ?? []).map(ci => ({
    channel: ci.label,
    readings: byChannel.get(ci.id) ?? [],
  }));
  // A session row with no channels recorded (edge case) still produces a valid header-only CSV.
  downloadText(toCsv(csvChannels), `${slug(target.name)}.csv`);
}
