/** Stable, non-sensitive failure codes for the Gate 0 source tool. */
export class Gate0Error extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function fail(code) {
  throw new Gate0Error(code);
}
