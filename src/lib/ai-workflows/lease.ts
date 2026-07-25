/**
 * Lease semantics for real Workflow execution — a lightweight, DB-and-timestamps
 * mechanism so at most one tab can drive a given WorkflowRun's steps at a
 * time, with no additional infrastructure (no WebSockets, no Redis, no
 * queue). The server is always the one granting/checking a lease; the
 * client only ever presents back the leaseId it was given. Pure and
 * DB-free — every check here is a plain function over already-fetched
 * fields, so both the server actions and the tests exercise the exact same
 * logic.
 */

export const WORKFLOW_LEASE = {
  /** How long a lease stays valid without a heartbeat before it's considered abandoned. */
  DURATION_MS: 30_000,
  /** How often the client should renew (heartbeat) while a run is actively executing — comfortably under DURATION_MS so a single missed tick never expires the lease. */
  HEARTBEAT_INTERVAL_MS: 10_000,
} as const;

export interface LeaseFields {
  leaseId: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
}

/** True when a lease exists and hasn't passed its expiry — the only thing that makes a lease "currently held" by anyone. */
export function isLeaseActive(run: LeaseFields, now: Date = new Date()): boolean {
  return Boolean(run.leaseId && run.leaseExpiresAt && run.leaseExpiresAt.getTime() > now.getTime());
}

/** True when `presentedLeaseId` is the run's current, still-valid lease — the check every prepare/complete/fail/heartbeat call must pass before touching state. */
export function isLeaseHeldWith(run: LeaseFields, presentedLeaseId: string, now: Date = new Date()): boolean {
  return isLeaseActive(run, now) && run.leaseId === presentedLeaseId;
}

/** True when another tab (a different leaseOwner) currently holds a still-valid lease — used to show "otra pestaña tiene el control" instead of a generic error. */
export function isLeaseHeldByOther(run: LeaseFields, myLeaseOwner: string, now: Date = new Date()): boolean {
  return isLeaseActive(run, now) && run.leaseOwner !== myLeaseOwner;
}

export function nextLeaseExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + WORKFLOW_LEASE.DURATION_MS);
}
