import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const telegramUsers = mysqlTable(
  "telegram_users",
  {
    id: int("id").autoincrement().primaryKey(),
    telegramUserId: varchar("telegramUserId", { length: 32 }).notNull().unique(),
    username: varchar("username", { length: 128 }),
    firstName: varchar("firstName", { length: 256 }),
    lastName: varchar("lastName", { length: 256 }),
    languageCode: varchar("languageCode", { length: 16 }),
    ageConfirmedAt: timestamp("ageConfirmedAt"),
    ageConfirmationVersion: varchar("ageConfirmationVersion", { length: 32 }),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    lastInteractionAt: timestamp("lastInteractionAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("telegram_users_age_confirmed_idx").on(table.ageConfirmedAt)]
);

export const subscriptionPlans = mysqlTable(
  "subscription_plans",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    priceCents: int("priceCents").notNull(),
    durationDays: int("durationDays"),
    isLifetime: boolean("isLifetime").default(false).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    displayOrder: int("displayOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("subscription_plans_active_idx").on(table.isActive, table.displayOrder)]
);

export const botSettings = mysqlTable("bot_settings", {
  id: varchar("id", { length: 64 }).primaryKey(),
  startTitle: varchar("startTitle", { length: 120 }).notNull(),
  startDescription: text("startDescription").notNull(),
  previewText: text("previewText"),
  previewImageUrl: text("previewImageUrl"),
  ageNotice: varchar("ageNotice", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const payments = mysqlTable(
  "payments",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    telegramUserId: int("telegramUserId")
      .notNull()
      .references(() => telegramUsers.id, { onDelete: "cascade" }),
    planId: varchar("planId", { length: 64 })
      .notNull()
      .references(() => subscriptionPlans.id),
    provider: varchar("provider", { length: 32 }).default("lofypay").notNull(),
    providerTransactionId: varchar("providerTransactionId", { length: 128 }).unique(),
    externalReference: varchar("externalReference", { length: 128 }).notNull().unique(),
    callbackTokenHash: varchar("callbackTokenHash", { length: 128 }).notNull(),
    amountCents: int("amountCents").notNull(),
    status: mysqlEnum("paymentStatus", [
      "pending",
      "completed",
      "canceled",
      "expired",
      "refunded",
      "failed",
    ])
      .default("pending")
      .notNull(),
    pixCopyPaste: text("pixCopyPaste"),
    qrCodeUrl: text("qrCodeUrl"),
    qrCodeBase64: text("qrCodeBase64"),
    pixExpiresAt: timestamp("pixExpiresAt"),
    providerPayload: text("providerPayload"),
    paidAt: timestamp("paidAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("payments_user_status_idx").on(table.telegramUserId, table.status),
    index("payments_provider_status_idx").on(table.providerTransactionId, table.status),
  ]
);

export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    telegramUserId: int("telegramUserId")
      .notNull()
      .references(() => telegramUsers.id, { onDelete: "cascade" }),
    planId: varchar("planId", { length: 64 })
      .notNull()
      .references(() => subscriptionPlans.id),
    paymentId: varchar("paymentId", { length: 64 })
      .notNull()
      .references(() => payments.id),
    status: mysqlEnum("subscriptionStatus", ["active", "expired", "revoked", "canceled"])
      .default("active")
      .notNull(),
    startsAt: timestamp("startsAt").notNull(),
    expiresAt: timestamp("expiresAt"),
    renewalReminderSentAt: timestamp("renewalReminderSentAt"),
    accessGrantedAt: timestamp("accessGrantedAt"),
    accessRevokedAt: timestamp("accessRevokedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("subscriptions_payment_unique").on(table.paymentId),
    index("subscriptions_expiry_idx").on(table.status, table.expiresAt),
    index("subscriptions_user_status_idx").on(table.telegramUserId, table.status),
  ]
);

export const telegramInvites = mysqlTable(
  "telegram_invites",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subscriptionId: varchar("subscriptionId", { length: 64 })
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    telegramUserId: int("telegramUserId")
      .notNull()
      .references(() => telegramUsers.id, { onDelete: "cascade" }),
    inviteLink: text("inviteLink").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    memberLimit: int("memberLimit").default(1).notNull(),
    status: mysqlEnum("inviteStatus", ["issued", "used", "revoked", "expired"])
      .default("issued")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("telegram_invites_subscription_status_idx").on(table.subscriptionId, table.status),
  ]
);

export const accessEvents = mysqlTable(
  "access_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    telegramUserId: int("telegramUserId")
      .notNull()
      .references(() => telegramUsers.id, { onDelete: "cascade" }),
    subscriptionId: varchar("subscriptionId", { length: 64 }).references(
      () => subscriptions.id,
      { onDelete: "set null" }
    ),
    eventType: mysqlEnum("accessEventType", [
      "age_confirmed",
      "invite_issued",
      "invite_sent",
      "access_revoked",
      "renewal_reminder",
      "payment_confirmed",
    ]).notNull(),
    detail: text("detail"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("access_events_user_idx").on(table.telegramUserId, table.createdAt)]
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    category: varchar("category", { length: 64 }).notNull(),
    action: varchar("action", { length: 128 }).notNull(),
    status: mysqlEnum("auditStatus", ["success", "warning", "error"]).notNull(),
    entityType: varchar("entityType", { length: 64 }),
    entityId: varchar("entityId", { length: 128 }),
    message: text("message"),
    metadataJson: text("metadataJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("audit_logs_created_idx").on(table.createdAt)]
);

export const automationJobs = mysqlTable("automation_jobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  jobKey: varchar("jobKey", { length: 64 }).notNull().unique(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  cronExpression: varchar("cronExpression", { length: 64 }).notNull(),
  isEnabled: boolean("isEnabled").default(true).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  lastRunSummary: text("lastRunSummary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type TelegramUser = typeof telegramUsers.$inferSelect;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type BotSettings = typeof botSettings.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
