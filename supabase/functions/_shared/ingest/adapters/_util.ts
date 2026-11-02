// Shared helpers for adapters.
import { unzipSync } from '../vendor/fflate.mjs';
import { keywordCodes } from '../rules/keywords.ts';

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseZip(body: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(body);
}

export function toI18n(value: string | null | undefined): Record<string, string> {
  if (value == null) return {};
  const v = value.trim();
  return v === '' ? {} : { 'zh-Hant': v };
}

export function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v ?? '').trim())
    .filter((v) => v !== '');
}

export function daymap(serviceDay: string): string {
  const m: Record<string, string> = {
    Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed', Thursday: 'thu',
    Friday: 'fri', Saturday: 'sat', Sunday: 'sun',
    PublicHolidays: 'public_holidays', DayBeforeHolidays: 'day_before_holidays',
    DayAfterHolidays: 'day_after_holidays', TyphoonDay: 'typhoon_day',
  };
  return m[serviceDay] ?? serviceDay;
}

export const SERVICE_STATUS_MAP: Record<number, string> = {
  0: 'permanently_closed', 1: 'open', 2: 'open', 3: 'temporarily_closed', 9: 'unknown',
};

export function serviceStatus(code: number | null | undefined): string {
  return SERVICE_STATUS_MAP[code ?? 9] ?? 'unknown';
}

export function priceLevel(maxPrice: number): 0 | 1 | 2 | 3 | null {
  if (maxPrice === 0) return 0;
  if (maxPrice <= 200) return 1;
  if (maxPrice <= 600) return 2;
  return 3;
}

export function isHttpsUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('https://');
}

export function blobName(member: string): string {
  return member.replace(/\\/g, '/').replace(/^.*\//, '');
}

export { keywordCodes };
