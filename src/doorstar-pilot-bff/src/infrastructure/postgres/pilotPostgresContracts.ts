/** Minimal structural contract shared by the production pg Pool and unit fakes. */
export type PilotPgRow = Readonly<Record<string, unknown>>;

export type PilotPgQueryResult<Row extends PilotPgRow = PilotPgRow> = Readonly<{
  rows: readonly Row[];
  rowCount: number | null;
}>;

export interface PilotPgClient {
  query<Row extends PilotPgRow = PilotPgRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PilotPgQueryResult<Row>>;
  /** Pass a transaction failure so node-postgres destroys, not reuses, the client. */
  release(error?: Error): void;
}

export interface PilotPgPool {
  connect(): Promise<PilotPgClient>;
  end(): Promise<void>;
}
