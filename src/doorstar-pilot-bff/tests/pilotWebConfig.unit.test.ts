import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  loadPilotWebConfig,
  pilotWebListenerHost,
  PilotWebConfigurationError,
  validatePilotWebConfig,
} from "../src/index.js";

describe("pilot web listener configuration", () => {
  it("requires one explicit non-privileged port and fixes the listener to loopback", () => {
    expect(loadPilotWebConfig({
      DOORSTAR_PILOT_LISTENER_PORT: "4317",
    })).toEqual({
      listenerHost: "127.0.0.1",
      listenerPort: 4317,
    });
    expect(pilotWebListenerHost).toBe("127.0.0.1");
  });

  it.each([
    [{}, "missing_doorstar_pilot_listener_port"],
    [{ DOORSTAR_PILOT_LISTENER_PORT: "0" }, "listener_port_invalid"],
    [{ DOORSTAR_PILOT_LISTENER_PORT: "443" }, "listener_port_invalid"],
    [{ DOORSTAR_PILOT_LISTENER_PORT: "65536" }, "listener_port_invalid"],
    [{ DOORSTAR_PILOT_LISTENER_PORT: "4317.5" }, "listener_port_invalid"],
  ])("fails closed for %o", (environment, expectedCode) => {
    expect(() => loadPilotWebConfig(environment)).toThrow(expectedCode);
  });

  it("does not accept a caller-selected listener host", () => {
    expect(() => validatePilotWebConfig({ listenerPort: 0 })).toThrow(PilotWebConfigurationError);
    expect(validatePilotWebConfig({ listenerPort: 4317 })).not.toHaveProperty("listenerHost", "0.0.0.0");
  });

  it("documents the listener as an explicit source-only runtime setting", async () => {
    const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");

    expect(example).toContain("DOORSTAR_PILOT_LISTENER_PORT=4317");
  });
});
