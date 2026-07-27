import * as db from "../db";
import { ENV } from "../_core/env";
import { createPixCharge, getPixCharge, getPixChargeExpiry, isCompletedDepositForPayment } from "./lofypay";
import { createOpaqueToken, hashSecret, serializeSafe } from "./ids";
import { fulfillCompletedPayment } from "./subscriptions";
import { answerCallbackQuery, sendMessage, sendPhoto, type TelegramProfile, type TelegramUpdate } from "./telegram";

const AGE_NOTICE = "Este serviço é destinado exclusivamente a pessoas com 18 anos ou mais.";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
    return map[character] ?? character;
  });
}

function currency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(date: Date | null): string {
  if (!date) return "vitalício";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(date);
}

function ageGateButtons() {
  return [
    [{ text: "Tenho 18 anos ou mais", callback_data: "age_confirm" }],
    [{ text: "Sair", callback_data: "age_decline" }],
  ];
}

function plansButtons(plans: Awaited<ReturnType<typeof db.listActivePlans>>) {
  return [
    ...plans.map(plan => [
      { text: `${plan.name} — ${currency(plan.priceCents)}`, callback_data: `buy:${plan.id}` },
    ]),
    [{ text: "Minha assinatura", callback_data: "subscription_status" }],
  ];
}

async function sendStart(chatId: number, isAgeConfirmed: boolean) {
  const settings = await db.ensureBotSettings();
  const message = [
    `<b>${escapeHtml(settings.startTitle)}</b>`,
    "",
    escapeHtml(settings.startDescription),
    "",
    settings.previewText ? `<b>Prévia:</b> ${escapeHtml(settings.previewText)}` : null,
    "",
    escapeHtml(settings.ageNotice),
  ].filter(Boolean).join("\n");
  const buttons = isAgeConfirmed
    ? [[{ text: "Ver planos e assinar", callback_data: "view_plans" }], [{ text: "Minha assinatura", callback_data: "subscription_status" }]]
    : ageGateButtons();
  if (settings.previewImageUrl) {
    await sendPhoto(chatId, settings.previewImageUrl, message, buttons);
    return;
  }
  await sendMessage(chatId, message, buttons);
}

async function sendPlans(telegramUserId: string) {
  const telegramUser = await db.getTelegramUserByTelegramId(telegramUserId);
  const settings = await db.ensureBotSettings();
  if (!telegramUser?.ageConfirmedAt) {
    await sendMessage(telegramUserId, `${settings.ageNotice}\n\nConfirme sua maioridade para prosseguir.`, ageGateButtons());
    return;
  }
  const plans = await db.listActivePlans();
  if (plans.length === 0) {
    await sendMessage(telegramUserId, "Não há planos disponíveis neste momento. Tente novamente mais tarde.");
    return;
  }
  await sendMessage(
    telegramUserId,
    "<b>Escolha seu plano VIP</b>\n\nO pagamento é processado por PIX. O acesso é liberado automaticamente após a confirmação.",
    plansButtons(plans)
  );
}

async function sendSubscriptionStatus(telegramUserId: string) {
  const telegramUser = await db.getTelegramUserByTelegramId(telegramUserId);
  if (!telegramUser) return;
  const subscription = await db.getActiveSubscriptionForTelegramUser(telegramUser.id);
  if (!subscription) {
    await sendMessage(telegramUserId, "Você não possui uma assinatura ativa no momento.", [[{ text: "Ver planos", callback_data: "view_plans" }]]);
    return;
  }
  await sendMessage(
    telegramUserId,
    `Sua assinatura está <b>ativa</b> até <b>${formatDate(subscription.expiresAt)}</b>.`,
    [[{ text: "Renovar acesso", callback_data: "view_plans" }]]
  );
}

