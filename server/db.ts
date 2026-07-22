import { and, count, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  accessEvents,
  auditLogs,
  automationJobs,
  botSettings,
  InsertUser,
  payments,
  subscriptionPlans,
  subscriptions,
  telegramInvites,
  telegramUsers,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { createEntityId } from "./services/ids";

let _db: ReturnType<typeof drizzle> | null = null;

type PaymentStatus = "pending" | "completed" | "canceled" | "expired" | "refunded" | "failed";
type SubscriptionStatus = "active" | "expired" | "revoked" | "canceled";
type InviteStatus = "issued" | "used" | "revoked" | "expired";
type AccessEventType =
  | "age_confirmed"
  | "invite_issued"
  | "invite_sent"
  | "access_revoked"
  | "renewal_reminder"
  | "payment_confirmed";

export type TelegramProfileInput = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("O banco de dados não está disponível.");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await requireDb();
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  for (const field of textFields) {
    const value = user[field];
    if (value !== undefined) {
      values[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function upsertTelegramUser(profile: TelegramProfileInput) {
  const db = await requireDb();
  const telegramUserId = String(profile.id);
  const now = new Date();
  await db
    .insert(telegramUsers)
    .values({
      telegramUserId,
      username: profile.username ?? null,
      firstName: profile.first_name ?? null,
      lastName: profile.last_name ?? null,
      languageCode: profile.language_code ?? null,
      lastInteractionAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        username: profile.username ?? null,
        firstName: profile.first_name ?? null,
        lastName: profile.last_name ?? null,
        languageCode: profile.language_code ?? null,
        lastInteractionAt: now,
      },
    });
  return getTelegramUserByTelegramId(telegramUserId);
}

export async function getTelegramUserByTelegramId(telegramUserId: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(telegramUsers)
    .where(eq(telegramUsers.telegramUserId, telegramUserId))
    .limit(1);
  return rows[0];
}

export async function getTelegramUserById(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(telegramUsers).where(eq(telegramUsers.id, id)).limit(1);
  return rows[0];
}

export async function confirmTelegramAge(telegramUserId: string) {
  const db = await requireDb();
  const now = new Date();
  await db
    .update(telegramUsers)
    .set({ ageConfirmedAt: now, ageConfirmationVersion: "v1", lastInteractionAt: now })
    .where(eq(telegramUsers.telegramUserId, telegramUserId));
  return getTelegramUserByTelegramId(telegramUserId);
}

const defaultPlans = [
  {
    id: "mensal",
    name: "Plano Mensal",
    description: "Acesso por 30 dias ao grupo VIP.",
    priceCents: 2990,
    durationDays: 30,
    isLifetime: false,
    isActive: true,
    displayOrder: 10,
  },
  {
    id: "trimestral",
    name: "Plano Trimestral",
    description: "Acesso por 90 dias ao grupo VIP.",
    priceCents: 7990,
    durationDays: 90,
    isLifetime: false,
    isActive: true,
    displayOrder: 20,
  },
];

const defaultBotSettings = {
  id: "default",
  startTitle: "Área VIP — acesso exclusivo",
  startDescription: "Entre em uma comunidade privada com conteúdo premium e atualizações exclusivas.",
  previewText: "Posts selecionados, bastidores e materiais reservados para assinantes.",
  previewImageUrl: null,
  ageNotice: "Este serviço é destinado exclusivamente a pessoas com 18 anos ou mais.",
};

export async function ensureBotSettings() {
  const db = await requireDb();
  await db
    .insert(botSettings)
    .values(defaultBotSettings)
    .onDuplicateKeyUpdate({ set: { id: sql`${botSettings.id}` } });
  return getBotSettings();
}

export async function getBotSettings() {
  const db = await requireDb();
  const rows = await db.select().from(botSettings).where(eq(botSettings.id, "default")).limit(1);
  if (rows[0]) return rows[0];
  await db.insert(botSettings).values(defaultBotSettings);
  const created = await db.select().from(botSettings).where(eq(botSettings.id, "default")).limit(1);
  return created[0];
}

export async function saveBotSettings(input: {
  startTitle: string;
  startDescription: string;
  previewText?: string | null;
  previewImageUrl?: string | null;
  ageNotice: string;
}) {
  const db = await requireDb();
  const values = {
    id: "default",
    startTitle: input.startTitle,
    startDescription: input.startDescription,
    previewText: input.previewText ?? null,
    previewImageUrl: input.previewImageUrl ?? null,
    ageNotice: input.ageNotice,
  };
  await db.insert(botSettings).values(values).onDuplicateKeyUpdate({
    set: {
      startTitle: values.startTitle,
      startDescription: values.startDescription,
      previewText: values.previewText,
      previewImageUrl: values.previewImageUrl,
      ageNotice: values.ageNotice,
    },
  });
  return getBotSettings();
}

export async function ensureDefaultPlans(): Promise<void> {
  const db = await requireDb();
  for (const plan of defaultPlans) {
    await db
      .insert(subscriptionPlans)
      .values(plan)
      .onDuplicateKeyUpdate({ set: { id: sql`${subscriptionPlans.id}` } });
  }
}

export async function listActivePlans() {
  await ensureDefaultPlans();
  const db = await requireDb();
  return db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.isActive, true))
    .orderBy(subscriptionPlans.displayOrder);
}

export async function listAllPlans() {
  await ensureDefaultPlans();
  const db = await requireDb();
  return db.select().from(subscriptionPlans).orderBy(subscriptionPlans.displayOrder);
}

export async function getPlanById(planId: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId))
    .limit(1);
  return rows[0];
}

