import { createHash } from "node:crypto";

/** SHA-256 identifiers bind reviewed runtime inputs; they never carry secrets. */
export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Serialize semantically identical JSON values in a byte-stable form. */
export function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

/** A trailing newline is part of every Gate 1 canonical-artifact contract. */
export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}
