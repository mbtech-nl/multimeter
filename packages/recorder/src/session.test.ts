// RecorderSession against an in-memory IndexedDB (fake-indexeddb). 'auto' wires the global
// indexedDB before storage.ts opens a connection.
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { RecorderSession } from './session';
import { getReadings, getSession } from './storage';
import type { Reading } from '@mbtech-nl/multimeter-protocol';

const noFlags = {
  max: false,
  min: false,
  hold: false,
  rel: false,
  auto: true,
  lowBattery: false,
  hvWarning: false,
  peakMax: false,
  peakMin: false,
};

// Minimal DCV reading factory; override ts/value/function per case.
function reading(over: Partial<Reading> = {}): Reading {
  return {
    ts: 0,
    function: 'DCV',
    displayText: '1.000',
    displayValue: 1,
    displayUnit: 'V',
    baseValue: 1,
    baseUnit: 'V',
    overload: false,
    acdc: 'DC',
    bargraph: 0,
    flags: noFlags,
    ...over,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('RecorderSession buffer + stats', () => {
  it('accumulates the live buffer and computes windowed stats', () => {
    const rec = new RecorderSession();
    rec.push(reading({ ts: 1, baseValue: 2 }));
    rec.push(reading({ ts: 2, baseValue: 4 }));
    rec.push(reading({ ts: 3, baseValue: 6 }));
    const s = rec.getSnapshot();
    expect(s.samples).toHaveLength(3);
    expect(s.stats.min).toBe(2);
    expect(s.stats.max).toBe(6);
    expect(s.stats.avg).toBe(4);
    expect(s.statsDurationMs).toBe(2);
  });

  it('dedups a repeated timestamp', () => {
    const rec = new RecorderSession();
    rec.push(reading({ ts: 5, baseValue: 1 }));
    rec.push(reading({ ts: 5, baseValue: 9 })); // same frame re-fed
    expect(rec.getSnapshot().samples).toHaveLength(1);
  });

  it('starts a new segment and clears the chart on a quantity change', () => {
    const rec = new RecorderSession();
    rec.push(reading({ ts: 1, function: 'DCV', baseValue: 1 }));
    rec.push(reading({ ts: 2, function: 'DCV', baseValue: 2 }));
    rec.push(reading({ ts: 3, function: 'OHM', acdc: '', baseUnit: 'Ω', baseValue: 100 }));
    const s = rec.getSnapshot();
    expect(s.samples).toHaveLength(1); // chart restarted on OHM
    expect(s.segment?.function).toBe('OHM');
    expect(s.segment?.seg).toBe(1);
  });

  it('notifies subscribers on push', () => {
    const rec = new RecorderSession();
    let n = 0;
    rec.subscribe(() => (n += 1));
    rec.push(reading({ ts: 1 }));
    rec.push(reading({ ts: 2 }));
    expect(n).toBe(2);
  });
});

describe('RecorderSession recording', () => {
  it('persists full-resolution readings to IndexedDB and finalizes on stop', async () => {
    const rec = new RecorderSession();
    rec.record('test session');
    const t = rec.getSnapshot().csvTarget;
    expect(t).not.toBeNull();
    expect(rec.getSnapshot().recState).toBe('recording');

    rec.push(reading({ ts: 1, baseValue: 1 }));
    rec.push(reading({ ts: 2, baseValue: 2 }));
    expect(rec.getSnapshot().recCount).toBe(2);

    rec.stop();
    await flush();

    const readings = await getReadings(t!.id);
    expect(readings).toHaveLength(2);
    const session = await getSession(t!.id);
    expect(session?.sampleCount).toBe(2);
    expect(session?.endedAt).not.toBeNull();
    expect(rec.getSnapshot().recState).toBe('idle');
  });

  it('does not persist while paused', async () => {
    const rec = new RecorderSession();
    rec.record('paused test');
    const id = rec.getSnapshot().csvTarget!.id;
    rec.push(reading({ ts: 1 }));
    rec.pause();
    rec.push(reading({ ts: 2 })); // dropped from the recording
    rec.resume();
    rec.push(reading({ ts: 3 }));
    rec.stop();
    await flush();
    const readings = await getReadings(id);
    expect(readings.map((r) => r.ts)).toEqual([1, 3]);
  });
});
