// Vendored stub for deno-postgres' connection/debug.ts, which deno.land
// doesn't serve at v0.19.3. Only `isDebugOptionEnabled` is used, for opt-in
// debug logging that we don't need.
export interface DebugControls {
  queries?: boolean;
  results?: boolean;
  [key: string]: boolean | undefined;
}

export function isDebugOptionEnabled(_key: string, _enabled?: boolean): boolean {
  return false;
}
