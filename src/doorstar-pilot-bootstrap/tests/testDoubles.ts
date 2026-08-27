import type {
  BootstrapProvisionInvocation,
  BootstrapRevokeInvocation,
  PilotBootstrapDatabase,
} from "../src/application/bootstrapService.js";
import type {
  BootstrapPgClient,
  BootstrapPgPool,
} from "../src/infrastructure/pgBootstrapDatabase.js";

export const scopeId = "11111111-1111-4111-8111-111111111111";
export const provisionedBindingId = "22222222-2222-4222-8222-222222222222";
export const revokedBindingId = "33333333-3333-4333-8333-333333333333";

export type QueryCall = Readonly<{
  text: string;
  values: readonly unknown[];
}>;

export class FakePgClient implements BootstrapPgClient {
  public readonly calls: QueryCall[] = [];
  public released = false;
  public releaseError: Error | undefined;
  public failOnBegin = false;
  public failOnPreflight = false;
  public failOnProvision = false;
  public failOnRollback = false;
  public scopeRows: readonly { id: string }[] = [{ id: scopeId }];

  public async query<Row extends Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<Readonly<{ rows: readonly Row[] }>> {
    this.calls.push({ text, values });
    if (text === "BEGIN ISOLATION LEVEL SERIALIZABLE" && this.failOnBegin) {
      throw new Error("bootstrap_begin_rejected_by_fake");
    }
    if (text === "ROLLBACK" && this.failOnRollback) {
      throw new Error("bootstrap_rollback_rejected_by_fake");
    }
    if (text.includes("pilot_bootstrap_preflight_v1")) {
      if (this.failOnPreflight) {
        throw new Error("bootstrap_preflight_rejected_by_fake");
      }
      return { rows: [] };
    }
    if (text.includes('FROM pilot."PilotScope"')) {
      return { rows: this.scopeRows as readonly Row[] };
    }
    if (text.includes("pilot_bootstrap_provision_binding_v1")) {
      if (this.failOnProvision) {
        throw new Error("bootstrap_provision_rejected_by_fake");
      }
      return { rows: [{ bindingId: provisionedBindingId } as Row] };
    }
    if (text.includes("pilot_bootstrap_revoke_binding_v1")) {
      return { rows: [{ bindingId: revokedBindingId } as Row] };
    }
    return { rows: [] };
  }

  public release(error?: Error): void {
    this.released = true;
    this.releaseError = error;
  }
}

export class FakePgPool implements BootstrapPgPool {
  public readonly client = new FakePgClient();
  public connectCount = 0;
  public ended = false;

  public async connect(): Promise<BootstrapPgClient> {
    this.connectCount += 1;
    return this.client;
  }

  public async end(): Promise<void> {
    this.ended = true;
  }
}

export class FakeBootstrapDatabase implements PilotBootstrapDatabase {
  public preflightCalls = 0;
  public readonly provisions: BootstrapProvisionInvocation[] = [];
  public readonly revocations: BootstrapRevokeInvocation[] = [];
  public closed = false;
  public failOnPreflight = false;

  public async preflight(): Promise<void> {
    this.preflightCalls += 1;
    if (this.failOnPreflight) {
      throw new Error("fake_bootstrap_preflight_failure");
    }
  }

  public async provision(input: BootstrapProvisionInvocation): Promise<string> {
    this.provisions.push(input);
    return provisionedBindingId;
  }

  public async revoke(input: BootstrapRevokeInvocation): Promise<string> {
    this.revocations.push(input);
    return revokedBindingId;
  }

  public async close(): Promise<void> {
    this.closed = true;
  }
}
