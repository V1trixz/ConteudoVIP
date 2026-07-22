import type { Express, Request, Response } from "express";
import * as db from "../db";
import { ENV } from "../_core/env";
import { sdk } from "../_core/sdk";
import { handleTelegramUpdate } from "../services/bot";
import { hashSecret, matchesSecret } from "../services/ids";
import { processEvoPayCompletion, runSubscriptionLifecycle } from "../services/subscriptions";
import type { TelegramUpdate } from "../services/telegram";

type LoosePayload = Record<string, unknown>;

function extractTransactionId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as LoosePayload;
  const candidates = [
    body.id,
    body.transactionId,
    (body.data as LoosePayload | undefined)?.id,
    (body.transaction as LoosePayload | undefined)?.id,
  ];
  const matched = candidates.find(value => typeof value === "string" && value.length > 0);
  return typeof matched === "string" ? matched : null;
}

function sendHandlerError(res: Response, error: unknown, context: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : "Erro inesperado.";
  return res.status(500).json({
    error: message,
    context,
    timestamp: new Date().toISOString(),
  });
}

export async function evopayWebhook(req: Request, res: Response) {
  const paymentId = typeof req.query.payment_id === "string" ? req.query.payment_id : "";
  const callbackToken = typeof req.query.token === "string" ? req.query.token : undefined;
  if (!paymentId || !callbackToken) return res.status(400).json({ error: "callback inválido" });

  try {
    const payment = await db.getPaymentById(paymentId);
    if (!payment || !matchesSecret(payment.callbackTokenHash, callbackToken)) {
      return res.status(403).json({ error: "callback não autorizado" });
    }
    if (!payment.providerTransactionId) {
      return res.status(409).json({ error: "transação ainda não vinculada" });
    }
    const callbackTransactionId = extractTransactionId(req.body);
    if (callbackTransactionId && callbackTransactionId !== payment.providerTransactionId) {
      await db.createAuditLog({
        category: "payment",
        action: "webhook_transaction_mismatch",
        status: "warning",
        entityType: "payment",
        entityId: payment.id,
        message: "O webhook recebido não corresponde à transação registrada.",
      });
      return res.status(409).json({ error: "transação divergente" });
    }

    const result = await processEvoPayCompletion(payment.providerTransactionId);
    if (!result.accepted) return res.status(202).json({ ok: true, pending: result.reason });
    return res.status(200).json({ ok: true, alreadyFulfilled: result.result.alreadyFulfilled });
  } catch (error) {
    await db
      .createAuditLog({
        category: "payment",
        action: "webhook_processing_failed",
        status: "error",
        entityType: "payment",
        entityId: paymentId || null,
        message: error instanceof Error ? error.message : "Falha desconhecida no webhook.",
      })
      .catch(() => undefined);
    return sendHandlerError(res, error, { handler: "evopay" });
  }
}

async function telegramWebhook(req: Request, res: Response) {
  const suppliedSecret = req.header("x-telegram-bot-api-secret-token") ?? undefined;
  if (
    !ENV.telegramWebhookSecret ||
    !matchesSecret(hashSecret(ENV.telegramWebhookSecret), suppliedSecret)
  ) {
    return res.status(403).json({ error: "webhook não autorizado" });
  }

  try {
    await handleTelegramUpdate(req.body as TelegramUpdate);
    return res.status(200).json({ ok: true });
  } catch (error) {
    await db
      .createAuditLog({
        category: "telegram",
        action: "update_processing_failed",
        status: "error",
        message: error instanceof Error ? error.message : "Falha desconhecida no bot.",
      })
      .catch(() => undefined);
    return sendHandlerError(res, error, { handler: "telegram" });
  }
}

async function subscriptionLifecycleHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const job = await db.getAutomationJobByTaskUid(user.taskUid);
    if (!job) return res.status(200).json({ ok: true, skipped: "orphan" });
    if (!job.isEnabled || job.jobKey !== "subscription-lifecycle") {
      return res.status(200).json({ ok: true, skipped: "disabled-or-unrecognized" });
    }
    const result = await runSubscriptionLifecycle();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return sendHandlerError(res, error, {
      handler: "subscription-lifecycle",
      taskUid: "unavailable-before-authentication",
    });
  }
}

export function registerSubscriptionIntegrationRoutes(app: Express) {
  app.post("/api/webhooks/evopay", evopayWebhook);
  app.post("/api/webhooks/telegram", telegramWebhook);
  app.post("/api/scheduled/subscription-lifecycle", subscriptionLifecycleHandler);
}
