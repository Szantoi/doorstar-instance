export class PilotAuthError extends Error {
  public constructor(
    public readonly status: 400 | 401 | 403,
    public readonly code: string,
  ) {
    super(code);
    this.name = "PilotAuthError";
  }
}

/**
 * Deliberately coarse HTTP-facing failures for the administrator roster. The
 * code is only for server control flow; route responses never disclose DB,
 * directory, e-mail, token or subject details.
 */
export class PilotRosterAdminError extends Error {
  public constructor(
    public readonly status: 400 | 401 | 403 | 503,
    public readonly code: string,
  ) {
    super(code);
    this.name = "PilotRosterAdminError";
  }
}
