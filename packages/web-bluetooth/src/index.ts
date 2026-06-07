// @ble-multimeter/web-bluetooth — the browser transport + the framework-agnostic
// MeterSession engine. Depends on @ble-multimeter/protocol; consumed by the React/Vue
// bindings (and any custom UI). Web Bluetooth is Chromium-only and needs a secure context.

export { Transport, type TransportProfile } from './transport';
export { MeterSession, type MeterState, type MeterSnapshot } from './session';
export { isDemoMode, demoReading, demoVolts } from './demo';
