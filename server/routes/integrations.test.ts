import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getPaymentById: vi.fn(),
  createAuditLog: vi.fn(),
  getAutomationJobByTaskUid: vi.fn(),
}));
vi.mock("../services/subscriptions", () => ({
  processEvoPayCompletion: vi.fn(),
  runSubscriptionLifecycle: vi.fn(),
}));
vi.mock("../services/bot", () => ({ handleTelegramUpdate: vi.fn() }));
vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));
vi.mock("../_core/env", () => ({ ENV: { telegramWebhookSecret: "telegram-test-secret" } }));

import * as db from "../db";
import { hashSecret } from "../services/ids";
import { processEvoPayCompletion } from "../services/subscriptions";
import { evopayWebhook } from "./integrations";

type CapturedResponse = Response & { statusCode: number; body: unknown };

function createResponse(): CapturedResponse {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  };
  return response as unknown as CapturedResponse;
}

const payment = {
  id: "pay_123",
  providerTransactionId: "pix_123",
  callbackTokenHash: hashSecret("valid-token"),
};

describe("webhook da EvoPay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejeita callbacks sem o token secreto vinculado ao pagamento", async () => {
    vi.mocked(db.getPaymentById).mockResolvedValue(payment as never);
    const response = createResponse();

    await evopayWebhook(
      { query: { payment_id: payment.id, token: "invalid-token" }, body: { id: payment.providerTransactionId } } as unknown as Request,
      response
    );

    expect(response.statusCode).toBe(403);
    expect(processEvoPayCompletion).not.toHaveBeenCalled();
  });

  it("registra e rejeita uma transação divergente antes de efetivar o pagamento", async () => {
    vi.mocked(db.getPaymentById).mockResolvedValue(payment as never);
    vi.mocked(db.createAuditLog).mockResolvedValue(undefined as never);
    const response = createResponse();

    await evopayWebhook(
      { query: { payment_id: payment.id, token: "valid-token" }, body: { id: "pix_outra" } } as unknown as Request,
      response
    );

    expect(response.statusCode).toBe(409);
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "webhook_transaction_mismatch", entityId: payment.id }));
    expect(processEvoPayCompletion).not.toHaveBeenCalled();
  });

  it("aceita repetições idempotentes quando o processamento já foi concluído", async () => {
    vi.mocked(db.getPaymentById).mockResolvedValue(payment as never);
    vi.mocked(processEvoPayCompletion).mockResolvedValue({ accepted: true, result: { alreadyFulfilled: true } } as never);
    const response = createResponse();

    await evopayWebhook(
      { query: { payment_id: payment.id, token: "valid-token" }, body: { id: payment.providerTransactionId } } as unknown as Request,
      response
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ ok: true, alreadyFulfilled: true });
    expect(processEvoPayCompletion).toHaveBeenCalledWith(payment.providerTransactionId);
  });
});
