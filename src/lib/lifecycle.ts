import { db } from "./db";
import type { SubscriptionStatus } from "@prisma/client";

/** Days before graceEndsAt at which grace notice emails are sent. */
export const GRACE_NOTICE_DAYS = [7, 3, 1];

/**
 * Legal transitions between subscription statuses.
 */
export const TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  TRIALING: ["ACTIVE", "PAST_DUE", "CANCELED", "DISABLED_AT_PERIOD_END"],
  ACTIVE: ["PAST_DUE", "GRACE_PERIOD", "DISABLED", "CANCELED", "DISABLED_AT_PERIOD_END"],
  PAST_DUE: ["GRACE_PERIOD", "ACTIVE", "DISABLED", "CANCELED"],
  GRACE_PERIOD: ["ACTIVE", "DISABLED", "CANCELED"],
  DISABLED: ["ACTIVE", "ARCHIVED", "CANCELED"],
  CANCELED: ["ACTIVE", "ARCHIVED", "DISABLED"],
  DISABLED_AT_PERIOD_END: ["CANCELED", "ACTIVE", "DISABLED"],
  ARCHIVED: [],
};

function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export type LifecycleOptions = {
  actorId?: string;
  metadata?: Record<string, unknown>;
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Disable a subscription (terminal for billing purposes). */
export async function disable(
  subscriptionId: string,
  reason: string,
  opts: LifecycleOptions = {}
) {
  return db.$transaction(async (tx) => {
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    if (!canTransition(sub.status, "DISABLED")) {
      throw new Error(`Illegal transition: ${sub.status} -> DISABLED`);
    }
    const updated = await tx.subscription.update({
      where: { id: subscriptionId },
      data: { status: "DISABLED", graceEndsAt: null },
    });
    await tx.auditLog.create({
      data: {
        tenantId: sub.tenantId,
        actorId: opts.actorId,
        action: "subscription.disabled",
        entityType: "Subscription",
        entityId: subscriptionId,
        metadata: { reason, ...opts.metadata },
      },
    });
    return updated;
  });
}

/** (Re-)enable a subscription, starting a fresh billing period. */
export async function enable(subscriptionId: string, opts: LifecycleOptions = {}) {
  return db.$transaction(async (tx) => {
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    if (!canTransition(sub.status, "ACTIVE")) {
      throw new Error(`Illegal transition: ${sub.status} -> ACTIVE`);
    }
    const updated = await tx.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: "ACTIVE",
        graceEndsAt: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: addDays(new Date(), 30),
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: sub.tenantId,
        actorId: opts.actorId,
        action: "subscription.enabled",
        entityType: "Subscription",
        entityId: subscriptionId,
        metadata: opts.metadata,
      },
    });
    return updated;
  });
}

/** Mark a subscription as PAST_DUE/** Mark a subscription as PAST_DUE after a failed paymentscriptionId: string, opts: LifecycleOptions = {}) {
  return db.$transaction(async (tx) => {
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    if (!canTransition(sub.status, "PAST_DUE")) {
      throw new Error(`Illegal transition: ${sub.status} -> PAST_DUE`);
    }
    const updated = await tx.subscription.update({
      where: { id: subscriptionId },
      data: { status: "PAST_DUE" },
    });
    await tx.auditLog.create({
      data: {
        tenantId: sub.tenantId,
        actorId: opts.actorId,
        action: "subscription.marked_past_due",
        entityType: "Subscription",
        entityId: subscriptionId,
        metadata: opts.metadata,
      },
    });
    return updated;
  });
}

/** Enter a grace period of `days` days before auto-disable. */
export async function enterGracePeriod(
  subscriptionId: string,
  days: number,
  opts: LifecycleOptions = {}
) {
  return db.$transaction(async (tx) => {
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    if (!canTransition(sub.status, "GRACE_PERIOD")) {
      throw new Error(`Illegal transition: ${sub.status} -> GRACE_PERIOD`);
    }
    const graceEndsAt = addDays(new Date(), days);
    const updated = await tx.subscription.update({
      where: { id: subscriptionId },
      data: { status: "GRACE_PERIOD", graceEndsAt },
    });
    await tx.auditLog.create({
      data: {
        tenantId: sub.tenantId,
        actorId: opts.actorId,
        action: "subscription.grace_period_entered",
        entityType: "Subscription",
        entityId: subscriptionId,
        metadata: { graceEndsAt: graceEndsAt.toISOString(), ...opts.metadata },
      },
    });
    return updated;
  });
}
