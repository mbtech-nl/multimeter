// @mbtech-nl/multimeter-recorder — browser, Bluetooth-independent recording layer for BLE
// multimeters. The framework-agnostic RecorderSession engine (live buffer + stats +
// segmenting + batched IndexedDB persistence) plus the IndexedDB session store. Depends only
// on @mbtech-nl/multimeter-protocol; consumed by the React/Vue bindings and the app.

export * as storage from './storage';
export {
  RecorderSession,
  type RecState,
  type SegmentInfo,
  type RecorderSnapshot,
} from './session';
