import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import * as db from "../db";
import { ENV } from "../_core/env";
import { createHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { adminProcedure, router } from "../_core/trpc";
import { issueAndSendInvite, revokeSubscriptionAccess, runSubscriptionLifecycle } from "../services/subscriptions";
import { setTelegramWebhook } from "../services/telegram";

const subscriptionStatusSchema = z.enum(["active", "expired", "revoked", "canceled"]);

function getSessionToken(cookieHeader: string | undefined): string {
  return parseCookie(cookieHeader ?? "")[COOKIE_NAME] ?? "";
}

function requirePublicBaseUrl(): string {
  if (!ENV.appPublicBaseUrl || !ENV.isProduction) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Publique o projeto e configure a URL pública antes de ativar webhooks ou automações.",
    });
  }
  return ENV.appPublicBaseUrl;
}

export const adminRouter = router({
  overview: adminProcedure.query(() => db.getDashboardMetrics()),
  botSettings: adminProcedure.query(() => db.ensureBotSettings()),
  saveBotSettings: adminProcedure
    .input(
      z.object({
        startTitle: z.string().trim().min(2).max(120),
        startDescription: z.string().trim().min(2).max(2000),
        previewText: z.string().trim().max(2000).nullable().optional(),
        previewImageUrl: z.union([z.url().max(2000), z.literal("")]).nullable().optional(),
        ageNotice: z.string().trim().min(12).max(500),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const settings = await db.saveBotSettings({
        ...input,
        previewImageUrl: input.previewImageUrl || null,
      });
      await db.createAuditLog({
        category: "bot",
        action: "start_presentation_updated",
        status: "success",
        entityType: "bot_settings",
        entityId: settings.id,
        message: `Apresentação do /start atualizada por ${ctx.user.name ?? "administrador"}.`,
      });
      return settings;
    }),
  plans: adminProcedure.query(() => db.listAllPlans()),
  savePlan: adminProcedure
    .input(
      z.object({
        id: z.string().min(1).max(64).optional(),
        name: z.string().trim().min(2).max(120),
        description: z.string().trim().max(1000).nullable().optional(),
        priceCents: z.number().int().positive().max(1_000_000),
        durationDays: z.number().int().positive().max(3650).nullable().optional(),
        isLifetime: z.boolean(),
        isActive: z.boolean(),
        displayOrder: z.number().int().min(0).max(1000),
      })
    )
    .mutation(({ input }) => db.savePlan(input)),
  setPlanActive: adminProcedure
    .input(z.object({ planId: z.string().min(1).max(64), isActive: z.boolean() }))
    .mutation(({ input }) => db.setPlanActive(input.planId, input.isActive)),
  subscriptions: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(250).optional(), status: subscriptionStatusSchema.optional() }).optional())
    .query(({ input }) => db.listSubscriptions(input)),
  payments: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(250).optional() }).optional())
    .query(({ input }) => db.listPayments(input?.limit)),
  auditLogs: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(250).optional() }).optional())
    .query(({ input }) => db.listRecentAuditLogs(input?.limit)),
  resendInvite: adminProcedure
    .input(z.object({ subscriptionId: z.string().min(1).max(64) }))
    .mutation(async ({ input }) => {
      const invite = await issueAndSendInvite(input.subscriptionId);
      return { inviteId: invite?.id ?? null };
    }),
  revokeSubscription: adminProcedure
    .input(z.object({ subscriptionId: z.string().min(1).max(64), reason: z.string().trim().min(3).max(300) }))
    .mutation(async ({ input }) => {
      const result = await revokeSubscriptionAccess(input.subscriptionId, "revoked", input.reason);
      return { success: true, ...result };
    }),
  automation: router({
    status: adminProcedure.query(async () => {
      const job = await db.getAutomationJob("subscription-lifecycle");
      return { job, canActivate: Boolean(ENV.appPublicBaseUrl && ENV.isProduction) };
    }),
    runNow: adminProcedure.mutation(() => runSubscriptionLifecycle()),
    activateLifecycle: adminProcedure.mutation(async ({ ctx }) => {
      requirePublicBaseUrl();
      const sessionToken = getSessionToken(ctx.req.headers.cookie);
      const existing = await db.getAutomationJob("subscription-lifecycle");
      const cron = "0 0 * * * *";
      let taskUid = existing?.scheduleCronTaskUid ?? null;

      if (taskUid) {
        await updateHeartbeatJob(taskUid, {
          cron,
          path: "/api/scheduled/subscription-lifecycle",
          description: "Processa vencimentos e lembretes de assinaturas VIP.",
          enable: true,
        }, sessionToken);
      } else {
        const created = await createHeartbeatJob(
          {
            name: "vip-subscription-lifecycle",
            cron,
            path: "/api/scheduled/subscription-lifecycle",
            description: "Processa vencimentos e lembretes de assinaturas VIP.",
          },
          sessionToken
        );
        taskUid = created.taskUid;
      }
      await db.upsertAutomationJob({
        jobKey: "subscription-lifecycle",
        scheduleCronTaskUid: taskUid,
        cronExpression: cron,
        isEnabled: true,
      });
      return { taskUid };
    }),
    configureTelegramWebhook: adminProcedure.mutation(async () => {
      const baseUrl = requirePublicBaseUrl();
      await setTelegramWebhook(new URL("/api/webhooks/telegram", baseUrl).toString());
      await db.createAuditLog({
        category: "telegram",
        action: "webhook_configured",
        status: "success",
        message: "Webhook do Telegram configurado pelo painel administrativo.",
      });
      return { success: true };
    }),
  }),
});
