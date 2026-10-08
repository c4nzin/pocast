import { LANGUAGE_TAG_PATTERN } from '@pocast/contracts';

const LANGUAGE_MAX_LENGTH = 35;
const MAX_REASONABLE_DURATION_SECONDS = 7 * 24 * 60 * 60;

export function text(node: unknown): string | null {
  if (node === null || node === undefined) return null;
  if (
    typeof node === 'string' ||
    typeof node === 'number' ||
    typeof node === 'boolean'
  ) {
    const value = String(node).trim();
    return value.length > 0 ? value : null;
  }
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object' && '#text' in node) {
    return text((node as { '#text': unknown })['#text']);
  }
  return null;
}

export function attr(node: unknown, name: string): string | null {
  if (Array.isArray(node)) return attr(node[0], name);
  if (node === null || typeof node !== 'object') return null;
  return text((node as Record<string, unknown>)[`@_${name}`]);
}

export function parseDuration(raw: string | null): number | null {
  if (!raw) return null;
  const parts = raw.split(':').map((p) => Number(p.trim()));
  if (parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) {
    return null;
  }
  const seconds = Math.round(
    parts.reduce((total, part) => total * 60 + part, 0),
  );
  return seconds > 0 && seconds <= MAX_REASONABLE_DURATION_SECONDS
    ? seconds
    : null;
}

export function parseExplicit(raw: string | null): boolean {
  return (
    raw !== null && ['yes', 'true', 'explicit'].includes(raw.toLowerCase())
  );
}

export function normalizeLanguage(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/_/g, '-');
  return value.length <= LANGUAGE_MAX_LENGTH && LANGUAGE_TAG_PATTERN.test(value)
    ? value
    : null;
}

export function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 && value < 2 ** 31 ? value : null;
}

export function parseSizeBytes(raw: string | null): bigint | null {
  if (!raw || !/^\d{1,15}$/.test(raw)) return null;
  const value = BigInt(raw);
  return value > 0n ? value : null;
}

export function httpUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
