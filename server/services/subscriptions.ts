import * as db from "../db";
import { getPixCharge, isCompletedDepositForPayment } from "./lofypay";
import { serializeSafe } from "./ids";
import {
  createSingleUseInviteLink,
  revokeInviteLink,
  revokeMemberAccess,
  sendMessage,
  unbanMember,
} from "./telegram";

const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateExpiration(
  startsAt: Date,
  durationDays: number | null,
  isLifetime: boolean
): Date | null {
  if (isLifetime) return null;
  if (!durationDays || durationDays < 1) throw new Error("O plano precisa ter uma duração válida.");
  return new Date(startsAt.getTime() + durationDays * DAY_MS);
}

function formatDate(date: Date | null): string {
  if (!date) return "vitalício";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function renewalButtons() {
  return [[{ text: "Renovar acesso", callback_data: "view_plans" }]];
}

export async function issueAndSendInvite(subscriptionId: string) {
  const subscription = await db.getSubscriptionById(subscriptionId);
  if (!subscription) throw new Error("Assinatura não encontrada.");
  if (subscription.status !== "active") throw new Error("A assinatura não está ativa.");

  const telegramUser = await db.getTelegramUserById(subscription.telegramUserId);
  if (!telegramUser) throw new Error("Assinante do Telegram não encontrado.");

  const previousInvite = await db.getLatestIssuedInvite(subscription.id);
  if (previousInvite) {
    try {
      await revokeInviteLink(previousInvite.inviteLink);
    } finally {
      await db.setInviteStatus(previousInvite.id, "revoked");
    }
  }

  await unbanMember(telegramUser.telegramUserId);
  const remoteInvite = await createSingleUseInviteLink(`VIP-${subscription.id.slice(-10)}`);
  const inviteExpiry = new Date(remoteInvite.expire_date * 1000);
  const invite = await db.createTelegramInvite({
    subscriptionId: subscription.id,
    telegramUserId: telegramUser.id,
    inviteLink: remoteInvite.invite_link,
    expiresAt: inviteExpiry,
  });
  await db.markSubscriptionAccessGranted(subscription.id);
  await db.createAccessEvent({
    telegramUserId: telegramUser.id,
    subscriptionId: subscription.id,
    eventType: "invite_issued",
    detail: `Convite individual válido até ${inviteExpiry.toISOString()}.`,
  });

  await sendMessage(
    telegramUser.telegramUserId,
    [
      "<b>Pagamento confirmado. Acesso liberado.</b>",
      "",
      `Seu convite individual: ${remoteInvite.invite_link}`,
      `Validade da assinatura: <b>${formatDate(subscription.expiresAt)}</b>.`,
      "",
      "O link aceita somente uma entrada e expira em 24 horas. Não o compartilhe.",
    ].join("\n")
  );
  await db.createAccessEvent({
    telegramUserId: telegramUser.id,
    subscriptionId: subscription.id,
    eventType: "invite_sent",
    detail: `Convite ${invite?.id ?? ""} enviado ao assinante.`,
  });

  return invite;
}

export async function fulfillCompletedPayment(paymentId: string, providerPayload: unknown, paidAt: Date) {
  const payment = await db.getPaymentById(paymentId);
  if (!payment) throw new Error("Pagamento não encontrado.");

  const existingSubscription = await db.getSubscriptionByPayment(payment.id);
  if (existingSubscription) {
    return { subscription: existingSubscription, alreadyFulfilled: true };
  }

  await db.markPaymentCompleted({
    paymentId: payment.id,
    paidAt,
    providerPayload: serializeSafe(providerPayload),
  });
  const existingAfterTransition = await db.getSubscriptionByPayment(payment.id);
  if (existingAfterTransition) {
    return { subscription: existingAfterTransition, alreadyFulfilled: true };
  }

  const [plan, telegramUser] = await Promise.all([
    db.getPlanById(payment.planId),
    db.getTelegramUserById(payment.telegramUserId),
  ]);
  if (!plan || !telegramUser) throw new Error("Não foi possível encontrar os dados necessários para ativar a assinatura.");

  const currentSubscription = await db.getActiveSubscriptionForTelegramUser(telegramUser.id);
  const now = new Date();
  const startsAt =
    currentSubscription?.expiresAt && currentSubscription.expiresAt.getTime() > now.getTime()
      ? currentSubscription.expiresAt
      : now;
  const expiresAt = calculateExpiration(startsAt, plan.durationDays, plan.isLifetime);
  const subscription = await db.createSubscriptionForPayment({
    telegramUserId: telegramUser.id,
    planId: plan.id,
    paymentId: payment.id,
    startsAt,
    expiresAt,
  });
  if (!subscription) throw new Error("A assinatura não pôde ser criada.");

  await db.createAccessEvent({
    telegramUserId: telegramUser.id,
    subscriptionId: subscription.id,
    eventType: "payment_confirmed",
    detail: `Pagamento ${payment.id} confirmado pela LofyPay.`,
  });
  await db.createAuditLog({
    category: "payment",
    action: "payment_fulfilled",
    status: "success",
    entityType: "payment",
    entityId: payment.id,
    message: `Assinatura ${subscription.id} criada para o pagamento confirmado.`,
  });

  try {
    await issueAndSendInvite(subscription.id);
  } catch (error) {
    await db.createAuditLog({
      category: "access",
      action: "invite_delivery_failed",
      status: "error",
      entityType: "subscription",
      entityId: subscription.id,
      message: error instanceof Error ? error.message : "Falha desconhecida ao enviar convite.",
    });
    throw error;
  }

  return { subscription, alreadyFulfilled: false };
}

export async function processLofyPayCompletion(providerTransactionId: string) {
  const payment = await db.getPaymentByProviderTransaction(providerTransactionId);
  if (!payment) return { accepted: false, reason: "Pagamento não associado." } as const;

  const charge = await getPixCharge(providerTransactionId);
  if (!isCompletedDepositForPayment(charge, payment)) {
    return { accepted: false, reason: "A transação não atende às condições de liquidação." } as const;
  }

  const paidAt = charge.paidAt ? new Date(charge.paidAt) : new Date();
  const result = await fulfillCompletedPayment(payment.id, charge, paidAt);
  return { accepted: true, result } as const;
}

export async function revokeSubscriptionAccess(
  subscriptionId: string,
  status: "expired" | "revoked",
  reason: string
) {
  const subscription = await db.getSubscriptionById(subscriptionId);
  if (!subscription) throw new Error("Assinatura não encontrada.");
  const telegramUser = await db.getTelegramUserById(subscription.telegramUserId);
  if (!telegramUser) throw new Error("Assinante do Telegram não encontrado.");

  const shouldRetainGroupAccess = await db.hasOtherActiveEntitlement(
    telegramUser.id,
    subscription.id,
    new Date()
  );
  const invite = await db.getLatestIssuedInvite(subscription.id);
  if (invite) {
    try {
      await revokeInviteLink(invite.inviteLink);
    } finally {
      await db.setInviteStatus(invite.id, "revoked");
    }
  }

  if (!shouldRetainGroupAccess) {
    await revokeMemberAccess(telegramUser.telegramUserId);
  }
  await db.markSubscriptionRevoked(subscription.id, status);
  await db.createAccessEvent({
    telegramUserId: telegramUser.id,
    subscriptionId: subscription.id,
    eventType: "access_revoked",
    detail: shouldRetainGroupAccess
      ? `${reason} Acesso ao grupo mantido por outra assinatura ativa.`
      : reason,
  });
  await db.createAuditLog({
    category: "access",
    action: status === "expired" ? "subscription_expired" : "subscription_revoked",
    status: "success",
    entityType: "subscription",
    entityId: subscription.id,
    message: reason,
  });

  if (status === "expired" && !shouldRetainGroupAccess) {
    await sendMessage(
      telegramUser.telegramUserId,
      "Sua assinatura VIP venceu e o acesso foi encerrado. Você pode renovar a qualquer momento.",
      renewalButtons()
    );
  }
  return { retainedGroupAccess: shouldRetainGroupAccess };
}

export async function runSubscriptionLifecycle(now = new Date()) {
  const reminderHorizon = new Date(now.getTime() + 3 * DAY_MS);
  const [reminders, expired] = await Promise.all([
    db.findSubscriptionsForRenewalReminder(now, reminderHorizon),
    db.findExpiredSubscriptions(now),
  ]);
  let remindersSent = 0;
  let expirationsProcessed = 0;
  let failures = 0;

  for (const item of reminders) {
    try {
      await sendMessage(
        item.telegramUser.telegramUserId,
        `Seu acesso VIP vence em <b>${formatDate(item.subscription.expiresAt)}</b>. Renove agora para evitar interrupção.`,
        renewalButtons()
      );
      await db.markRenewalReminderSent(item.subscription.id);
      await db.createAccessEvent({
        telegramUserId: item.telegramUser.id,
        subscriptionId: item.subscription.id,
        eventType: "renewal_reminder",
        detail: "Lembrete de renovação enviado automaticamente.",
      });
      remindersSent += 1;
    } catch (error) {
      failures += 1;
      await db.createAuditLog({
        category: "automation",
        action: "renewal_reminder_failed",
        status: "error",
        entityType: "subscription",
        entityId: item.subscription.id,
        message: error instanceof Error ? error.message : "Falha desconhecida no lembrete.",
      });
    }
  }

  for (const item of expired) {
    try {
      await revokeSubscriptionAccess(item.subscription.id, "expired", "Assinatura expirada automaticamente.");
      expirationsProcessed += 1;
    } catch (error) {
      failures += 1;
      await db.createAuditLog({
        category: "automation",
        action: "expiration_failed",
        status: "error",
        entityType: "subscription",
        entityId: item.subscription.id,
        message: error instanceof Error ? error.message : "Falha desconhecida na expiração.",
      });
    }
  }

  const summary = `Lembretes: ${remindersSent}; expirações: ${expirationsProcessed}; falhas: ${failures}.`;
  await db.recordAutomationRun("subscription-lifecycle", summary);
  return { remindersSent, expirationsProcessed, failures, summary };
}
