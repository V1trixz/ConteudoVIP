import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getPaymentById: vi.fn(),
  getSubscriptionByPayment: vi.fn(),
  markPaymentCompleted: vi.fn(),
  getPlanById: vi.fn(),
  getTelegramUserById: vi.fn(),
  getActiveSubscriptionForTelegramUser: vi.fn(),
  createSubscriptionForPayment: vi.fn(),
  createAccessEvent: vi.fn(),
  createAuditLog: vi.fn(),
  createTelegramInvite: vi.fn(),
  markSubscriptionAccessGranted: vi.fn(),
  getSubscriptionById: vi.fn(),
  hasOtherActiveEntitlement: vi.fn(),
  getLatestIssuedInvite: vi.fn(),
  setInviteStatus: vi.fn(),
  markSubscriptionRevoked: vi.fn(),
  findSubscriptionsForRenewalReminder: vi.fn(),
  findExpiredSubscriptions: vi.fn(),
  markRenewalReminderSent: vi.fn(),
  recordAutomationRun: vi.fn(),
}));

vi.mock("./lofypay", () => ({ getPixCharge: vi.fn(), isCompletedDepositForPayment: vi.fn() }));
vi.mock("./telegram", () => ({
  createSingleUseInviteLink: vi.fn(),
  revokeInviteLink: vi.fn(),
  revokeMemberAccess: vi.fn(),
  sendMessage: vi.fn(),
  unbanMember: vi.fn(),
}));

import * as db from "../db";
import { createSingleUseInviteLink, revokeInviteLink, revokeMemberAccess, unbanMember } from "./telegram";
import {
  calculateExpiration,
  fulfillCompletedPayment,
  issueAndSendInvite,
  revokeSubscriptionAccess,
} from "./subscriptions";

const dbMock = vi.mocked(db);
const revokeMemberAccessMock = vi.mocked(revokeMemberAccess);
const revokeInviteLinkMock = vi.mocked(revokeInviteLink);
const createSingleUseInviteLinkMock = vi.mocked(createSingleUseInviteLink);
const unbanMemberMock = vi.mocked(unbanMember);

describe("regras do ciclo de assinaturas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calcula a expiração em dias e preserva planos vitalícios", () => {
    const startsAt = new Date("2026-07-21T12:00:00.000Z");
    expect(calculateExpiration(startsAt, 30, false)?.toISOString()).toBe("2026-08-20T12:00:00.000Z");
    expect(calculateExpiration(startsAt, null, true)).toBeNull();
    expect(() => calculateExpiration(startsAt, null, false)).toThrow("duração válida");
  });

  it("não reprocessa uma cobrança que já possui assinatura", async () => {
    const payment = { id: "pay_1", planId: "plan_1", telegramUserId: 1 };
    const subscription = { id: "sub_1", paymentId: "pay_1" };
    dbMock.getPaymentById.mockResolvedValue(payment as never);
    dbMock.getSubscriptionByPayment.mockResolvedValue(subscription as never);

    const result = await fulfillCompletedPayment("pay_1", { id: "pix_1" }, new Date());

    expect(result).toEqual({ subscription, alreadyFulfilled: true });
    expect(dbMock.markPaymentCompleted).not.toHaveBeenCalled();
    expect(dbMock.createSubscriptionForPayment).not.toHaveBeenCalled();
  });

  it("mantém o acesso ao grupo quando outra assinatura ativa cobre o usuário", async () => {
    const subscription = { id: "sub_1", telegramUserId: 42 };
    const telegramUser = { id: 42, telegramUserId: "999" };
    dbMock.getSubscriptionById.mockResolvedValue(subscription as never);
    dbMock.getTelegramUserById.mockResolvedValue(telegramUser as never);
    dbMock.hasOtherActiveEntitlement.mockResolvedValue(true);
    dbMock.getLatestIssuedInvite.mockResolvedValue(undefined);
    dbMock.markSubscriptionRevoked.mockResolvedValue(undefined as never);
    dbMock.createAccessEvent.mockResolvedValue(undefined as never);
    dbMock.createAuditLog.mockResolvedValue(undefined as never);

    const result = await revokeSubscriptionAccess("sub_1", "expired", "Assinatura vencida.");

    expect(result).toEqual({ retainedGroupAccess: true });
    expect(revokeMemberAccessMock).not.toHaveBeenCalled();
    expect(dbMock.markSubscriptionRevoked).toHaveBeenCalledWith("sub_1", "expired");
  });

  it("revoga o convite anterior antes de emitir um novo convite de uso único", async () => {
    const subscription = {
      id: "sub_2",
      telegramUserId: 42,
      status: "active",
      expiresAt: new Date("2026-08-20T12:00:00.000Z"),
    };
    const telegramUser = { id: 42, telegramUserId: "999" };
    dbMock.getSubscriptionById.mockResolvedValue(subscription as never);
    dbMock.getTelegramUserById.mockResolvedValue(telegramUser as never);
    dbMock.getLatestIssuedInvite.mockResolvedValue({ id: "inv_old", inviteLink: "https://t.me/+old" } as never);
    dbMock.setInviteStatus.mockResolvedValue(undefined as never);
    dbMock.createTelegramInvite.mockResolvedValue({ id: "inv_new" } as never);
    dbMock.markSubscriptionAccessGranted.mockResolvedValue(undefined as never);
    dbMock.createAccessEvent.mockResolvedValue(undefined as never);
    revokeInviteLinkMock.mockResolvedValue(undefined);
    unbanMemberMock.mockResolvedValue(undefined);
    createSingleUseInviteLinkMock.mockResolvedValue({
      invite_link: "https://t.me/+new",
      expire_date: 1_785_000_000,
    });

    await issueAndSendInvite("sub_2");

    expect(revokeInviteLinkMock).toHaveBeenCalledWith("https://t.me/+old");
    expect(dbMock.setInviteStatus).toHaveBeenCalledWith("inv_old", "revoked");
    expect(createSingleUseInviteLinkMock).toHaveBeenCalledWith("VIP-sub_2");
    expect(dbMock.createTelegramInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "sub_2",
        telegramUserId: 42,
        inviteLink: "https://t.me/+new",
      })
    );
  });
});
