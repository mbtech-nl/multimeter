// Vue binding for the PinRecorder engine (per-item pin capture).

import { computed, shallowRef, onScopeDispose } from 'vue';
import { PinRecorder } from '@ble-multimeter/recorder';

export function usePinSession() {
  const pins = new PinRecorder();
  const snap = shallowRef(pins.getSnapshot());
  const unsub = pins.subscribe(() => {
    snap.value = pins.getSnapshot();
  });

  onScopeDispose(() => {
    unsub();
    pins.dispose();
  });

  return {
    active: computed(() => snap.value.active),
    readings: computed(() => snap.value.readings),
    pin: pins.pin,
    undoLast: pins.undoLast,
    stop: pins.stop,
  };
}
