// Minimal assertion helpers with zero dependencies (vendored so `deno test`
// equivalents run fully offline). JSON-serializing comparison is sufficient
// for the plain-JSON shapes the adapters and rules produce.
export function assertEquals(actual: unknown, expected: unknown, msg?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      `assertEquals failed${msg ? `: ${msg}` : ''}\nactual:   ${a}\nexpected: ${e}`,
    );
  }
}

export function assert(value: unknown, msg?: string): void {
  if (!value) {
    throw new Error(`assert failed${msg ? `: ${msg}` : ''}`);
  }
}

export function assertThrows(
  fn: () => unknown,
  errorCtor?: new (...args: unknown[]) => Error,
): void {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    if (errorCtor && !(err instanceof errorCtor)) {
      throw new Error(
        `assertThrows: expected ${errorCtor.name}, got ${(err as Error)?.constructor?.name}`,
      );
    }
  }
  if (!threw) throw new Error('assertThrows: expected function to throw');
}