export async function savePlan(input: {
  id?: string;
  name: string;
  description?: string | null;
  priceCents: number;
  durationDays?: number | null;
  isLifetime: boolean;
  isActive: boolean;
  displayOrder: number;
}) {
  const db = await requireDb();
  const id = input.id ?? createEntityId("plan");
  const values = {
    id,
    name: input.name,
    description: input.description ?? null,
    priceCents: input.priceCents,
    durationDays: input.isLifetime ? null : input.durationDays ?? 30,
    isLifetime: input.isLifetime,
    isActive: input.isActive,
    displayOrder: input.displayOrder,
  };
  await db.insert(subscriptionPlans).values(values).onDuplicateKeyUpdate({ set: values });
  return getPlanById(id);
}

export async function setPlanActive(planId: string, isActive: boolean) {
  const db = await requireDb();
  await db.update(subscriptionPlans).set({ isActive }).where(eq(subscriptionPlans.id, planId));
  return getPlanById(planId);
}

export async function createPendingPayment(input: {
  telegramUserId: number;
  planId: string;
  amountCents: number;
  externalReference: string;
  callbackTokenHash: string;
}) {
  const db = await requireDb();
  const id = createEntityId("pay");
  await db.insert(payments).values({ id, ...input });
  return getPaymentById(id);
}

export async function getPaymentById(paymentId: string) {
  const db = await requireDb();
  const rows = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  return rows[0];
}

export async function getPaymentByProviderTransaction(providerTransactionId: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.providerTransactionId, providerTransactionId))
    .limit(1);
  return rows[0];
}

export async function getPaymentByExternalReference(externalReference: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.externalReference, externalReference))
    .limit(1);
  return rows[0];
}

export async function attachProviderCharge(
  paymentId: string,
  charge: {
    providerTransactionId: string;
    pixCopyPaste?: string | null;
    qrCodeUrl?: string | null;
    qrCodeBase64?: string | null;
    pixExpiresAt?: Date | null;
    providerPayload: string;
  }
) {
  const db = await requireDb();
  await db
    .update(payments)
    .set(charge)
    .where(and(eq(payments.id, paymentId), eq(payments.status, "pending")));
  return getPaymentById(paymentId);
}

export async function setPaymentStatus(
  paymentId: string,
  status: PaymentStatus,
  patch: { paidAt?: Date | null; completedAt?: Date | null; providerPayload?: string } = {}
) {
  const db = await requireDb();
  await db.update(payments).set({ status, ...patch }).where(eq(payments.id, paymentId));
  return getPaymentById(paymentId);
}

