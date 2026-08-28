/** Stable, path-free failure codes for the Gate 1 input verifier. */
export class Gate1Error extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function fail(code) {
  throw new Gate1Error(code);
}
