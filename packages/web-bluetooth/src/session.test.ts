import { describe, it, expect, vi, afterEach } from 'vitest';
import { MeterSession } from './session';

const ISSC_NOTIFY = '49535343-1e4d-4bd9-ba61-23c647249616';
const ISSC_WRITE = '49535343-8841-43f4-a8d4-ecbe34729bb3';
const GET_NAME = 0x5f;
const GET_DATA = 0x5d;

// A checksum-valid 19-byte DCV measurement frame (PROTOCOL §3): bytes[17..18] = Σ bytes[0..16].
function measurementFrame(): Uint8Array {
  const f = new Uint8Array(19);
  f[0] = 0xab;
  f[1] = 0xcd;
  f[2] = 0x10; // len → total 19
  f[3] = 0x02; // DCV
  f[4] = 0x30; // range '0'
  '1.000  '.split('').forEach((ch, i) => (f[5 + i] = ch.charCodeAt(0)));
  let sum = 0;
  for (let i = 0; i <= 16; i++) sum += f[i];
  f[17] = (sum >> 8) & 0xff;
  f[18] = sum & 0xff;
  return f;
}

// Any non-19/9/7-byte AB CD frame classifies as 'control' (the meter's name frame).
const controlFrame = () => new Uint8Array([0xab, 0xcd, 0x08, 1, 2, 3, 4, 5, 6, 7, 8]);

class FakeNotify extends EventTarget {
  uuid = ISSC_NOTIFY;
  properties = { notify: true };
  value?: DataView;
  startNotifications = vi.fn().mockResolvedValue(undefined);
  emit(frame: Uint8Array): void {
    this.value = new DataView(frame.buffer.slice(0));
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}

class FakeWrite extends EventTarget {
  uuid = ISSC_WRITE;
  properties = { write: false, writeWithoutResponse: true };
  constructor(private notify: FakeNotify) {
    super();
  }
  // Respond like the meter: GET-NAME → a name (control) frame; GET-DATA → a measurement.
  // Dispatch async (after the handshake registers its waiter), mirroring real notifications.
  writeValueWithoutResponse = vi.fn(async (buf: Uint8Array) => {
    const cmd = buf[3];
    setTimeout(() => {
      if (cmd === GET_NAME) this.notify.emit(controlFrame());
      else if (cmd === GET_DATA) this.notify.emit(measurementFrame());
    }, 0);
  });
}

function installMeter(name = 'UT60BT_AB') {
  const notify = new FakeNotify();
  const write = new FakeWrite(notify);
  const server = {
    connected: true,
    disconnect: vi.fn(function (this: { connected: boolean }) {
      this.connected = false;
    }),
    getPrimaryService: vi.fn().mockResolvedValue({
      getCharacteristics: vi.fn().mockResolvedValue([notify, write]),
    }),
  };
  const device = Object.assign(new EventTarget(), {
    name,
    gatt: { connect: vi.fn().mockResolvedValue(server) },
  });
  Object.defineProperty(navigator, 'bluetooth', {
    value: { requestDevice: vi.fn().mockResolvedValue(device) },
    configurable: true,
  });
  return { notify, write, server, device };
}

afterEach(() => {
  Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true });
});

describe('MeterSession', () => {
  it('starts idle when Web Bluetooth is present', () => {
    installMeter();
    expect(new MeterSession().getSnapshot().state).toBe('idle');
  });

  it('is unsupported without Web Bluetooth', () => {
    Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true });
    expect(new MeterSession().getSnapshot().state).toBe('unsupported');
  });

  it('connects, runs the handshake, and goes live with a decoded reading', async () => {
    installMeter();
    const s = new MeterSession();
    const seen: string[] = [];
    s.subscribe(() => seen.push(s.getSnapshot().state));
    s.connect();
    await vi.waitFor(() => expect(s.getSnapshot().state).toBe('live'));
    const snap = s.getSnapshot();
    expect(snap.reading?.function).toBe('DCV');
    expect(snap.deviceName).toBe('UT60BT_AB');
    expect(seen).toContain('connecting');
  });

  it('returns to idle on disconnect', async () => {
    const { server } = installMeter();
    const s = new MeterSession();
    s.connect();
    await vi.waitFor(() => expect(s.getSnapshot().state).toBe('live'));
    s.disconnect();
    expect(s.getSnapshot().state).toBe('idle');
    expect(s.getSnapshot().reading).toBeNull();
    expect(server.disconnect).toHaveBeenCalled();
  });
});
