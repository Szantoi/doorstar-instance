import { Buffer } from "node:buffer";
import {
  createPilotBff,
  type ActiveOpaqueSession,
  type ActivePilotBinding,
  type AuthorizationTransactionRepository,
  type BootstrapPilotWriter,
  type Clock,
  type ConsumedAuthorizationTransaction,
  type DirectPilotWriter,
  type DirectRosterBindingProvision,
  type DirectRosterBindingUpdate,
  type EffectivePilotRosterManager,
  type NewAuthorizationTransaction,
  type NewOpaqueSession,
  type OidcAuthorizationClient,
  type OidcAuthorizationRequest,
  type OidcCodeExchangeRequest,
  type OpaqueSessionRepository,
  type PilotAuthLogger,
  type PilotBff,
  type PilotBffConfig,
  type PilotBindingRepository,
  type PilotDirectoryAdmin,
  type PilotRosterReader,
  type PilotRosterUser,
  type PilotRosterWriter,
  type PilotCrypto,
  type PilotScopeRepository,
  type ResolvedPilotScope,
} from "../src/index.js";

export const testRuntimeDatabaseUrl =
  "postgresql://runtime:password@127.0.0.1:5432/doorstar_pilot";

export const testConfig: PilotBffConfig = {
  publicOrigin: "https://doorstar.example.invalid",
  fixedScopeKey: "doorstar-pilot",
  runtimeDatabase: {
    host: "127.0.0.1",
    port: 5432,
    database: "doorstar_pilot",
    user: "runtime",
    password: "password",
  },
  crypto: {
    encryptionKey: Buffer.alloc(32, 1),
    subjectDigestKey: Buffer.alloc(32, 2),
  },
  oidc: {
    issuer: "https://identity.example.invalid/realms/doorstar",
    authorizationEndpoint: "https://identity.example.invalid/realms/doorstar/protocol/openid-connect/auth",
    tokenEndpoint: "https://identity.example.invalid/realms/doorstar/protocol/openid-connect/token",
    jwksUrl: "https://identity.example.invalid/realms/doorstar/protocol/openid-connect/certs",
    clientId: "doorstar-pilot-bff",
    clientSecret: "test-only-client-secret",
    redirectUri: "https://doorstar.example.invalid/auth/callback",
    requestedScopes: ["openid", "profile", "email"],
    idTokenAlgorithms: ["RS256"],
  },
  keycloakAdmin: {
    realmAdminBaseUrl: "https://identity.example.invalid/admin/realms/doorstar",
    clientId: "doorstar-pilot-roster-admin",
    clientSecret: "test-only-keycloak-admin-secret",
  },
  transactionTtlSeconds: 300,
  sessionTtlSeconds: 28_800,
  browserBindingTtlSeconds: 86_400,
  postLoginRedirectPath: "/",
};

export class FixedClock implements Clock {
  public constructor(private value = new Date("2026-08-27T10:00:00.000Z")) {}

  public now(): Date {
    return new Date(this.value.getTime());
  }

  public advance(seconds: number): void {
    this.value = new Date(this.value.getTime() + seconds * 1_000);
  }
}

export class FakeCrypto implements PilotCrypto {
  private counter = 0;
  private encryptedCounter = 0;
  private readonly ciphertextValues = new Map<string, string>();

  public createOpaqueSecret(purpose: "transaction" | "state" | "nonce" | "pkce_verifier" | "browser_binding" | "session" | "actor_key"): string {
    this.counter += 1;
    return `${purpose}_${String(this.counter).padStart(4, "0")}_${"x".repeat(48)}`;
  }

  public createCorrelationId(): string {
    return "00000000-0000-4000-8000-000000000099";
  }

  public hash(value: string): string {
    return stableDigest(value);
  }

  public encrypt(value: string): Uint8Array {
    this.encryptedCounter += 1;
    const ciphertext = `cipher_${String(this.encryptedCounter).padStart(4, "0")}`;
    this.ciphertextValues.set(ciphertext, value);
    return Buffer.from(ciphertext, "utf8");
  }

