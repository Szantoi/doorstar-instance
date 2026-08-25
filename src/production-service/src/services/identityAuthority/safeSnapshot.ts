import { parseCanonicalUtcInstant, type CanonicalUtcInstant } from "./contract.js";

/**
 * Takes one descriptor-level copy of an object and rejects getters, setters,
 * inherited fields, sparse arrays, and unexpected own fields. The copy avoids
 * validating one value and later persisting a different Proxy/getter value.
 */
export function readExactOwnDataFields(
  value: unknown,
  expectedKeys: readonly PropertyKey[],
): ReadonlyMap<PropertyKey, unknown> | undefined {
  const fields = readOwnDataFields(value);
  return fields !== undefined && hasExactFieldKeys(fields, expectedKeys) ? fields : undefined;
}

/** Returns one own-data snapshot; callers can then select an exact union shape. */
export function readOwnDataFields(value: unknown): ReadonlyMap<PropertyKey, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  } catch {
    return undefined;
  }
  const fields = new Map<PropertyKey, unknown>();
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = Object.getOwnPropertyDescriptor(descriptors, key)?.value;
    if (!isEnumerableDataDescriptor(descriptor)) return undefined;
    fields.set(key, descriptor.value);
  }
  return fields;
}

export function hasExactFieldKeys(fields: ReadonlyMap<PropertyKey, unknown>, expectedKeys: readonly PropertyKey[]): boolean {
  return fields.size === expectedKeys.length && expectedKeys.every((key) => fields.has(key));
}

/** Takes a bounded, dense string-array copy without invoking indexed getters. */
export function snapshotCanonicalStringArray(value: unknown, maximumLength: number): readonly string[] | undefined {
  const snapshot = snapshotDenseArray(value, maximumLength);
  if (snapshot === undefined || !snapshot.every((item) => typeof item === "string")) return undefined;
  return Object.freeze([...snapshot] as string[]);
}

/** Takes a bounded dense array copy without invoking indexed getters. */
export function snapshotDenseArray(value: unknown, maximumLength: number): readonly unknown[] | undefined {
  if (!Array.isArray(value)
    || !Number.isSafeInteger(maximumLength)
    || maximumLength < 0) return undefined;

  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  } catch {
    return undefined;
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(descriptors, "length")?.value;
  if (!isDataDescriptor(lengthDescriptor)
    || typeof lengthDescriptor.value !== "number"
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value > maximumLength) {
    return undefined;
  }
  const length = lengthDescriptor.value;
  const expectedKeys: PropertyKey[] = ["length"];
  for (let index = 0; index < length; index += 1) expectedKeys.push(String(index));
  const actualKeys = Reflect.ownKeys(descriptors);
  if (actualKeys.length !== expectedKeys.length
    || !actualKeys.every((key) => expectedKeys.some((expected) => expected === key))) {
    return undefined;
  }

  const copied: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(descriptors, String(index))?.value;
    if (!isEnumerableDataDescriptor(descriptor)) return undefined;
    copied.push(descriptor.value);
  }
  return Object.freeze(copied);
}

/** Re-parses the wire value after a one-time descriptor copy. */
export function snapshotCanonicalUtcInstant(value: unknown): CanonicalUtcInstant | undefined {
  const fields = readExactOwnDataFields(value, ["wireValue", "epochSeconds", "nanoseconds"]);
  if (fields === undefined) return undefined;
  const wireValue = fields.get("wireValue");
  const epochSeconds = fields.get("epochSeconds");
  const nanoseconds = fields.get("nanoseconds");
  if (typeof wireValue !== "string" || typeof epochSeconds !== "number" || typeof nanoseconds !== "number") return undefined;
  try {
    const parsed = parseCanonicalUtcInstant(wireValue);
    return parsed.epochSeconds === epochSeconds && parsed.nanoseconds === nanoseconds
      ? Object.freeze(parsed)
      : undefined;
  } catch {
    return undefined;
  }
}

function isEnumerableDataDescriptor(value: unknown): value is PropertyDescriptor & { readonly value: unknown } {
  return isDataDescriptor(value) && value.enumerable === true;
}

function isDataDescriptor(value: unknown): value is PropertyDescriptor & { readonly value: unknown } {
  return typeof value === "object" && value !== null
    && Object.prototype.hasOwnProperty.call(value, "value")
    && !Object.prototype.hasOwnProperty.call(value, "get")
    && !Object.prototype.hasOwnProperty.call(value, "set");
}