async function createPaymentForPlan(telegramUserId: string, planId: string) {
  console.log("createPaymentForPlan start", { telegramUserId, planId });
  const [telegramUser, plan] = await Promise.all([
    db.getTelegramUserByTelegramId(telegramUserId),
    db.getPlanById(planId),
  ]);
  if (!telegramUser?.ageConfirmedAt) throw new Error("Confirme a maioridade antes de comprar.");
  if (!plan || !plan.isActive) throw new Error("Este plano não está disponível.");
  if (!ENV.appPublicBaseUrl) throw new Error("A URL pública do sistema ainda não foi configurada.");

  const externalReference = `vip-${telegramUser.telegramUserId}-${Date.now()}-${createOpaqueToken().slice(0, 10)}`;
  const callbackToken = createOpaqueToken();
  const payment = await db.createPendingPayment({
    telegramUserId: telegramUser.id,
    planId: plan.id,
    amountCents: plan.priceCents,
    externalReference,
    callbackTokenHash: hashSecret(callbackToken),
  });
  if (!payment) throw new Error("Não foi possível criar o pedido de pagamento.");

  try {
    const callbackUrl = new URL("/api/webhooks/lofypay", ENV.appPublicBaseUrl);
    callbackUrl.searchParams.set("payment_id", payment.id);
    callbackUrl.searchParams.set("token", callbackToken);
    console.log("creating PIX charge", { paymentId: payment.id, amountCents: plan.priceCents, callbackUrl: callbackUrl.toString() });
    const charge = await createPixCharge({
      amountCents: plan.priceCents,
      externalReference,
      callbackUrl: callbackUrl.toString(),
    });
    console.log("pix charge response", { paymentId: payment.id, charge: charge && { id: (charge as any).id, qrCodeText: (charge as any).qrCodeText ? 'present' : 'missing', qrCodeUrl: (charge as any).qrCodeUrl ? 'present' : 'missing' } });
    await db.attachProviderCharge(payment.id, {
      providerTransactionId: charge.id,
      pixCopyPaste: charge.qrCodeText ?? null,
      qrCodeUrl: charge.qrCodeUrl ?? null,
      qrCodeBase64: charge.qrCodeBase64 ?? null,
      pixExpiresAt: getPixChargeExpiry(charge),
      providerPayload: serializeSafe(charge),
    });
    await db.createAuditLog({
      category: "payment",
      action: "pix_charge_created",
      status: "success",
      entityType: "payment",
      entityId: payment.id,
      message: `Cobrança PIX ${charge.id} criada para ${plan.id}.`,
    });
    await sendMessage(
      telegramUser.telegramUserId,
      [
        `<b>PIX gerado — ${escapeHtml(plan.name)}</b>`,
        `Valor: <b>${currency(plan.priceCents)}</b>`,
        "",
        "Copie e cole o código PIX abaixo no aplicativo do seu banco:",
        `<code>${charge.qrCodeText ?? "Código PIX indisponível"}</code>`,
        getPixChargeExpiry(charge) ? `Validade da cobrança: <b>${formatDate(getPixChargeExpiry(charge))}</b>.` : null,
        "",
        "Após o pagamento, a confirmação e o envio do convite são automáticos.",
      ].filter(Boolean).join("\n"),
      [[{ text: "Verificar pagamento", callback_data: `payment_check:${payment.id}` }]]
    );
  } catch (error) {
    console.error("createPixCharge failed", { paymentId: payment.id, error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    // Inform the user that the purchase failed without exposing provider internals
    try {
      await sendMessage(telegramUser.telegramUserId, "Desculpe — não foi possível gerar a cobrança PIX no momento. Tente novamente em alguns instantes.");
    } catch (sendErr) {
      console.error("failed to send user error message", { sendErr });
    }

    await db.setPaymentStatus(payment.id, "failed", {
      providerPayload: serializeSafe({ error: error instanceof Error ? error.message : String(error) }),
    });
    await db.createAuditLog({
      category: "payment",
      action: "pix_charge_creation_failed",
      status: "error",
      entityType: "payment",
      entityId: payment.id,
      message: error instanceof Error ? error.message : "Falha desconhecida ao criar cobrança PIX.",
    });
    throw error;
  }
}

async function checkPayment(telegramUserId: string, paymentId: string) {
  const payment = await db.getPaymentById(paymentId);
  const telegramUser = await db.getTelegramUserByTelegramId(telegramUserId);
  if (!payment || !telegramUser || payment.telegramUserId !== telegramUser.id) {
    throw new Error("Cobrança não encontrada para este usuário.");
  }
  if (payment.status === "completed") {
    await sendMessage(telegramUserId, "Este pagamento já foi confirmado. Verifique a mensagem com seu convite.");
    return;
  }
  if (!payment.providerTransactionId) throw new Error("A transação PIX ainda não foi inicializada.");
  const charge = await getPixCharge(payment.providerTransactionId);
  if (!isCompletedDepositForPayment(charge, payment)) {
    await sendMessage(telegramUserId, "O pagamento ainda não foi confirmado pela instituição. Tente novamente em alguns instantes.");
    return;
  }
  await fulfillCompletedPayment(payment.id, charge, charge.paidAt ? new Date(charge.paidAt) : new Date());
}

async function processMessage(profile: TelegramProfile, chatId: number, text: string) {
  const telegramUser = await db.upsertTelegramUser(profile);
  if (!telegramUser) throw new Error("Não foi possível registrar o usuário do Telegram.");
  const command = text.split(/\s+/)[0]?.toLowerCase();
  if (command === "/start") {
    await sendStart(chatId, Boolean(telegramUser.ageConfirmedAt));
    return;
  }
  if (command === "/planos" || command === "/assinar" || command === "/renovar") {
    await sendPlans(telegramUser.telegramUserId);
    return;
  }
  if (command === "/minha_assinatura") {
    await sendSubscriptionStatus(telegramUser.telegramUserId);
    return;
  }
  await sendMessage(chatId, "Use /start para conhecer o grupo VIP e consultar os planos.");
}

async function processCallback(profile: TelegramProfile, chatId: number, data: string, callbackId: string) {
  console.log("callback received", { from: profile.id, data, callbackId });
  const telegramUser = await db.upsertTelegramUser(profile);
  if (!telegramUser) throw new Error("Não foi possível registrar o usuário do Telegram.");
  await answerCallbackQuery(callbackId);
  console.log("callback acknowledged", { userId: telegramUser.id, telegramUserId: telegramUser.telegramUserId, data });

  if (data === "age_confirm") {
    const confirmed = await db.confirmTelegramAge(telegramUser.telegramUserId);
    if (!confirmed) throw new Error("Não foi possível registrar a confirmação de maioridade.");
    await db.createAccessEvent({
      telegramUserId: confirmed.id,
      eventType: "age_confirmed",
      detail: "Maioridade confirmada explicitamente no bot.",
    });
    await sendMessage(chatId, "Maioridade confirmada. Você pode escolher seu plano VIP.");
    await sendPlans(confirmed.telegramUserId);
    return;
  }
  if (data === "age_decline") {
    await sendMessage(chatId, "Sem a confirmação de maioridade, não é possível prosseguir com a assinatura.");
    return;
  }
  if (data === "view_plans") {
    await sendPlans(telegramUser.telegramUserId);
    return;
  }
  if (data === "subscription_status") {
    await sendSubscriptionStatus(telegramUser.telegramUserId);
    return;
  }
  if (data.startsWith("buy:")) {
    await createPaymentForPlan(telegramUser.telegramUserId, data.slice(4));
    return;
  }
  if (data.startsWith("payment_check:")) {
    await checkPayment(telegramUser.telegramUserId, data.slice("payment_check:".length));
  }
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.message?.from && update.message.text) {
    await processMessage(update.message.from, update.message.chat.id, update.message.text);
    return;
  }
  if (update.callback_query?.from && update.callback_query.data && update.callback_query.message) {
    await processCallback(
      update.callback_query.from,
      update.callback_query.message.chat.id,
      update.callback_query.data,
      update.callback_query.id
    );
  }
}
