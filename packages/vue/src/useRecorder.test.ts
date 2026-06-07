import { describe, it, expect } from 'vitest';
import { effectScope, ref } from 'vue';
import { useRecorder } from './useRecorder';
import { useMeter } from './useMeter';
import type { Reading } from '@ble-multimeter/protocol';

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
    flags: {
      max: false,
      min: false,
      hold: false,
      rel: false,
      auto: true,
      lowBattery: false,
      hvWarning: false,
      peakMax: false,
      peakMin: false,
    },
    ...over,
  };
}

describe('vue useRecorder', () => {
  it('feeds a reactive reading source and exposes windowed stats', () => {
    const scope = effectScope();
    const r = ref<Reading | null>(reading({ ts: 1, baseValue: 2 }));
    const api = scope.run(() => useRecorder(r))!;

    expect(api.samples.value).toHaveLength(1);
    r.value = reading({ ts: 2, baseValue: 4 });
    r.value = reading({ ts: 3, baseValue: 6 });

    expect(api.samples.value).toHaveLength(3);
    expect(api.stats.value.min).toBe(2);
    expect(api.stats.value.max).toBe(6);
    expect(api.stats.value.avg).toBe(4);
    scope.stop();
  });
});

describe('vue useMeter', () => {
  it('exposes the unsupported state without Web Bluetooth', () => {
    Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true });
    const scope = effectScope();
    const api = scope.run(() => useMeter())!;
    expect(api.state.value).toBe('unsupported');
    scope.stop();
  });
});
