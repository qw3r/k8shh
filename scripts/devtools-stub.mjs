// Stub for `react-devtools-core`. Ink only imports it when DEV=true, which the
// release bundle never sets, so these no-ops are never actually called. Aliasing
// to this stub keeps the bundle a single self-contained file (no optional dep).
export default {
  initialize() {},
  connectToDevTools() {},
};
