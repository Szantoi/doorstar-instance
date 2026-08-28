import { createHash } from "node:crypto";

/** SHA-256 is used only for integrity identifiers, never for secret storage. */
export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Recursively sort object keys so equivalent capsule data serializes identically. */
export function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

/** The trailing newline is part of the capsule's byte-level contract. */
export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}
