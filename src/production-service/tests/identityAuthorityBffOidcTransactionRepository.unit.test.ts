import { describe, expect, it } from "vitest";
import { parseCanonicalUtcInstant } from "../src/services/identityAuthority/contract.js";
import {
  createDoorstarOidcTransactionRepository,
  type DoorstarOidcTransactionPrisma,
} from "../src/services/identityAuthority/bff/oidcTransactionRepository.js";
import type { DoorstarOidcLoginTransaction } from "../src/services/identityAuthority/bff/pkceTransaction.js";

const selector = Buffer.alloc(32, 3).toString("base64url");
const profileDigest = Buffer.alloc(32, 4).toString("base64url");

describe("Doorstar M2B OIDC login transaction repository", () => {
  it("exports only its narrow repository factory", async () => {
    const module = await import("../src/services/identityAuthority/bff/oidcTransactionRepository.js");
    expect(Object.keys(module)).toEqual(["createDoorstarOidcTransactionRepository"]);
  });

  it("persists only the transaction state-MAC snapshot and no raw callback secret", async () => {
    const fixture = store();
    const repository = createDoorstarOidcTransactionRepository(fixture.prisma);

    await expect(repository.begin(transaction())).resolves.toBe("started");

    expect(fixture.creates).toHaveLength(1);
    expect(Object.keys(fixture.creates[0]!).sort()).toEqual([
      "clientId",
      "expiresAtEpochSeconds",
      "expiresAtNanoseconds",
      "expiresAtWire",
      "issuedAtEpochSeconds",
      "issuedAtNanoseconds",
      "issuedAtWire",
      "issuer",
      "keyVersion",
      "profileDigest",
      "redirectUri",
      "selector",
      "stateMac",
      "stateMacKeyVersion",
    ]);
    expect(fixture.creates[0]).toMatchObject({
      selector,
      profileDigest,
      issuedAtEpochSeconds: 1_756_123_200n,
      expiresAtEpochSeconds: 1_756_123_500n,
    });
  });

  it("maps only a selector uniqueness collision to not_started and propagates other storage failure", async () => {
    const unique = store({ createFailure: Object.assign(new Error("duplicate"), { code: "P2002" }) });
    await expect(createDoorstarOidcTransactionRepository(unique.prisma).begin(transaction())).resolves.toBe("not_started");

    const unavailable = store({ createFailure: new Error("database unavailable") });
    await expect(createDoorstarOidcTransactionRepository(unavailable.prisma).begin(transaction())).rejects.toThrow("database unavailable");
  });

  it("returns only an unconsumed, descriptor-safe transaction snapshot", async () => {
    const fixture = store();
    const repository = createDoorstarOidcTransactionRepository(fixture.prisma);
    await repository.begin(transaction());

    await expect(repository.findUnconsumedBySelector(selector)).resolves.toEqual(transaction());
    expect(fixture.finds).toEqual([{ selector, consumedAt: null }]);

    fixture.overrideStoredRow(Object.freeze({
      ...fixture.currentRow()!,
      expiresAtNanoseconds: 1,
    }));
    await expect(repository.findUnconsumedBySelector(selector)).resolves.toBeUndefined();
  });

  it("uses one exact, unconsumed and non-expired CAS predicate", async () => {
    const fixture = store();
    const repository = createDoorstarOidcTransactionRepository(fixture.prisma);
    await repository.begin(transaction());
    const claim = {
      selector,
      stateMacKeyVersion: 7,
      stateMac: Buffer.alloc(32, 5),
      profileDigest,
      now: instant("2025-08-25T12:01:00Z"),
    };

    await expect(Promise.all([
      repository.claimMatching(claim),
      repository.claimMatching(claim),
    ])).resolves.toEqual(["claimed", "not_claimed"]);
    expect(fixture.claims).toHaveLength(2);
    expect(fixture.claims[0]).toMatchObject({
      selector,
      stateMacKeyVersion: 7,
      profileDigest,
      consumedAt: null,
      OR: [
        { expiresAtEpochSeconds: { gt: 1_756_123_260n } },
        { expiresAtEpochSeconds: 1_756_123_260n, expiresAtNanoseconds: { gt: 0 } },
      ],
    });
    await expect(repository.findUnconsumedBySelector(selector)).resolves.toBeUndefined();
  });

  it("preserves nanoseconds when enforcing the one-to-six-hundred-second lifetime", async () => {
    const fixture = store();
    const repository = createDoorstarOidcTransactionRepository(fixture.prisma);
    await expect(repository.begin(transaction({
      issuedAt: instant("2025-08-25T12:00:00.900000000Z"),
      expiresAt: instant("2025-08-25T12:10:00.900000000Z"),
    }))).resolves.toBe("started");
    expect(fixture.creates[0]).toMatchObject({
      issuedAtNanoseconds: 900_000_000,
      expiresAtNanoseconds: 900_000_000,
    });

    await expect(repository.begin(transaction({
      selector: Buffer.alloc(32, 6).toString("base64url"),
      issuedAt: instant("2025-08-25T12:00:00.900000000Z"),
      expiresAt: instant("2025-08-25T12:00:01Z"),
    }))).resolves.toBe("not_started");
  });

  it.each([
    ["invalid transaction", { ...transaction(), selector: "invalid" }],
    ["noncanonical selector", { ...transaction(), selector: "A".repeat(42) + "B" }],
    ["noncanonical profile digest", { ...transaction(), profileDigest: "A".repeat(42) + "B" }],
    ["too-short lifetime", { ...transaction(), expiresAt: instant("2025-08-25T12:00:00.500000000Z") }],
    ["overlong lifetime", { ...transaction(), expiresAt: instant("2025-08-25T12:10:01Z") }],
  ])("does not persist %s", async (_name, candidate) => {
    const fixture = store();
    const repository = createDoorstarOidcTransactionRepository(fixture.prisma);
    await expect(repository.begin(candidate)).resolves.toBe("not_started");
    expect(fixture.creates).toEqual([]);
  });

  it("does not claim malformed input or malformed update responses", async () => {
    const fixture = store({ updateResult: Object.freeze({ count: "1" }) });
    const repository = createDoorstarOidcTransactionRepository(fixture.prisma);
    await repository.begin(transaction());

    await expect(repository.claimMatching({
      selector,
      stateMacKeyVersion: 7,
      stateMac: Buffer.alloc(31, 5),
      profileDigest,
      now: instant("2025-08-25T12:01:00Z"),
    })).resolves.toBe("not_claimed");
    expect(fixture.claims).toEqual([]);

    await expect(repository.claimMatching({
      selector,
      stateMacKeyVersion: 7,
      stateMac: Buffer.alloc(32, 5),
      profileDigest,
      now: instant("2025-08-25T12:01:00Z"),
    })).resolves.toBe("not_claimed");
  });
});

