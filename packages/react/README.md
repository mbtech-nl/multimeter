# @ble-multimeter/react

> React hooks for BLE multimeters: live readout, recording, and session management with almost no glue.

[![npm](https://img.shields.io/npm/v/@ble-multimeter/react)](https://www.npmjs.com/package/@ble-multimeter/react)
[![license](https://img.shields.io/npm/l/@ble-multimeter/react)](./LICENSE)

Thin React hooks over the framework-agnostic engines in `@ble-multimeter/web-bluetooth` and
`@ble-multimeter/recorder`. Drop them into a React app to get a live meter readout, charting
data, recording, and saved-session management. The [`@ble-multimeter/vue`](https://www.npmjs.com/package/@ble-multimeter/vue)
package mirrors these over the same engines.

## Install

```sh
npm install @ble-multimeter/react
```

Peer dependency: **React ≥ 18** (uses `useSyncExternalStore`). Connecting to real hardware
needs Web Bluetooth — a Chromium-based browser in a secure context (HTTPS or `localhost`).

## Quick start

```tsx
import { useMeter, useRecorder } from '@ble-multimeter/react';

export function Meter() {
  const meter = useMeter();
  const recorder = useRecorder(meter.reading); // pipe live readings into the recorder

  return (
    <div>
      <button onClick={meter.connect}>Connect</button>
      <p>
        {meter.state} — {meter.reading?.displayText} {meter.reading?.displayUnit}
      </p>
      <button
        onClick={() =>
          recorder.recState === 'recording' ? recorder.stop() : recorder.record('session')
        }
      >
        {recorder.recState === 'recording' ? 'Stop' : 'Record'}
      </button>
    </div>
  );
}
```

Append `?demo` to the page URL to auto-connect a synthetic stream (no hardware, any browser).

## API

- `useMeter(): Meter` — connection + live reading. Returns `{ state, reading, deviceName,
  error, connect, reconnect, disconnect, toggleBacklight }` (`MeterState`).
- `useRecorder(reading): Recorder` — recording engine bound to a reading stream. Exposes the
  recorder snapshot (`recState`, `stats`, `samples`, `segment`, `recCount`, `csvTarget`, …)
  plus controls `record(name)` / `pause` / `resume` / `stop` / `resetStats`.
- `useSessions(): Sessions` — browse/reopen/export saved sessions (`OpenedSession`).
- `usePinSession(): PinSession` — pin/capture individual readings hands-free.

All hooks manage their own engine instance per mount and dispose it on unmount. Fully typed.

## Compatibility

- React ≥ 18. Works with React 19.
- Real connections: Chromium-based browser, secure context, user gesture (see
  `@ble-multimeter/web-bluetooth`). Demo mode works everywhere.
- Devices: UNI-T UT60BT (via `@ble-multimeter/protocol`).

## Related packages

- [`@ble-multimeter/protocol`](https://www.npmjs.com/package/@ble-multimeter/protocol) — pure decode/model core.
- [`@ble-multimeter/web-bluetooth`](https://www.npmjs.com/package/@ble-multimeter/web-bluetooth) — transport + `MeterSession`.
- [`@ble-multimeter/recorder`](https://www.npmjs.com/package/@ble-multimeter/recorder) — recording engine + IndexedDB store.
- [`@ble-multimeter/vue`](https://www.npmjs.com/package/@ble-multimeter/vue) — the same four hooks as Vue composables.

Monorepo: <https://github.com/ble-multimeter/multimeter>

## License

MIT © mannes
