// Vendored replacement for deno-postgres' `deps.ts`, which re-exports deno std.
// This module has zero external dependencies so the vendored postgres client
// works without network access. Only the subsets used by the vendored client
// are implemented.

export function encodeBase64(data: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < data.length; i++) {
    bin += String.fromCharCode(data[i]);
  }
  return btoa(bin);
}

export function decodeBase64(input: string): Uint8Array {
  const bin = atob(input);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export const base64 = { encodeBase64, decodeBase64 };

export function encodeHex(data: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < data.length; i++) {
    hex += data[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function decodeHex(input: string): Uint8Array {
  const bytes = new Uint8Array(input.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(input.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export const hex = { encode: encodeHex, decode: decodeHex };

export function parseDate(input: string | Date): Date {
  return input instanceof Date ? input : new Date(input);
}

export class BufReader implements Deno.Reader {
  constructor(private r: Deno.Reader) {}
  async read(p: Uint8Array): Promise<number | null> {
    return this.r.read(p);
  }
  // Reads exactly p.length bytes, or fails on EOF.
  async readFull(p: Uint8Array): Promise<void> {
    let total = 0;
    while (total < p.length) {
      const n = await this.r.read(p.subarray(total));
      if (n === null) {
        throw new Deno.errors.UnexpectedEof();
      }
      total += n;
    }
  }
}

export class BufWriter implements Deno.Writer {
  constructor(private w: Deno.Writer) {}
  async write(p: Uint8Array): Promise<void> {
    await this.w.write(p);
  }
  async flush(): Promise<void> {
    return;
  }
}

export function copy(
  src: Uint8Array,
  dst: Uint8Array,
  dstStart: number = 0,
): number {
  dst.set(src, dstStart);
  return src.byteLength;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function bold(s: string): string {
  return s;
}
export function rgb24(_r: number, _g: number, _b: number, s: string): string {
  return s;
}
export function yellow(s: string): string {
  return s;
}

export function fromFileUrl(fileUrl: string | URL): string {
  const url = typeof fileUrl === "string" ? new URL(fileUrl) : fileUrl;
  return decodeURIComponent(url.pathname);
}

export function isAbsolute(path: string): boolean {
  return path.startsWith("/");
}

export function joinPath(...paths: string[]): string {
  return paths.join("/").replace(/\/+/g, "/");
}

export const crypto = globalThis.crypto as Crypto;
