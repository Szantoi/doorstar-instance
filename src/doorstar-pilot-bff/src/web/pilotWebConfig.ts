/** The web composition is intentionally loopback-only; ingress owns public TLS. */
export const pilotWebListenerHost = "127.0.0.1" as const;

export type PilotWebConfig = Readonly<{
  listenerHost: typeof pilotWebListenerHost;
  listenerPort: number;
}>;

export class PilotWebConfigurationError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "PilotWebConfigurationError";
  }
}

/**
 * Listener configuration is deliberately separate from the BFF's public
 * origin. The listener remains a private HTTP hop behind separately approved
 * HTTPS ingress, while the BFF's public origin continues to be an HTTPS URL.
 */
export function loadPilotWebConfig(environment: NodeJS.ProcessEnv): PilotWebConfig {
  return validatePilotWebConfig({
    listenerPort: requiredListenerPort(
      environment.DOORSTAR_PILOT_LISTENER_PORT,
    ),
  });
}

export function validatePilotWebConfig(input: Readonly<{
  listenerPort: number;
}>): PilotWebConfig {
  if (
    !Number.isSafeInteger(input.listenerPort)
    || input.listenerPort < 1_024
    || input.listenerPort > 65_535
  ) {
    throw new PilotWebConfigurationError("listener_port_invalid");
  }

  return Object.freeze({
    listenerHost: pilotWebListenerHost,
    listenerPort: input.listenerPort,
  });
}

function requiredListenerPort(value: string | undefined): number {
  if (!value) {
    throw new PilotWebConfigurationError("missing_doorstar_pilot_listener_port");
  }
  const trimmed = value.trim();
  if (!/^[1-9][0-9]{0,4}$/.test(trimmed)) {
    throw new PilotWebConfigurationError("listener_port_invalid");
  }
  return Number(trimmed);
}
