# @ble-multimeter/recorder

> Bluetooth-independent recording engine + IndexedDB session store for BLE multimeters.

[![npm](https://img.shields.io/npm/v/@ble-multimeter/recorder)](https://www.npmjs.com/package/@ble-multimeter/recorder)
[![license](https://img.shields.io/npm/l/@ble-multimeter/recorder)](./LICENSE)

Records a stream of [`Reading`](https://www.npmjs.com/package/@ble-multimeter/protocol)s into
sessions: a live buffer with running stats and quantity-change segmenting, batched persistence
to **IndexedDB**, and browse/reopen/export of saved sessions. It also includes a per-item pin
recorder and small file-download helpers.

It is **decoupled from the transport** — feed it `Reading`s from anywhere (a live
`MeterSession`, a replay, a test). Recorded sessions survive a page reload. Depends only on
[`@ble-multimeter/protocol`](https://www.npmjs.com/package/@ble-multimeter/protocol).

## Install

```sh
npm install @ble-multimeter/recorder
```

> Persistence uses **IndexedDB** (browser). The engines themselves are pure and run anywhere;
> in Node/tests, provide an IndexedDB shim such as [`fake-indexeddb`](https://www.npmjs.com/package/fake-indexeddb).

## Quick start

```ts
import { RecorderSession, SessionsStore, exportSessionCsv } from '@ble-multimeter/recorder';

const rec = new RecorderSession();

const unsubscribe = rec.subscribe(() => {
  const snap = rec.getSnapshot(); // live buffer, stats, segments, recording state
  // render snap…
});

// Pipe in readings continuously (e.g. from a MeterSession snapshot). The live buffer,
// stats and segmenting update even before you record.
rec.push(reading);

rec.record('my session'); // start persisting samples to IndexedDB
// rec.pause(); rec.resume();
rec.stop(); // stop the active recording

// Browse / export saved sessions:
const sessions = new SessionsStore();
// …open a saved session, then:
const csv = exportSessionCsv(opened);
```

(See the bundled `.d.ts` for exact signatures.)

## API

- `RecorderSession` — live recording engine: `push(reading)`, `record(name)` / `pause` /
  `resume` / `stop` / `resetStats`, plus `subscribe` / `getSnapshot` (`RecorderSnapshot` with
  the live `samples`, `recState` (`RecState`), running `stats`, current `segment`
  (`SegmentInfo`), `recCount`, and `csvTarget`). Batches full-resolution samples to IndexedDB
  while recording.
- `SessionsStore` — browse, reopen, and manage saved sessions (`OpenedSession`,
  `SessionsSnapshot`); `exportSessionCsv(...)` renders a saved session to CSV.
- `PinRecorder` — capture/pin individual readings hands-free (`PinSnapshot`).
- `storage` — the IndexedDB session store (exported as a namespace).
- `downloadText`, `downloadBlob`, `slug` — browser file-download helpers.

## Compatibility

- Persistence: IndexedDB (any modern browser). Provide a shim to use in Node.
- The engine logic is framework-agnostic and transport-independent.
- Devices: data model comes from `@ble-multimeter/protocol` (UNI-T UT60BT and future drivers).

## Related packages

- [`@ble-multimeter/protocol`](https://www.npmjs.com/package/@ble-multimeter/protocol) — pure decode/model core.
- [`@ble-multimeter/web-bluetooth`](https://www.npmjs.com/package/@ble-multimeter/web-bluetooth) — Web Bluetooth transport + `MeterSession`.
- [`@ble-multimeter/react`](https://www.npmjs.com/package/@ble-multimeter/react) — React hooks (`useRecorder`, `useSessions`, `usePinSession`).
- [`@ble-multimeter/vue`](https://www.npmjs.com/package/@ble-multimeter/vue) — Vue composables.

Monorepo: <https://github.com/ble-multimeter/multimeter>

## License

MIT © mannes
