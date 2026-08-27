export class PilotAuthError extends Error {
  public constructor(
    public readonly status: 400 | 401 | 403,
    public readonly code: string,
  ) {
    super(code);
    this.name = "PilotAuthError";
  }
}
