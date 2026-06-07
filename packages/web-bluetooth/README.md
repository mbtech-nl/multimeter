# @ble-multimeter/web-bluetooth

> Web Bluetooth transport + the framework-agnostic `MeterSession` engine for BLE multimeters.

[![npm](https://img.shields.io/npm/v/@ble-multimeter/web-bluetooth)](https://www.npmjs.com/package/@ble-multimeter/web-bluetooth)
[![license](https://img.shields.io/npm/l/@ble-multimeter/web-bluetooth)](./LICENSE)

Connects to a Bluetooth multimeter over the browser's
[Web Bluetooth API](https://developer.mozilla.org/docs/Web/API/Web_Bluetooth_API), runs the
device handshake, and decodes the live measurement stream into
[`Reading`](https://www.npmjs.com/package/@ble-multimeter/protocol)s. The `MeterSession`
class wraps the whole connection state machine (connect · handshake · keep-alive · reconnect ·
demo) behind a `subscribe`/`getSnapshot` external store, so UI bindings stay thin.

This is the transport layer; the pure decode/model logic lives in
[`@ble-multimeter/protocol`](https://www.npmjs.com/package/@ble-multimeter/protocol).

## Install

```sh
npm install @ble-multimeter/web-bluetooth
```

> **Browser only.** Web Bluetooth requires a Chromium-based browser (Chrome, Edge, Brave,
> Opera) in a **secure context** (HTTPS or `localhost`), and connecting must be triggered by a
> user gesture (e.g. a button click — the browser shows its device chooser).

## Quick start

```ts
import { MeterSession } from '@ble-multimeter/web-bluetooth';

const session = new MeterSession();

const unsubscribe = session.subscribe(() => {
  const { state, reading, deviceName, error } = session.getSnapshot();
  if (reading) console.log(reading.displayText, reading.displayUnit);
});

// Must be called from a user gesture (the browser shows its device chooser):
document.querySelector('#connect')!.addEventListener('click', () => session.connect());

// Later: session.disconnect(); unsubscribe(); session.dispose();
```

Append `?demo` to the page URL to drive a synthetic measurement stream with no hardware
(works in any browser, including Firefox/Safari) — `MeterSession` detects it automatically.

## API

- `MeterSession` — connection engine. Key members:
  - `subscribe(fn)` / `getSnapshot()` — external store (works with React `useSyncExternalStore`,
    Vue refs, etc.). Snapshot is `{ state, reading, deviceName, error }`.
  - `connect()` / `reconnect()` / `disconnect()` — connection controls.
  - `toggleBacklight()` — driver control command (if supported).
  - `dispose()` — release timers/listeners on teardown.
  - `MeterSession.supported` / `isDemo` — capability flags.
- `MeterState` — `'unsupported' | 'idle' | 'connecting' | 'live' | 'reconnecting' | 'disconnected' | 'error'`.
- `MeterSnapshot` — the snapshot shape above.
- `Transport`, `TransportProfile` — the lower-level GATT transport, if you need it directly.
- `isDemoMode`, `demoReading`, `demoVolts` — demo-mode helpers.

## Compatibility

- Browsers: Chromium-based only (Chrome/Edge/Brave/Opera, desktop + Android). Firefox, Safari,
  and iOS/iPadOS have no Web Bluetooth (demo mode still works there).
- Secure context (HTTPS or `localhost`) and a user gesture are required to connect.
- Devices: UNI-T **UT60BT** (via the protocol package's driver registry).

## Related packages

- [`@ble-multimeter/protocol`](https://www.npmjs.com/package/@ble-multimeter/protocol) — pure decode/model core.
- [`@ble-multimeter/recorder`](https://www.npmjs.com/package/@ble-multimeter/recorder) — recording engine + IndexedDB store.
- [`@ble-multimeter/react`](https://www.npmjs.com/package/@ble-multimeter/react) — React hooks.
- [`@ble-multimeter/vue`](https://www.npmjs.com/package/@ble-multimeter/vue) — Vue composables.

Monorepo: <https://github.com/ble-multimeter/multimeter>

## License

MIT © mannes
