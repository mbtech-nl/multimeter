// MeterSession — the framework-agnostic connection engine. Orchestrates transport + the
// selected driver's framing/handshake/keep-alive/decode behind a connection state machine,
// and brings the stream back after a drop by re-running the *full* handshake (PLAN §4).
//
// This is the logic that previously lived inside the React useMeter hook; it's now a plain
// class exposing a useSyncExternalStore-friendly snapshot (subscribe/getSnapshot) so React
// AND Vue bindings are thin adapters over it. Demo mode (`?demo`) is handled here too, so it
// works identically for every binding.

import {
  drivers,
  driverById,
  type Driver,
  type DriverFramer,
  type DriverIO,
  type FrameKind,
  type Reading,
} from '@ble-multimeter/protocol';
import { Transport } from './transport';
import { isDemoMode, demoReading } from './demo';

export type MeterState =
  | 'unsupported' // no Web Bluetooth
  | 'idle' // never connected / disconnected by user
  | 'connecting' // chooser + handshake in flight
  | 'live' // streaming measurements
  | 'reconnecting' // re-opening after a drop
  | 'disconnected' // dropped, data kept, offer reconnect
  | 'error';

export interface MeterSnapshot {
  state: MeterState;
  reading: Reading | null;
  deviceName: string | null;
  error: string | null;
}

const errMsg = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
const DEMO_INTERVAL_MS = 250; // the meter's ~4 Hz

export class MeterSession {
  readonly isDemo = isDemoMode();

  private snap: MeterSnapshot;
  private listeners = new Set<() => void>();

  private transport: Transport | null = null;
  private driver: Driver | null = null;
  private framer: DriverFramer | null = null;
  private demoTimer: ReturnType<typeof setInterval> | null = null;

  // One-shot waiters the handshake parks on, resolved when a matching frame arrives — this
  // sequences GET-NAME → (name) → GET-DATA → (stream) off real events instead of blind timers.
  private waiters: { pred: (k: FrameKind) => boolean; resolve: () => void }[] = [];

  // What the driver's handshake/keep-alive talk to. The driver never touches the transport.
  private io: DriverIO = {
    write: (bytes) => this.transport?.write(bytes) ?? Promise.resolve(),
    waitForFrame: (pred, timeoutMs) => this.waitForFrame(pred, timeoutMs),
  };

  constructor() {
    // Demo never touches Bluetooth, so it must run even where Web Bluetooth is absent.
    const state: MeterState = this.isDemo || Transport.supported ? 'idle' : 'unsupported';
    this.snap = { state, reading: null, deviceName: null, error: null };
  }

  static get supported(): boolean {
    return Transport.supported;
  }

  // --- external store ---
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = (): MeterSnapshot => this.snap;

  private set(partial: Partial<MeterSnapshot>): void {
    this.snap = { ...this.snap, ...partial };
    for (const l of this.listeners) l();
  }

  // --- controls (bound so binding deps stay stable) ---
  connect = (): void => {
    if (this.isDemo) {
      this.startDemo();
      return;
    }
    void this.realConnect();
  };
  reconnect = (): void => {
    void this.realReconnect();
  };
  disconnect = (): void => {
    this.stopDemo();
    this.transport?.disconnect();
    this.transport = null;
    this.framer?.reset();
    this.set({ reading: null, deviceName: null, error: null, state: 'idle' });
  };
  toggleBacklight = (): void => {
    const cmd = this.driver?.controls?.backlight;
    if (cmd) void this.transport?.write(cmd);
  };
  /** Release timers/listeners (call from the binding's unmount cleanup). */
  dispose = (): void => {
    this.stopDemo();
    this.waiters = [];
    this.listeners.clear();
  };

  // --- demo ---
  private startDemo(): void {
    if (this.demoTimer) return;
    this.set({ deviceName: 'UT60BT (demo)', state: 'live' });
    const start = Date.now();
    this.demoTimer = setInterval(() => {
      const ts = Date.now();
      this.set({ reading: demoReading((ts - start) / 1000, ts) });
    }, DEMO_INTERVAL_MS);
  }
  private stopDemo(): void {
    if (this.demoTimer) {
      clearInterval(this.demoTimer);
      this.demoTimer = null;
    }
  }

  // --- real BLE ---
  private async realConnect(): Promise<void> {
    if (!Transport.supported) {
      this.set({ state: 'unsupported' });
      return;
    }
    this.set({ error: null, state: 'connecting' });
    const t = new Transport();
    t.onChunk = this.handleChunk;
    t.onDisconnect = this.handleDisconnect;
    this.transport = t;
    try {
      const id = await t.requestAndConnect();
      this.driver = driverById(id) ?? drivers[0];
      this.framer = this.driver.createFramer();
      this.set({ deviceName: t.deviceName ?? this.driver.label });
      await this.handshake();
    } catch (e) {
      // User dismissing the chooser throws NotFoundError — a cancel, not a failure.
      if (e instanceof DOMException && e.name === 'NotFoundError') {
        this.set({ state: 'idle' });
        return;
      }
      this.set({ error: errMsg(e), state: 'error' });
    }
  }

  private async realReconnect(): Promise<void> {
    const t = this.transport;
    if (!t) {
      this.connect();
      return;
    }
    this.set({ error: null, state: 'reconnecting' });
    try {
      await t.reconnect();
      await this.handshake();
    } catch (e) {
      this.set({ error: errMsg(e), state: 'error' });
    }
  }

  private async handshake(): Promise<void> {
    if (!this.driver) throw new Error('no driver selected');
    this.framer?.reset();
    await this.driver.handshake(this.io);
  }

  private handleChunk = (chunk: Uint8Array): void => {
    if (!this.framer || !this.driver) return;
    for (const f of this.framer.push(chunk)) {
      if (f.kind === 'measurement') {
        this.set({ reading: this.driver.decode(f.bytes, Date.now()), state: 'live' });
      } else {
        this.driver.onRequest(f, this.io);
      }
      // Wake any handshake step waiting on this kind of frame.
      for (const w of this.waiters.filter((w) => w.pred(f.kind))) w.resolve();
    }
  };

  private handleDisconnect = (): void => {
    // Keep reading/deviceName so the UI can show the last value + offer reconnect.
    if (this.snap.state !== 'idle') this.set({ state: 'disconnected' });
  };

  private waitForFrame(pred: (k: FrameKind) => boolean, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const entry = { pred, resolve: () => finish(true) };
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        this.waiters = this.waiters.filter((w) => w !== entry);
        resolve(ok);
      };
      this.waiters.push(entry);
      setTimeout(() => finish(false), timeoutMs);
    });
  }
}