function transaction(overrides: Partial<DoorstarOidcLoginTransaction> = {}): DoorstarOidcLoginTransaction {
  return Object.freeze({
    selector,
    keyVersion: 7,
    stateMacKeyVersion: 7,
    stateMac: Buffer.alloc(32, 5),
    issuer: "https://identity.example.test/realms/doorstar",
    clientId: "doorstar-bff",
    redirectUri: "https://doorstar.example.test/auth/callback",
    profileDigest,
    issuedAt: instant("2025-08-25T12:00:00Z"),
    expiresAt: instant("2025-08-25T12:05:00Z"),
    ...overrides,
  });
}

function store(input: {
  readonly createFailure?: Error;
  readonly updateResult?: unknown;
} = {}) {
  type Create = Parameters<DoorstarOidcTransactionPrisma["doorstarOidcLoginTransaction"]["create"]>[0]["data"];
  type Claim = Parameters<DoorstarOidcTransactionPrisma["doorstarOidcLoginTransaction"]["updateMany"]>[0]["where"];
  const rows = new Map<string, Create>();
  const consumed = new Set<string>();
  const creates: Create[] = [];
  const finds: Array<{ readonly selector: string; readonly consumedAt: null }> = [];
  const claims: Claim[] = [];

  const prisma: DoorstarOidcTransactionPrisma = {
    doorstarOidcLoginTransaction: {
      async create({ data }) {
        if (input.createFailure) throw input.createFailure;
        if (rows.has(data.selector)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
        creates.push(data);
        rows.set(data.selector, data);
        return Object.freeze({});
      },
      async findFirst({ where }) {
        finds.push(where);
        if (consumed.has(where.selector)) return null;
        return rows.get(where.selector) ?? null;
      },
      async updateMany({ where }) {
        claims.push(where);
        const row = rows.get(where.selector);
        const matches = row !== undefined
          && !consumed.has(where.selector)
          && row.stateMacKeyVersion === where.stateMacKeyVersion
          && Buffer.from(row.stateMac).equals(Buffer.from(where.stateMac))
          && row.profileDigest === where.profileDigest
          && isAfter(row, where);
        if (matches) consumed.add(where.selector);
        return input.updateResult ?? Object.freeze({ count: matches ? 1 : 0 });
      },
    },
  };

  return {
    prisma,
    creates,
    finds,
    claims,
    currentRow: () => rows.get(selector),
    overrideStoredRow: (row: Create) => rows.set(selector, row),
  };
}

function isAfter(
  row: Parameters<DoorstarOidcTransactionPrisma["doorstarOidcLoginTransaction"]["create"]>[0]["data"],
  where: Parameters<DoorstarOidcTransactionPrisma["doorstarOidcLoginTransaction"]["updateMany"]>[0]["where"],
): boolean {
  return row.expiresAtEpochSeconds > where.OR[0].expiresAtEpochSeconds.gt
    || (row.expiresAtEpochSeconds === where.OR[1].expiresAtEpochSeconds
      && row.expiresAtNanoseconds > where.OR[1].expiresAtNanoseconds.gt);
}

function instant(value: string) {
  return parseCanonicalUtcInstant(value);
}
