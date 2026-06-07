// Vue binding for the SessionsStore engine (Sessions list).

import { computed, shallowRef, onScopeDispose } from 'vue';
import { SessionsStore } from '@mbtech-nl/multimeter-recorder';

export type { OpenedSession } from '@mbtech-nl/multimeter-recorder';

export function useSessions() {
  const store = new SessionsStore();
  const snap = shallowRef(store.getSnapshot());
  const unsub = store.subscribe(() => {
    snap.value = store.getSnapshot();
  });
  store.refresh();

  onScopeDispose(() => {
    unsub();
    store.dispose();
  });

  return {
    list: computed(() => snap.value.list),
    opened: computed(() => snap.value.opened),
    refresh: store.refresh,
    open: store.open,
    close: store.close,
    remove: store.remove,
    rename: store.rename,
    exportCsv: store.exportCsv,
  };
}