export async function markPaymentCompleted(input: {
  paymentId: string;
  paidAt: Date;
  providerPayload: string;
}) {
  const db = await requireDb();
  const result = await db
    .update(payments)
    .set({
      status: "completed",
      paidAt: input.paidAt,
      completedAt: new Date(),
      providerPayload: input.providerPayload,
    })
    .where(and(eq(payments.id, input.paymentId), eq(payments.status, "pending")));
  const affectedRows = Number(
    (result as unknown as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0
  );
  return { payment: await getPaymentById(input.paymentId), didTransition: affectedRows === 1 };
}

export async function createSubscriptionForPayment(input: {
  telegramUserId: number;
  planId: string;
  paymentId: string;
  startsAt: Date;
  expiresAt: Date | null;
}) {
  const db = await requireDb();
  const id = createEntityId("sub");
  await db
    .insert(subscriptions)
    .values({ id, ...input, status: "active" })
    .onDuplicateKeyUpdate({ set: { paymentId: sql`${subscriptions.paymentId}` } });
  return getSubscriptionByPayment(input.paymentId);
}

export async function getSubscriptionByPayment(paymentId: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.paymentId, paymentId))
    .limit(1);
  return rows[0];
}

export async function getSubscriptionById(subscriptionId: string) {
  const db = await requireDb();
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).limit(1);
  return rows[0];
}

export async function getActiveSubscriptionForTelegramUser(telegramUserId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.telegramUserId, telegramUserId))
    .orderBy(desc(subscriptions.startsAt))
    .limit(5);
  const now = Date.now();
  return rows.find(subscription =>
    subscription.status === "active" && (!subscription.expiresAt || subscription.expiresAt.getTime() > now)
  );
}

export async function hasOtherActiveEntitlement(
  telegramUserId: number,
  excludedSubscriptionId: string,
  now: Date
) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.telegramUserId, telegramUserId), eq(subscriptions.status, "active")));
  return rows.some(
    subscription =>
      subscription.id !== excludedSubscriptionId &&
      (!subscription.expiresAt || subscription.expiresAt.getTime() > now.getTime())
  );
}

export async function markSubscriptionAccessGranted(subscriptionId: string) {
  const db = await requireDb();
  await db
    .update(subscriptions)
    .set({ status: "active", accessGrantedAt: new Date(), accessRevokedAt: null })
    .where(eq(subscriptions.id, subscriptionId));
  return getSubscriptionById(subscriptionId);
}

export async function markSubscriptionRevoked(subscriptionId: string, status: SubscriptionStatus = "revoked") {
  const db = await requireDb();
  await db
    .update(subscriptions)
    .set({ status, accessRevokedAt: new Date() })
    .where(eq(subscriptions.id, subscriptionId));
  return getSubscriptionById(subscriptionId);
}

export async function markRenewalReminderSent(subscriptionId: string) {
  const db = await requireDb();
  await db
    .update(subscriptions)
    .set({ renewalReminderSentAt: new Date() })
    .where(eq(subscriptions.id, subscriptionId));
}

export async function createTelegramInvite(input: {
  subscriptionId: string;
  telegramUserId: number;
  inviteLink: string;
  expiresAt: Date;
}) {
  const db = await requireDb();
  const id = createEntityId("invite");
  await db.insert(telegramInvites).values({ id, ...input, memberLimit: 1 });
  return getInviteById(id);
}

export async function getInviteById(inviteId: string) {
  const db = await requireDb();
  const rows = await db.select().from(telegramInvites).where(eq(telegramInvites.id, inviteId)).limit(1);
  return rows[0];
}

export async function getLatestIssuedInvite(subscriptionId: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(telegramInvites)
    .where(and(eq(telegramInvites.subscriptionId, subscriptionId), eq(telegramInvites.status, "issued")))
    .orderBy(desc(telegramInvites.createdAt))
    .limit(1);
  return rows[0];
}

export async function setInviteStatus(inviteId: string, status: InviteStatus) {
  const db = await requireDb();
  await db.update(telegramInvites).set({ status }).where(eq(telegramInvites.id, inviteId));
}

export async function createAccessEvent(input: {
  telegramUserId: number;
  subscriptionId?: string | null;
  eventType: AccessEventType;
  detail?: string | null;
}) {
  const db = await requireDb();
  await db.insert(accessEvents).values({ id: createEntityId("evt"), ...input });
}

export async function createAuditLog(input: {
  category: string;
  action: string;
  status: "success" | "warning" | "error";
  entityType?: string | null;
  entityId?: string | null;
  message?: string | null;
  metadataJson?: string | null;
}) {
  const db = await requireDb();
  await db.insert(auditLogs).values({ id: createEntityId("audit"), ...input });
}

