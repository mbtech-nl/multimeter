// RecorderSession (multi-channel) against an in-memory IndexedDB (fake-indexeddb). 'auto' wires
// the global indexedDB before storage.ts opens a connection.
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { RecorderSession, type ChannelSpec } from './session';
import { readSamples, readAllSamples, getSession } from './storage';
import type { Reading } from '@ble-multimeter/protocol';

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

const V: ChannelSpec = { id: 'v', label: 'V source', kind: 'meter', role: 'V source' };
const I: ChannelSpec = { id: 'i', label: 'I source', kind: 'meter', role: 'I source' };

// Look up one channel's view in the snapshot.
const view = (rec: RecorderSession, id: string) =>
  rec.getSnapshot().channels.find(c => c.id === id);

describe('RecorderSession — multi-channel buffer + stats', () => {
  it('buffers per channel and computes per-channel windowed stats', () => {
    const rec = new RecorderSession();
    rec.setChannels([V, I]);
    rec.push('v', reading({ ts: 1, baseValue: 2 }));
    rec.push('v', reading({ ts: 2, baseValue: 4 }));
    rec.push('v', reading({ ts: 3, baseValue: 6 }));
    rec.push('i', reading({ ts: 1, function: 'DCA', baseUnit: 'A', baseValue: 1 }));

    const v = view(rec, 'v')!;
    expect(v.samples).toHaveLength(3);
    expect(v.stats.min).toBe(2);
    expect(v.stats.max).toBe(6);
    expect(v.stats.avg).toBe(4);
    expect(v.statsDurationMs).toBe(2);

    const i = view(rec, 'i')!;
    expect(i.samples).toHaveLength(1);
    expect(i.segment?.function).toBe('DCA');
  });

  it('dedups a repeated timestamp per channel', () => {
    const rec = new RecorderSession();
    rec.setChannels([V, I]);
    rec.push('v', reading({ ts: 5, baseValue: 1 }));
    rec.push('v', reading({ ts: 5, baseValue: 9 })); // same frame re-fed
    rec.push('i', reading({ ts: 5, baseValue: 1 })); // same ts, different channel → kept
    expect(view(rec, 'v')!.samples).toHaveLength(1);
    expect(view(rec, 'i')!.samples).toHaveLength(1);
  });

  it('ignores a push to an unregistered channel', () => {
    const rec = new RecorderSession();
    rec.setChannels([V]);
    rec.push('ghost', reading({ ts: 1 }));
    expect(rec.getSnapshot().channels).toHaveLength(1);
    expect(view(rec, 'v')!.samples).toHaveLength(0);
  });

  it('starts a new segment and clears that channel’s chart on a quantity change', () => {
    const rec = new RecorderSession();
    rec.setChannels([V]);
    rec.push('v', reading({ ts: 1, function: 'DCV', baseValue: 1 }));
    rec.push('v', reading({ ts: 2, function: 'DCV', baseValue: 2 }));
    rec.push('v', reading({ ts: 3, function: 'OHM', acdc: '', baseUnit: 'Ω', baseValue: 100 }));
    const v = view(rec, 'v')!;
    expect(v.samples).toHaveLength(1); // chart restarted on OHM
    expect(v.segment?.function).toBe('OHM');
    expect(v.segment?.seg).toBe(1);
  });

  it('drops a channel from the snapshot when setChannels removes it', () => {
    const rec = new RecorderSession();
    rec.setChannels([V, I]);
    rec.push('v', reading({ ts: 1 }));
    rec.setChannels([V]);
    expect(rec.getSnapshot().channels.map(c => c.id)).toEqual(['v']);
  });

  it('notifies subscribers on push', () => {
    const rec = new RecorderSession();
    rec.setChannels([V]);
    let n = 0;
    rec.subscribe(() => (n += 1));
    rec.push('v', reading({ ts: 1 }));
    rec.push('v', reading({ ts: 2 }));
    expect(n).toBe(2);
  });
});

describe('RecorderSession — multi-channel recording', () => {
  it('persists each channel’s readings + the channel list, and finalizes on stop', async () => {
    const rec = new RecorderSession();
    rec.setChannels([V, I]);
    rec.record('power test');
    const t = rec.getSnapshot().csvTarget!;
    expect(rec.getSnapshot().recState).toBe('recording');

    rec.push('v', reading({ ts: 1, baseValue: 12 }));
    rec.push('v', reading({ ts: 2, baseValue: 13 }));
    rec.push('i', reading({ ts: 1, function: 'DCA', baseUnit: 'A', baseValue: 2 }));
    expect(rec.getSnapshot().recCount).toBe(3); // total across channels

    await rec.stop();

    expect((await readSamples(t.id, 'v')).map(r => r.baseValue)).toEqual([12, 13]);
    expect((await readSamples(t.id, 'i')).map(r => r.baseValue)).toEqual([2]);
    const sess = await getSession(t.id);
    expect(sess?.sampleCount).toBe(3);
    expect(sess?.endedAt).not.toBeNull();
    expect(sess?.channels.map(c => c.id).sort()).toEqual(['i', 'v']);
    expect(sess?.channels.find(c => c.id === 'i')?.function).toBe('DCA');
    expect(rec.getSnapshot().recState).toBe('idle');
  });

  it('does not persist while paused', async () => {
    const rec = new RecorderSession();
    rec.setChannels([V]);
    rec.record('paused test');
    const id = rec.getSnapshot().csvTarget!.id;
    rec.push('v', reading({ ts: 1 }));
    await rec.pause();
    rec.push('v', reading({ ts: 2 })); // dropped from the recording
    rec.resume();
    rec.push('v', reading({ ts: 3 }));
    await rec.stop();
    expect((await readSamples(id, 'v')).map(r => r.ts)).toEqual([1, 3]);
  });

  it('only lists channels that actually captured a sample', async () => {
    const rec = new RecorderSession();
    rec.setChannels([V, I]); // I never gets a sample
    rec.record('one channel');
    const id = rec.getSnapshot().csvTarget!.id;
    rec.push('v', reading({ ts: 1 }));
    await rec.stop();
    const sess = await getSession(id);
    expect(sess?.channels.map(c => c.id)).toEqual(['v']);
    expect((await readAllSamples(id)).has('i')).toBe(false);
  });

  it('keeps a channel removed mid-recording (no orphaned samples) but drops it from the live view', async () => {
    const rec = new RecorderSession();
    rec.setChannels([V, I]);
    rec.record('remove mid-recording');
    const id = rec.getSnapshot().csvTarget!.id;
    rec.push('v', reading({ ts: 1, baseValue: 12 }));
    rec.push('i', reading({ ts: 1, function: 'DCA', baseUnit: 'A', baseValue: 2 }));

    rec.setChannels([V]); // user removes meter I while recording
    // I leaves the chart/cards immediately…
    expect(rec.getSnapshot().channels.map(c => c.id)).toEqual(['v']);

    rec.push('v', reading({ ts: 2, baseValue: 13 }));
    await rec.stop();

    // …but its already-captured samples + channel entry survive in the recording.
    expect((await readSamples(id, 'i')).map(r => r.baseValue)).toEqual([2]);
    const sess = await getSession(id);
    expect(sess?.channels.map(c => c.id).sort()).toEqual(['i', 'v']);
    expect(sess?.channels.find(c => c.id === 'i')?.function).toBe('DCA');
    expect(sess?.sampleCount).toBe(3);
  });
});
