# @ble-multimeter/protocol

> Pure, I/O-free core for BLE multimeters: the `Reading` model, UNI-T decode/framing, stats/CSV, and a device-driver registry.

[![npm](https://img.shields.io/npm/v/@ble-multimeter/protocol)](https://www.npmjs.com/package/@ble-multimeter/protocol)
[![license](https://img.shields.io/npm/l/@ble-multimeter/protocol)](./LICENSE)

The foundation package for the `@ble-multimeter/*` stack. It turns raw bytes from a
Bluetooth multimeter into a structured `Reading` and provides the helpers built on top of
that model (framing/checksums, statistics, CSV export, decimation, segmenting).

It is **completely I/O-free**: no DOM, no Web Bluetooth, no React/Vue, no IndexedDB. It runs
in the browser and in Node, and has zero runtime dependencies. The actual transport lives in
[`@ble-multimeter/web-bluetooth`](https://www.npmjs.com/package/@ble-multimeter/web-bluetooth).

## Install

```sh
npm install @ble-multimeter/protocol
```

## Quick start

```ts
import { decode, toCsv, computeStats } from '@ble-multimeter/protocol';

// `bytes` is one 19-byte measurement frame off the wire (Uint8Array).
const reading = decode(bytes, Date.now());

console.log(reading.displayText, reading.displayUnit); // "1.002" "kΩ"
console.log(reading.baseValue, reading.baseUnit); // 1002 "Ω"  (SI-normalized)
console.log(reading.acdc, reading.overload); // "DC" false

// Aggregate a stream of readings.
const stats = computeStats(readings.map((r) => r.baseValue));
console.log(stats.min, stats.max, stats.avg);

// Export to CSV.
const csv = toCsv(readings);
```

## API

- `decode(bytes, ts?) => Reading` — decode one measurement frame into a structured reading
  (function, display text/value/unit, SI-normalized `baseValue`/`baseUnit`, AC/DC, flags).
- `FrameParser` / `checksumOk` / `COMMANDS` — byte-stream framing and frame validation.
- `computeStats(values)` — min/max/avg/peak-to-peak/std-dev/count over a value series.
- `toCsv(readings)` — render readings to CSV text.
- `decimate(...)` / segment helpers — downsampling and quantity-change segmenting for charts.
- `Reading`, `Sample`, `Session`, `UnitInfo`, `unitInfo`, `FUNCTIONS`, `RANGE_UNITS` — the
  data model and unit tables.
- Device-driver registry: `drivers`, `driverById`, `selectDriver`, `allServices`,
  `allNamePrefixes`, and the `Driver` / `DriverFramer` / `DriverIO` interfaces. Decode and
  framing sit behind a `Driver`, so additional BLE multimeters can be added as drivers without
  touching transport, recording, or UI.

Everything is fully typed; see the bundled `.d.ts`.

## Compatibility

- Devices: UNI-T **UT60BT** (the bundled `uni-t` driver). Other meters can be added as drivers.
- Runtime: any modern JS runtime — browser **or** Node (≥18). No DOM/Bluetooth APIs are used.

## Related packages

- [`@ble-multimeter/web-bluetooth`](https://www.npmjs.com/package/@ble-multimeter/web-bluetooth) — Web Bluetooth transport + `MeterSession`.
- [`@ble-multimeter/recorder`](https://www.npmjs.com/package/@ble-multimeter/recorder) — recording engine + IndexedDB store.
- [`@ble-multimeter/react`](https://www.npmjs.com/package/@ble-multimeter/react) — React hooks.
- [`@ble-multimeter/vue`](https://www.npmjs.com/package/@ble-multimeter/vue) — Vue composables.

Monorepo: <https://github.com/ble-multimeter/multimeter>

## License

MIT © mannes