  public decrypt(ciphertext: Uint8Array): string {
    const value = this.ciphertextValues.get(Buffer.from(ciphertext).toString("utf8"));
    if (!value) {
      throw new Error("unknown_ciphertext");
    }
    return value;
  }

  public derivePkceS256(verifier: string): string {
    return `challenge_${verifier}`;
  }

  public digestOidcSubject(issuer: string, subject: string): string {
    return stableDigest(`${issuer}|${subject}`);
  }
}

export class FakeTransactions implements AuthorizationTransactionRepository {
  public readonly records: NewAuthorizationTransaction[] = [];
  private readonly consumedStateHashes = new Set<string>();

  public async create(input: NewAuthorizationTransaction): Promise<void> {
    this.records.push(input);
  }

  public async consumeMatching(input: Readonly<{
    stateHash: string;
    browserBindingHash: string;
  }>): Promise<ConsumedAuthorizationTransaction | null> {
    const match = this.records.find((record) => (
      record.stateHash === input.stateHash
      && record.browserBindingHash === input.browserBindingHash
      && !this.consumedStateHashes.has(record.stateHash)
    ));
    if (!match) {
      return null;
    }
    this.consumedStateHashes.add(match.stateHash);
    return {
      id: "00000000-0000-4000-8000-000000000001",
      nonceHash: match.nonceHash,
      codeVerifierCiphertext: match.codeVerifierCiphertext,
      createdAt: new Date(match.expiresAt.getTime() - 1_000),
      expiresAt: match.expiresAt,
    };
  }
}

export class FakeScopeRepository implements PilotScopeRepository {
  public calls = 0;
  public scope: ResolvedPilotScope = { id: "scope-001", scopeKey: "doorstar-pilot" };

  public async requireSingleConfiguredScope(input: Readonly<{ scopeKey: string }>): Promise<ResolvedPilotScope> {
    this.calls += 1;
    if (input.scopeKey !== this.scope.scopeKey) {
      throw new Error("unexpected_scope_key");
    }
    return this.scope;
  }
}

export class FakeBindings implements PilotBindingRepository {
  public lookupCalls: Array<Readonly<{ pilotScopeId: string; issuer: string; subjectDigest: string }>> = [];
  public binding: ActivePilotBinding | null = {
    id: "binding-001",
    pilotScopeId: "scope-001",
    actorKey: "actor-doorstar-001",
    displayName: "Pilot User",
    role: "SALES",
    active: true,
  };

  public async findActiveByOidcIdentity(input: Readonly<{
    pilotScopeId: string;
    issuer: string;
    subjectDigest: string;
  }>): Promise<ActivePilotBinding | null> {
    this.lookupCalls.push(input);
    return this.binding;
  }
}

export class FakeSessions implements OpaqueSessionRepository {
  public readonly created: NewOpaqueSession[] = [];
  public readonly revoked: Array<Readonly<{
    pilotScopeId: string;
    sessionTokenHash: string;
    revokedAt: Date;
  }>> = [];
  public createAllowed = true;
  public response: ActiveOpaqueSession | null = null;

  public async createForActiveBinding(input: NewOpaqueSession): Promise<boolean> {
    if (!this.createAllowed) {
      return false;
    }
    this.created.push(input);
    this.response = {
      id: "00000000-0000-4000-8000-000000000002",
      pilotScopeId: input.pilotScopeId,
      bindingId: input.bindingId,
      actorKey: "actor-doorstar-001",
      displayName: "Pilot User",
      role: "SALES",
      expiresAt: input.expiresAt,
    };
    return true;
  }

  public async findActiveByTokenHash(input: Readonly<{
    pilotScopeId: string;
    sessionTokenHash: string;
    observedAt: Date;
  }>): Promise<ActiveOpaqueSession | null> {
    const match = this.created.find((record) => (
      record.pilotScopeId === input.pilotScopeId
      && record.sessionTokenHash === input.sessionTokenHash
      && record.expiresAt.getTime() > input.observedAt.getTime()
    ));
    return match ? this.response : null;
  }

