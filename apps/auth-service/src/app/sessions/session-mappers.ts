import { SessionSummary } from '@pocast/contracts';

interface SessionSummaryRow {
  familyId: string;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export const SESSION_SUMMARY_SELECT = {
  familyId: true,
  userAgent: true,
  createdAt: true,
  expiresAt: true,
} as const;

export function toSessionSummary(row: SessionSummaryRow): SessionSummary {
  return {
    id: row.familyId,
    userAgent: row.userAgent,
    lastActiveAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}
