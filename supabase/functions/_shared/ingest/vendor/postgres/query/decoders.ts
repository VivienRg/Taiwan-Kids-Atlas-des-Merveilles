// Vendored replacement for deno-postgres' query/decoders.ts (not served at
// v0.19.3 on deno.land). Implements the text-format decoders referenced by
// query/decode.ts. Geometric and exotic types are returned as-is; they are
// never used by this worker's queries.
import { parseArray } from './array_parser.ts';

export function decodeBigint(value: string): bigint {
  return BigInt(value);
}

export function decodeBigintArray(value: string): bigint[] {
  return parseArray(value, BigInt) as bigint[];
}

export function decodeBoolean(value: string): boolean {
  return value === 't';
}

export function decodeBooleanArray(value: string): boolean[] {
  return parseArray(value, (v) => v === 't') as boolean[];
}

export function decodeBox(value: string): string {
  return value;
}
export function decodeBoxArray(value: string): string[] {
  return parseArray(value, (v) => v) as string[];
}

export function decodeBytea(value: string): Uint8Array {
  // Text format bytea is emitted as \\xHHHH... since PG 9.
  const hex = value.startsWith('\\x') ? value.slice(2) : value;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function decodeByteaArray(value: string): Uint8Array[] {
  return parseArray(value, decodeBytea) as Uint8Array[];
}

export function decodeCircle(value: string): string {
  return value;
}
export function decodeCircleArray(value: string): string[] {
  return parseArray(value, (v) => v) as string[];
}

export function decodeDate(value: string): Date {
  return new Date(value);
}
export function decodeDateArray(value: string): Date[] {
  return parseArray(value, (v) => new Date(v)) as Date[];
}

export function decodeDatetime(value: string): Date {
  return new Date(value);
}
export function decodeDatetimeArray(value: string): Date[] {
  return parseArray(value, (v) => new Date(v)) as Date[];
}

export function decodeFloat(value: string): number {
  return Number(value);
}
export function decodeFloatArray(value: string): number[] {
  return parseArray(value, Number) as number[];
}

export function decodeInt(value: string): number {
  return Number(value);
}
export function decodeIntArray(value: string): number[] {
  return parseArray(value, Number) as number[];
}

export function decodeJson(value: string): unknown {
  return JSON.parse(value);
}
export function decodeJsonArray(value: string): unknown[] {
  return JSON.parse(value);
}

export function decodeLine(value: string): string {
  return value;
}
export function decodeLineArray(value: string): string[] {
  return parseArray(value, (v) => v) as string[];
}

export function decodeLineSegment(value: string): string {
  return value;
}
export function decodeLineSegmentArray(value: string): string[] {
  return parseArray(value, (v) => v) as string[];
}

export function decodePath(value: string): string {
  return value;
}
export function decodePathArray(value: string): string[] {
  return parseArray(value, (v) => v) as string[];
}

export function decodePoint(value: string): string {
  return value;
}
export function decodePointArray(value: string): string[] {
  return parseArray(value, (v) => v) as string[];
}

export function decodePolygon(value: string): string {
  return value;
}
export function decodePolygonArray(value: string): string[] {
  return parseArray(value, (v) => v) as string[];
}

export function decodeStringArray(value: string): string[] {
  return parseArray(value, (v) => v) as string[];
}

export function decodeTid(value: string): string {
  return value;
}
export function decodeTidArray(value: string): string[] {
  return parseArray(value, (v) => v) as string[];
}