  public async revokeByTokenHash(input: Readonly<{
    pilotScopeId: string;
    sessionTokenHash: string;
    revokedAt: Date;
  }>): Promise<void> {
    this.revoked.push(input);
  }
}

export class FakeRosterReader implements PilotRosterReader {
  public readonly managerCalls: Array<Readonly<{
    pilotScopeId: string;
    sessionTokenHash: string;
    observedAt: Date;
  }>> = [];
  public readonly listCalls: Array<Readonly<{
    pilotScopeId: string;
    actorSessionTokenHash: string;
  }>> = [];
  public manager: EffectivePilotRosterManager | null = {
    bindingId: "binding-001",
    pilotScopeId: "scope-001",
  };
  public users: readonly PilotRosterUser[] = [{
    bindingId: "00000000-0000-4000-8000-000000000010",
    displayName: "Pilot Administrator",
    role: "ADMINISTRATOR",
    active: true,
    canManagePilotRoster: true,
    auditVersion: 1,
  }];
  public failManager = false;
  public failList = false;

  public async findEffectiveManagerBySessionTokenHash(input: Readonly<{
    pilotScopeId: string;
    sessionTokenHash: string;
    observedAt: Date;
  }>): Promise<EffectivePilotRosterManager | null> {
    this.managerCalls.push(input);
    if (this.failManager) {
      throw new Error("fake_roster_manager_failure");
    }
    return this.manager;
  }

  public async listDirectAdminBindings(input: Readonly<{
    pilotScopeId: string;
    actorSessionTokenHash: string;
  }>): Promise<readonly PilotRosterUser[]> {
    this.listCalls.push(input);
    if (this.failList) {
      throw new Error("fake_roster_list_failure");
    }
    return this.users;
  }
}

export class FakeRosterWriter implements PilotRosterWriter {
  public readonly provisionCalls: DirectRosterBindingProvision[] = [];
  public readonly updateCalls: DirectRosterBindingUpdate[] = [];
  public failProvision = false;
  public failUpdate = false;
  public provisionedUser: PilotRosterUser = {
    bindingId: "00000000-0000-4000-8000-000000000011",
    displayName: "New Pilot User",
    role: "SALES",
    active: true,
    canManagePilotRoster: false,
    auditVersion: 1,
  };
  public updatedUser: PilotRosterUser = {
    bindingId: "00000000-0000-4000-8000-000000000010",
    displayName: "Pilot Administrator",
    role: "READER",
    active: false,
    canManagePilotRoster: false,
    auditVersion: 2,
  };

  public async provisionDirectAdminBinding(input: DirectRosterBindingProvision): Promise<PilotRosterUser> {
    this.provisionCalls.push(input);
    if (this.failProvision) {
      throw new Error("fake_roster_provision_failure");
    }
    return this.provisionedUser;
  }

  public async updateDirectAdminBinding(input: DirectRosterBindingUpdate): Promise<PilotRosterUser> {
    this.updateCalls.push(input);
    if (this.failUpdate) {
      throw new Error("fake_roster_update_failure");
    }
    return this.updatedUser;
  }
}

export class FakeDirectory implements PilotDirectoryAdmin {
  public readonly createCalls: Array<Readonly<{ email: string; displayName: string }>> = [];
  public readonly enabledSubjects: string[] = [];
  public readonly disabledSubjects: string[] = [];
  public subject = "oidc-subject-002";
  public failCreate = false;
  public failEnable = false;
  public failDisable = false;

  public async createAccountAndSendInvitation(input: Readonly<{
    email: string;
    displayName: string;
  }>): Promise<Readonly<{ subject: string }>> {
    this.createCalls.push(input);
    if (this.failCreate) {
      throw new Error("fake_directory_create_failure");
    }
    return { subject: this.subject };
  }

