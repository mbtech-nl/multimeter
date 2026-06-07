// Vue binding for the MeterSession engine. Mirrors @mbtech-nl/multimeter-react's useMeter over
// the same framework-agnostic engine — a shallowRef snapshot exposed as computed refs.

import { computed, shallowRef, onScopeDispose } from 'vue';
import { MeterSession, type MeterState } from '@mbtech-nl/multimeter-web-bluetooth';
import type { Reading } from '@mbtech-nl/multimeter-protocol';

export type { MeterState };

export function useMeter() {
  const session = new MeterSession();
  const snap = shallowRef(session.getSnapshot());
  const unsub = session.subscribe(() => {
    snap.value = session.getSnapshot();
  });

  // Demo (`?demo`) auto-connects; real connects wait for a user gesture.
  if (session.isDemo) session.connect();

  onScopeDispose(() => {
    unsub();
    session.dispose();
  });

  return {
    state: computed<MeterState>(() => snap.value.state),
    reading: computed<Reading | null>(() => snap.value.reading),
    deviceName: computed(() => snap.value.deviceName),
    error: computed(() => snap.value.error),
    connect: session.connect,
    reconnect: session.reconnect,
    disconnect: session.disconnect,
    toggleBacklight: session.toggleBacklight,
  };
}
