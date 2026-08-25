import { describe, expect, it } from "vitest";
import { parseCanonicalUtcInstant } from "../src/services/identityAuthority/contract.js";
import { createDoorstarIdentityAuthorityControlPlaneRepositoryFactory } from "../src/services/identityAuthority/bff/controlPlaneRepository.js";
import type {
  DoorstarIdentityAuthorityControlPlanePrisma,
  DoorstarIdentityAuthorityControlPlaneTransactionPrisma,
} from "../src/services/identityAuthority/bff/controlPlaneRepository.js";
import type {
  DoorstarTrustedIdentityAuthorityIssuanceCommit,
  DoorstarTrustedIdentityAuthorityIssuanceCommitConsumer,
} from "../src/services/identityAuthority/evidence.js";

const tenantId = "11111111-1111-1111-1111-111111111111";
const bindingId = "doorstar-instance-binding";

describe("Doorstar M1B control-plane issuance repository", () => {
  it("loads the singleton binding without hiding a disabled binding from the private evidence assembler", async () => {
    const prisma = createPrisma({
      binding: {
        id: bindingId,
        tenantId,
        status: "DISABLED",
        bindingVersion: 2n,
        disabledAt: new Date("2026-08-25T12:00:00.000Z"),
        disabledReason: "trial_closed",
      },
    });
    const repository = createRepository(prisma, structuralLookAlikeConsumer());

    await expect(repository.loadIdentityAuthorityBinding()).resolves.toEqual({
      id: bindingId,
      tenantId,
      status: "DISABLED",
      bindingVersion: 2n,
      disabledAt: parseCanonicalUtcInstant("2026-08-25T12:00:00.000Z"),
      disabledReason: "trial_closed",
    });
    expect(prisma.bindingCalls).toEqual([{
      select: {
        id: true,
        tenantId: true,
        status: true,
        bindingVersion: true,
        disabledAt: true,
        disabledReason: true,
      },
    }]);
  });

  it("fails closed for a malformed selected binding row rather than treating it as missing", async () => {
    const prisma = createPrisma({
      binding: {
        id: bindingId,
        tenantId,
        status: "ACTIVE",
        bindingVersion: 1n,
        disabledAt: new Date("2026-08-25T12:00:00.000Z"),
        disabledReason: null,
      },
    });
    const repository = createRepository(prisma, structuralLookAlikeConsumer());

    await expect(repository.loadIdentityAuthorityBinding()).rejects.toThrow("doorstar_identity_binding_row_invalid");
  });

  it("rejects a structural commit-consumer look-alike before it can start a transaction", async () => {
    const prisma = createPrisma();
    const repository = createRepository(prisma, structuralLookAlikeConsumer());

    await expect(repository.persistAcceptedEvidenceAndSession(Object.freeze({}) as DoorstarTrustedIdentityAuthorityIssuanceCommit))
      .resolves.toBe("not_persisted");
    expect(prisma.transactionCalls).toBe(0);
    expect(prisma.committedEvidence).toEqual([]);
    expect(prisma.committedSessions).toEqual([]);
  });
});

function createRepository(
  prisma: ReturnType<typeof createPrisma>,
  consumer: DoorstarTrustedIdentityAuthorityIssuanceCommitConsumer,
) {
  return createDoorstarIdentityAuthorityControlPlaneRepositoryFactory(prisma.adapter).create(consumer);
}

/** A runtime-shaped fake must not be accepted by the WeakMap bridge. */
function structuralLookAlikeConsumer(): DoorstarTrustedIdentityAuthorityIssuanceCommitConsumer {
  return Object.freeze({
    async consume() {
      throw new Error("must not run");
    },
  }) as DoorstarTrustedIdentityAuthorityIssuanceCommitConsumer;
}

function createPrisma(options: { readonly binding?: unknown } = {}) {
  const bindingCalls: unknown[] = [];
  const committedEvidence: unknown[] = [];
  const committedSessions: unknown[] = [];
  let transactionCalls = 0;
  const adapter: DoorstarIdentityAuthorityControlPlanePrisma = {
    doorstarInstanceTenantBinding: {
      async findFirst(input): Promise<unknown> {
        bindingCalls.push(input);
        return options.binding ?? null;
      },
    },
    async $transaction<T>(operation: (transaction: DoorstarIdentityAuthorityControlPlaneTransactionPrisma) => Promise<T>): Promise<T> {
      transactionCalls += 1;
      return await operation({
        identityAuthorityEvidence: {
          async create() {
            throw new Error("must not run");
          },
        },
        doorstarSession: {
          async create() {
            throw new Error("must not run");
          },
        },
      });
    },
  };
  return Object.freeze({
    adapter,
    bindingCalls,
    committedEvidence,
    committedSessions,
    get transactionCalls(): number {
      return transactionCalls;
    },
  });
}