export async function listSubscriptions(options: { limit?: number; status?: SubscriptionStatus } = {}) {
  const db = await requireDb();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 250);
  const where = options.status ? eq(subscriptions.status, options.status) : undefined;
  return db
    .select({ subscription: subscriptions, telegramUser: telegramUsers, plan: subscriptionPlans, payment: payments })
    .from(subscriptions)
    .innerJoin(telegramUsers, eq(subscriptions.telegramUserId, telegramUsers.id))
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .innerJoin(payments, eq(subscriptions.paymentId, payments.id))
    .where(where)
    .orderBy(desc(subscriptions.createdAt))
    .limit(limit);
}

export async function listPayments(limit = 100) {
  const db = await requireDb();
  return db
    .select({ payment: payments, telegramUser: telegramUsers, plan: subscriptionPlans })
    .from(payments)
    .innerJoin(telegramUsers, eq(payments.telegramUserId, telegramUsers.id))
    .innerJoin(subscriptionPlans, eq(payments.planId, subscriptionPlans.id))
    .orderBy(desc(payments.createdAt))
    .limit(Math.min(Math.max(limit, 1), 250));
}

export async function listRecentAuditLogs(limit = 100) {
  const db = await requireDb();
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(Math.min(limit, 250));
}

export async function findSubscriptionsForRenewalReminder(now: Date, horizon: Date) {
  const db = await requireDb();
  return db
    .select({ subscription: subscriptions, telegramUser: telegramUsers, plan: subscriptionPlans })
    .from(subscriptions)
    .innerJoin(telegramUsers, eq(subscriptions.telegramUserId, telegramUsers.id))
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(
      and(
        eq(subscriptions.status, "active"),
        isNull(subscriptions.renewalReminderSentAt),
        gte(subscriptions.expiresAt, now),
        lte(subscriptions.expiresAt, horizon)
      )
    );
}

export async function findExpiredSubscriptions(now: Date) {
  const db = await requireDb();
  return db
    .select({ subscription: subscriptions, telegramUser: telegramUsers })
    .from(subscriptions)
    .innerJoin(telegramUsers, eq(subscriptions.telegramUserId, telegramUsers.id))
    .where(and(eq(subscriptions.status, "active"), lte(subscriptions.expiresAt, now)));
}

export async function getDashboardMetrics() {
  const db = await requireDb();
  const now = new Date();
  const reminderDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const [active] = await db
    .select({ value: count() })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"));
  const [pending] = await db
    .select({ value: count() })
    .from(payments)
    .where(eq(payments.status, "pending"));
  const [renewals] = await db
    .select({ value: count() })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        gte(subscriptions.expiresAt, now),
        lte(subscriptions.expiresAt, reminderDate)
      )
    );
  const [revenue] = await db
    .select({ value: sql<number>`coalesce(sum(${payments.amountCents}), 0)` })
    .from(payments)
    .where(eq(payments.status, "completed"));
  return {
    activeSubscribers: Number(active?.value ?? 0),
    pendingPayments: Number(pending?.value ?? 0),
    renewalsDue: Number(renewals?.value ?? 0),
    completedRevenueCents: Number(revenue?.value ?? 0),
  };
}

export async function getAutomationJob(jobKey: string) {
  const db = await requireDb();
  const rows = await db.select().from(automationJobs).where(eq(automationJobs.jobKey, jobKey)).limit(1);
  return rows[0];
}

export async function getAutomationJobByTaskUid(taskUid: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(automationJobs)
    .where(eq(automationJobs.scheduleCronTaskUid, taskUid))
    .limit(1);
  return rows[0];
}

export async function upsertAutomationJob(input: {
  jobKey: string;
  scheduleCronTaskUid?: string | null;
  cronExpression: string;
  isEnabled: boolean;
}) {
  const db = await requireDb();
  const existing = await getAutomationJob(input.jobKey);
  const values = {
    id: existing?.id ?? createEntityId("job"),
    ...input,
    scheduleCronTaskUid: input.scheduleCronTaskUid ?? existing?.scheduleCronTaskUid ?? null,
  };
  await db.insert(automationJobs).values(values).onDuplicateKeyUpdate({ set: values });
  return getAutomationJob(input.jobKey);
}

export async function recordAutomationRun(jobKey: string, summary: string) {
  const db = await requireDb();
  await db
    .update(automationJobs)
    .set({ lastRunAt: new Date(), lastRunSummary: summary })
    .where(eq(automationJobs.jobKey, jobKey));
}
