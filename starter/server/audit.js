// Append-only audit writes.
//
// Invariant 10: Denied attempts are recorded, not just successes.
// Append-only: The database has triggers preventing UPDATE or DELETE on audit_events.
// A single mutation writes exactly one audit row. Denials are recorded by auditDenials,
// while successes are written by the mutation handler itself inside the transaction.

import { newId, nowIso } from './db.js';

export function audit(db, {
  orgId,
  actorId = null,
  action,
  targetType = null,
  targetId = null,
  result,
  reasonCode = null,
  requestId = null,
}) {
  db.prepare(
    `INSERT INTO audit_events
       (id, org_id, actor_id, action, target_type, target_id, result, reason_code, request_id, at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    newId('aud'), orgId, actorId, action, targetType, targetId,
    result, reasonCode, requestId, nowIso()
  );
}

// Run fn(); if it refuses with a permission error, record the denial before rethrowing.
// Denials ONLY: Writing allow here too would double-log successful operations.
export function auditDenials(db, ctx, meta, fn) {
  try {
    return fn();
  } catch (err) {
    if (err?.code === 'FORBIDDEN') {
      audit(db, {
        orgId: ctx.orgId,
        actorId: ctx.userId,
        result: 'deny',
        reasonCode: err.reason ?? 'missing_permission',
        requestId: ctx.requestId,
        ...meta,
      });
    }
    throw err;
  }
}
