import { describe, expect, it } from "vitest";

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const evoPayApiKey = process.env.EVOPAY_API_KEY;

describe("credenciais das integrações", () => {
  it("autentica o bot no endpoint getMe do Telegram", async () => {
    expect(telegramToken, "TELEGRAM_BOT_TOKEN deve estar configurado").toBeTruthy();

    const response = await fetch(
      `https://api.telegram.org/bot${telegramToken}/getMe`,
      { signal: AbortSignal.timeout(10_000) }
    );
    const body = (await response.json()) as { ok?: boolean; result?: { id?: number } };

    expect(response.ok, JSON.stringify(body)).toBe(true);
    expect(body.ok).toBe(true);
    expect(body.result?.id).toBeTypeOf("number");
  });

  it("autentica a chave da EvoPay em uma consulta leve da conta", async () => {
    expect(evoPayApiKey, "EVOPAY_API_KEY deve estar configurada").toBeTruthy();

    const response = await fetch("https://pix.evopay.cash/v1/account", {
      headers: { "API-Key": evoPayApiKey ?? "" },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();

    expect(response.ok, body).toBe(true);
  });
});