  public async enableCreatedAccount(input: Readonly<{ subject: string }>): Promise<void> {
    this.enabledSubjects.push(input.subject);
    if (this.failEnable) {
      throw new Error("fake_directory_enable_failure");
    }
  }

  public async disableCreatedAccount(input: Readonly<{ subject: string }>): Promise<void> {
    this.disabledSubjects.push(input.subject);
    if (this.failDisable) {
      throw new Error("fake_directory_disable_failure");
    }
  }
}

export class FakeOidc implements OidcAuthorizationClient {
  public authorizationRequests: OidcAuthorizationRequest[] = [];
  public codeExchanges: OidcCodeExchangeRequest[] = [];
  public identity = {
    issuer: testConfig.oidc.issuer,
    subject: "oidc-subject-001",
  };
  public rejectExchange = false;
  public authorizationUrlOverride: string | undefined;

  public async createAuthorizationUrl(input: OidcAuthorizationRequest): Promise<string> {
    this.authorizationRequests.push(input);
    if (this.authorizationUrlOverride) {
      return this.authorizationUrlOverride;
    }
    const url = new URL(testConfig.oidc.authorizationEndpoint);
    url.searchParams.set("client_id", input.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("scope", input.requestedScopes.join(" "));
    url.searchParams.set("state", input.state);
    url.searchParams.set("nonce", input.nonce);
    url.searchParams.set("code_challenge", input.pkceChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  public async redeemAuthorizationCode(input: OidcCodeExchangeRequest): Promise<{
    issuer: string;
    subject: string;
  }> {
    this.codeExchanges.push(input);
    if (this.rejectExchange) {
      throw new Error("oidc_rejected");
    }
    return this.identity;
  }
}

export class FakeLogger implements PilotAuthLogger {
  public readonly events: Array<Readonly<{ level: string; event: string }>> = [];

  public info(event: string): void {
    this.events.push({ level: "info", event });
  }

  public warn(event: string): void {
    this.events.push({ level: "warn", event });
  }

  public error(event: string): void {
    this.events.push({ level: "error", event });
  }
}

export type TestHarness = Readonly<{
  app: PilotBff;
  clock: FixedClock;
  crypto: FakeCrypto;
  transactions: FakeTransactions;
  scopes: FakeScopeRepository;
  bindings: FakeBindings;
  sessions: FakeSessions;
  oidc: FakeOidc;
  rosterReader: FakeRosterReader;
  rosterWriter: FakeRosterWriter;
  directory: FakeDirectory;
  logger: FakeLogger;
}>;

export async function createTestHarness(): Promise<TestHarness> {
  const clock = new FixedClock();
  const crypto = new FakeCrypto();
  const transactions = new FakeTransactions();
  const scopes = new FakeScopeRepository();
  const bindings = new FakeBindings();
  const sessions = new FakeSessions();
  const rosterReader = new FakeRosterReader();
  const rosterWriter = new FakeRosterWriter();
  const directory = new FakeDirectory();
  const oidc = new FakeOidc();
  const logger = new FakeLogger();
  const app = await createPilotBff({
    config: testConfig,
    clock,
    crypto,
    oidc,
    transactions,
    bindings,
    sessions,
    scopes,
    rosterReader,
    rosterWriter,
    directory,
    logger,
  });
  return {
    app,
    clock,
    crypto,
    transactions,
    scopes,
    bindings,
    sessions,
    oidc,
    rosterReader,
    rosterWriter,
    directory,
    logger,
  };
}

/** Compile-only evidence: BFF test composition cannot accept either writer. */
export type WriterBoundariesRemainOutsideBff = {
  direct: DirectPilotWriter;
  bootstrap: BootstrapPilotWriter;
};

function stableDigest(value: string): string {
  let total = 0;
  for (const character of value) {
    total = (total * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `${value.length.toString(16)}${total.toString(16)}`.padStart(64, "0").slice(-64);
}
