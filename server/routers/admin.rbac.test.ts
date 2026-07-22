import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

function createNonAdminContext(): TrpcContext {
  return {
    user: {
      id: 10,
      openId: "ordinary-user",
      email: "ordinary@example.com",
      name: "Usuário comum",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("admin router", () => {
  it("bloqueia consultas administrativas para usuários sem a função admin", async () => {
    const caller = appRouter.createCaller(createNonAdminContext());
    await expect(caller.admin.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
