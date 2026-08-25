# Observability boundary

This folder holds the process-wide log redaction policy. It is intentionally an
allowlist, not a blacklist: HTTP lifecycle entries retain only a request ID,
HTTP method, query- and fragment-free path, response status, and a generic
error type. They never serialize request/response headers, request/response
bodies, query parameters, raw `Error` fields, cookies, tokens, or callback
codes.

`logger.ts` uses the same redacted error serializer and a Pino method hook for
direct operational error calls. The hook replaces Pino's automatic
Error-to-message convenience behavior with a fixed message, including direct
`logger.error(error)` and message-less `logger.error({ err: error })` calls.
New BFF and identity-authority code must use structured fields with controlled
event names; it must not interpolate untrusted request data or error text into
a log message.

The executable contract is
`tests/httpLoggingSecurity.unit.test.ts`. Run it with `npm run test:unit --
tests/httpLoggingSecurity.unit.test.ts` before changing these serializers.
