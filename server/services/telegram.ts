import { ENV } from "../_core/env";

export type TelegramProfile = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: TelegramProfile;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: TelegramProfile;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
};

export type InlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

type TelegramApiResponse<T> = { ok: true; result: T } | { ok: false; description?: string };

function ensureTelegramConfigured(): void {
  if (!ENV.telegramBotToken || !ENV.telegramGroupChatId) {
    throw new Error("As configurações do bot e do grupo VIP não estão completas.");
  }
}

async function telegramRequest<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  ensureTelegramConfigured();
  const response = await fetch(
    `https://api.telegram.org/bot${ENV.telegramBotToken}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
    }
  );
  const body = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !body.ok) {
    const description = "description" in body ? body.description : undefined;
    throw new Error(description || `Telegram respondeu com HTTP ${response.status}.`);
  }
  return body.result;
}

export function inlineKeyboard(rows: InlineButton[][]): { inline_keyboard: InlineButton[][] } {
  return { inline_keyboard: rows };
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  buttons?: InlineButton[][]
): Promise<{ message_id: number }> {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: buttons ? inlineKeyboard(buttons) : undefined,
  });
}

export async function sendPhoto(
  chatId: string | number,
  photoUrl: string,
  caption: string,
  buttons?: InlineButton[][]
): Promise<{ message_id: number }> {
  return telegramRequest("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: "HTML",
    reply_markup: buttons ? inlineKeyboard(buttons) : undefined,
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
  return telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

export async function createSingleUseInviteLink(name: string): Promise<{
  invite_link: string;
  expire_date: number;
  member_limit: number;
}> {
  const expireDate = Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000);
  return telegramRequest("createChatInviteLink", {
    chat_id: ENV.telegramGroupChatId,
    name: name.slice(0, 32),
    expire_date: expireDate,
    member_limit: 1,
  });
}

export async function revokeInviteLink(inviteLink: string): Promise<unknown> {
  return telegramRequest("revokeChatInviteLink", {
    chat_id: ENV.telegramGroupChatId,
    invite_link: inviteLink,
  });
}

export async function unbanMember(telegramUserId: string): Promise<boolean> {
  return telegramRequest("unbanChatMember", {
    chat_id: ENV.telegramGroupChatId,
    user_id: telegramUserId,
    only_if_banned: true,
  });
}

export async function revokeMemberAccess(telegramUserId: string): Promise<boolean> {
  return telegramRequest("banChatMember", {
    chat_id: ENV.telegramGroupChatId,
    user_id: telegramUserId,
    revoke_messages: false,
  });
}

export async function setTelegramWebhook(webhookUrl: string): Promise<boolean> {
  if (!ENV.telegramWebhookSecret) {
    throw new Error("O segredo de webhook do Telegram não está configurado.");
  }
  return telegramRequest("setWebhook", {
    url: webhookUrl,
    secret_token: ENV.telegramWebhookSecret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}
