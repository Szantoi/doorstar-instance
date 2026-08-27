/** Log only safe identifiers and outcome metadata. Never include cookies, code, state, nonce, tokens or subject. */
export interface PilotAuthLogger {
  info(event: string, context: Readonly<Record<string, string | number | boolean>>): void;
  warn(event: string, context: Readonly<Record<string, string | number | boolean>>): void;
  error(event: string, context: Readonly<Record<string, string | number | boolean>>): void;
}
