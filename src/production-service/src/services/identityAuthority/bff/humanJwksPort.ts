import { readExactOwnDataFields } from "../safeSnapshot.js";
import {
  snapshotDoorstarHumanOidcValidationProfile,
  type DoorstarHumanOidcProfile,
  type DoorstarHumanOidcValidationProfileSnapshot,
} from "./humanOidcProfile.js";

const SOURCE_FACTORY_FIELDS = Object.freeze(["profile", "loader"] as const);
const LOADER_FIELDS = Object.freeze(["load"] as const);
export const DOORSTAR_HUMAN_JWKS_MAXIMUM_RESPONSE_BYTES = 64 * 1_024;
export const DOORSTAR_HUMAN_JWKS_DEADLINE_MILLISECONDS = 2_000;
const sourceSnapshots = new WeakMap<object, DoorstarHumanJwksSourceSnapshot>();

declare const doorstarHumanJwksTextSourceBrand: unique symbol;

/** Opaque source capability permanently bound to one factory-issued OIDC profile. */
export interface DoorstarHumanJwksTextSource {
  readonly [doorstarHumanJwksTextSourceBrand]: never;
}

/** The immutable profile binding captured by the opaque JWKS source. */
interface DoorstarHumanJwksProfileBinding {
  readonly releaseId: string;
  readonly issuer: string;
  readonly jwksUri: string;
  readonly profileDigest: string;
}

/** The only non-secret profile fields a future bounded transport may receive. */
export interface DoorstarHumanJwksLoadRequest extends DoorstarHumanJwksProfileBinding {
  /** The adapter must abort I/O and streaming reads when this signal aborts. */
  readonly signal: AbortSignal;
  /** The adapter must enforce this cap before materializing a response body. */
  readonly maximumResponseBytes: number;
}

/** A future transport adapter receives only a canonical profile-derived JWKS request. */
export interface DoorstarHumanJwksTextLoader {
  load(input: DoorstarHumanJwksLoadRequest): Promise<Uint8Array>;
}

/**
 * Binds a raw-text loader to an opaque complete OIDC profile. The verifier can
 * later use the source only with that exact profile snapshot.
 */
export function createDoorstarHumanJwksTextSource(value: unknown): DoorstarHumanJwksTextSource | undefined {
  const fields = readExactOwnDataFields(value, SOURCE_FACTORY_FIELDS);
  if (fields === undefined) return undefined;
  const profile = snapshotDoorstarHumanOidcValidationProfile(fields.get("profile"));
  const loaderFields = readExactOwnDataFields(fields.get("loader"), LOADER_FIELDS);
  const load = loaderFields?.get("load");
  if (profile === undefined || typeof load !== "function") return undefined;

  const source = Object.freeze({}) as DoorstarHumanJwksTextSource;
  sourceSnapshots.set(source, Object.freeze({
    profile: snapshotProfileBinding(profile),
    loader: Object.freeze({ load: load as DoorstarHumanJwksTextLoader["load"] }),
  }));
  return source;
}

/** Accepts only an opaque source that was built for this exact validation profile. */
export function snapshotDoorstarHumanJwksTextSource(
  value: unknown,
  profile: DoorstarHumanOidcValidationProfileSnapshot,
): DoorstarHumanJwksTextSource | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const snapshot = sourceSnapshots.get(value);
  return snapshot !== undefined && sameProfileBinding(snapshot.profile, profile)
    ? value as DoorstarHumanJwksTextSource
    : undefined;
}

/** Returns raw text only when a verifier presents the exact profile-bound capability. */
export async function loadDoorstarHumanJwksText(
  source: unknown,
  profile: DoorstarHumanOidcValidationProfileSnapshot,
): Promise<Uint8Array | undefined> {
  if (typeof source !== "object" || source === null) return undefined;
  const snapshot = sourceSnapshots.get(source);
  if (snapshot === undefined || !sameProfileBinding(snapshot.profile, profile)) return undefined;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<undefined>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve(undefined);
    }, DOORSTAR_HUMAN_JWKS_DEADLINE_MILLISECONDS);
  });
  try {
    const result = await Promise.race([
      snapshot.loader.load(Object.freeze({
        ...snapshot.profile,
        signal: controller.signal,
        maximumResponseBytes: DOORSTAR_HUMAN_JWKS_MAXIMUM_RESPONSE_BYTES,
      })),
      timeoutResult,
    ]);
    return result instanceof Uint8Array && result.byteLength <= DOORSTAR_HUMAN_JWKS_MAXIMUM_RESPONSE_BYTES
      ? Buffer.from(result)
      : undefined;
  } catch {
    return undefined;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    controller.abort();
  }
}

function snapshotProfileBinding(profile: DoorstarHumanOidcValidationProfileSnapshot): DoorstarHumanJwksProfileBinding {
  return Object.freeze({
    releaseId: profile.releaseId,
    issuer: profile.issuer,
    jwksUri: profile.jwksUri,
    profileDigest: profile.profileDigest,
  });
}

function sameProfileBinding(
  binding: DoorstarHumanJwksProfileBinding,
  profile: DoorstarHumanOidcValidationProfileSnapshot,
): boolean {
  return binding.releaseId === profile.releaseId
    && binding.issuer === profile.issuer
    && binding.jwksUri === profile.jwksUri
    && binding.profileDigest === profile.profileDigest;
}

interface DoorstarHumanJwksSourceSnapshot {
  readonly profile: DoorstarHumanJwksProfileBinding;
  readonly loader: DoorstarHumanJwksTextLoader;
}
