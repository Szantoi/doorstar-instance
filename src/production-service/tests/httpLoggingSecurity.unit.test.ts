import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createApplicationLogger } from "../src/logger.js";

describe("HTTP request lifecycle logging", () => {
  it("never logs authority headers, cookies, query parameters, response headers, or raw errors", async () => {
    const captured: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        captured.push(String(chunk));
        callback();
      },
    });
    const app = createApp({
      httpLogger: createApplicationLogger({ destination: stream, isDevelopment: false, level: "info" }),
    });
    app.post("/log-security-probe", (req, res) => {
      req.log?.error(sensitiveError("request-log-direct-error-secret", "request-log-direct-cause-secret"));
      req.log?.error({ err: sensitiveError("request-log-error-secret", "request-log-cause-secret") });
      req.log?.error(
        {
          err: sensitiveError("request-log-explicit-error-secret", "request-log-explicit-cause-secret"),
          event: "request_log_explicit_error",
        },
        "request-log-explicit-message-secret",
      );
      res.setHeader("Set-Cookie", "__Host-doorstar-session=response-cookie-secret; Secure");
      res.setHeader("Location", "https://doorstar.example.test/callback?code=response-code-secret");
      res.status(500).json({ status: "response-body-secret" });
    });

    await request(app)
      .post("/log-security-probe?code=query-code-secret&state=query-state-secret")
      .set("Authorization", "Bearer authorization-secret")
      .set("Cookie", "__Host-doorstar-session=request-cookie-secret; __Host-doorstar-csrf=request-csrf-cookie-secret")
      .set("X-Doorstar-CSRF", "csrf-header-secret")
      .send({ credential: "request-body-secret" })
      .expect(500);
    await new Promise<void>((resolve) => setImmediate(resolve));

    const log = captured.join("");
    for (const secret of [
      "authorization-secret",
      "request-cookie-secret",
      "request-csrf-cookie-secret",
      "csrf-header-secret",
      "query-code-secret",
      "query-state-secret",
      "response-cookie-secret",
      "response-code-secret",
      "response-body-secret",
      "request-body-secret",
      "request-log-direct-error-secret",
      "request-log-direct-cause-secret",
      "request-log-error-secret",
      "request-log-cause-secret",
      "request-log-explicit-error-secret",
      "request-log-explicit-cause-secret",
      "request-log-explicit-message-secret",
    ]) {
      expect(log).not.toContain(secret);
    }
    expect(log).toContain('"method":"POST"');
    expect(log).toContain('"path":"/log-security-probe"');
    expect(log).toContain('"statusCode":500');
    expect(log).toContain('"type":"redacted_error"');
    expect(log).toContain('"event":"request_log_explicit_error"');
    expect(log).not.toContain('"headers"');
    expect(log).not.toContain('"query"');
    expect(log).not.toContain('"stack"');
  });

  it("uses the same redaction policy for direct operational logger errors", async () => {
    const captured: string[] = [];
    const operationalLogger = createApplicationLogger({
      destination: captureStream(captured),
      isDevelopment: false,
      level: "info",
    });

    operationalLogger.error(sensitiveError("direct-error-message-secret", "direct-error-cause-secret"));
    operationalLogger.error({ err: sensitiveError("field-error-message-secret", "field-error-cause-secret") });
    operationalLogger.error(
      {
        err: sensitiveError("explicit-error-message-secret", "explicit-error-cause-secret"),
        event: "operational_error_probe",
      },
      "explicit-error-log-message-secret",
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    const log = captured.join("");
    expect(log).toContain('"type":"redacted_error"');
    expect(log).toContain('"msg":"redacted error"');
    expect(log).toContain('"event":"operational_error_probe"');
    for (const secret of [
      "direct-error-message-secret",
      "direct-error-cause-secret",
      "field-error-message-secret",
      "field-error-cause-secret",
      "explicit-error-message-secret",
      "explicit-error-cause-secret",
      "explicit-error-log-message-secret",
    ]) {
      expect(log).not.toContain(secret);
    }
    expect(log).not.toContain('"stack"');
  });
});

function captureStream(captured: string[]): Writable {
  return new Writable({
    write(chunk, _encoding, callback) {
      captured.push(String(chunk));
      callback();
    },
  });
}

function sensitiveError(message: string, causeMessage: string): Error {
  const error = new Error(message);
  Object.assign(error, { cause: new Error(causeMessage) });
  return error;
}
