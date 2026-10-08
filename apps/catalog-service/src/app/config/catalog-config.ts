export const CATALOG_ROLES = ['api', 'worker', 'scheduler'] as const;
export type CatalogRole = (typeof CATALOG_ROLES)[number];

const DEFAULT_INGEST_CONCURRENCY = 10;

export function readRoles(
  raw: string | undefined = process.env['CATALOG_ROLES'],
): ReadonlySet<CatalogRole> {
  if (!raw || raw.trim() === '') return new Set(CATALOG_ROLES);
  const roles = raw
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  const unknown = roles.filter(
    (r) => !(CATALOG_ROLES as readonly string[]).includes(r),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Unknown CATALOG_ROLES: ${unknown.join(', ')} (valid: ${CATALOG_ROLES.join(', ')})`,
    );
  }
  return new Set(roles as CatalogRole[]);
}

export function readIngestConcurrency(
  raw: string | undefined = process.env['CATALOG_INGEST_CONCURRENCY'],
): number {
  if (!raw) return DEFAULT_INGEST_CONCURRENCY;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `CATALOG_INGEST_CONCURRENCY must be a positive integer, got "${raw}"`,
    );
  }
  return value;
}
