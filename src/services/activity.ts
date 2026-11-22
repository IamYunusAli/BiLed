import * as activity from '../repositories/activity.js';
import type { ActivityRow } from '../repositories/activity.js';
import type { Db } from '../db.js';
import type { Actor, Tenant } from '../domain.js';

export interface LogEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
}

/** Records an entry for the actor's org, as the actor, inside the caller's transaction. */
export function log(db: Db, actor: Actor, { action, entityType, entityId = null, summary }: LogEntry): Promise<void> {
  return activity.record(db, {
    orgId: actor.orgId,
    actorId: actor.userId,
    actorName: actor.actorName,
    action,
    entityType,
    entityId,
    summary,
  });
}

export const list = (tenant: Tenant, { limit = 50 }: { limit?: number } = {}): Promise<ActivityRow[]> =>
  activity.list(tenant.orgId, { limit });

/** Quote user-provided names in summaries consistently. */
export const q = (text: string): string => `“${text}”`;
