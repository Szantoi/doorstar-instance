import { isAbsolute } from "node:path";
import { A03ProofError } from "./a03Config.js";
import { requireLocalFilesystemPath } from "./trustedLocalTempRoot.js";

declare const trustedDockerCliPathBrand: unique symbol;
declare const immutablePostgresImageReferenceBrand: unique symbol;

/**
 * A Docker executable location supplied by the separately trusted host-run
 * procedure. Runtime validation establishes only an absolute call shape; it
 * does not attest the executable, its owner, its wrapper chain, or the daemon.
 */
export type TrustedDockerCliPath = string & Readonly<{
  [trustedDockerCliPathBrand]: "TrustedDockerCliPath";
}>;

/** A reviewed, content-addressed reference for Docker Hub's official Postgres image. */
export type ImmutablePostgresImageReference = string & Readonly<{
  [immutablePostgresImageReferenceBrand]: "ImmutablePostgresImageReference";
}>;

/**
 * Explicit runtime inputs that must later be bound by the separate Gate 1
 * human approval record. Supplying them to this source harness is not itself
 * an approval and does not verify any external artifact provenance.
 */
export type DockerRuntimeInput = Readonly<{
  dockerCliPath: TrustedDockerCliPath;
  postgresImageReference: ImmutablePostgresImageReference;
}>;

export type DockerRuntimeInputCandidate = Readonly<{
  dockerCliPath?: string;
  postgresImageReference?: string;
}>;

/** Safe evidence only: no executable or Docker-config filesystem path is retained. */
export type RedactedDockerRuntimeInput = Readonly<{
  dockerCliContentSha256: string | null;
  dockerContext: "default";
  endpointPolicy: "platform_default_local_socket_only";
  postgresImageReference: ImmutablePostgresImageReference;
}>;

const immutablePostgresImageReferencePattern = /^postgres@sha256:[a-f0-9]{64}$/;
const sha256HexPattern = /^[a-f0-9]{64}$/;

/**
 * Requires explicit, non-environment-sourced Docker execution inputs before
 * the harness can form any Docker command. A bare `docker` command is never
 * accepted because the runner must not perform PATH lookup.
 */
export function requireDockerRuntimeInput(
  candidate: DockerRuntimeInputCandidate,
): DockerRuntimeInput {
  return Object.freeze({
    dockerCliPath: requireTrustedDockerCliPath(candidate.dockerCliPath),
    postgresImageReference: requireImmutablePostgresImageReference(candidate.postgresImageReference),
  });
}

export function requireTrustedDockerCliPath(value: string | undefined): TrustedDockerCliPath {
  if (value === undefined || value.length === 0) {
    throw new A03ProofError("a03_docker_cli_path_required");
  }
  if (
    value !== value.trim()
    || value.includes("\0")
    || !isAbsolute(value)
  ) {
    throw new A03ProofError("a03_docker_cli_path_not_absolute");
  }
  return requireLocalFilesystemPath(value, "a03_docker_cli_path_not_absolute") as TrustedDockerCliPath;
}

export function requireImmutablePostgresImageReference(
  value: string | undefined,
): ImmutablePostgresImageReference {
  if (value === undefined || value.length === 0) {
    throw new A03ProofError("a03_postgres_image_reference_required");
  }
  if (!immutablePostgresImageReferencePattern.test(value)) {
    throw new A03ProofError("a03_postgres_image_reference_invalid");
  }
  return value as ImmutablePostgresImageReference;
}

export function redactDockerRuntimeInput(
  input: DockerRuntimeInput,
  dockerCliContentSha256: string | null,
): RedactedDockerRuntimeInput {
  if (dockerCliContentSha256 !== null && !sha256HexPattern.test(dockerCliContentSha256)) {
    throw new A03ProofError("a03_docker_cli_content_hash_invalid");
  }
  return Object.freeze({
    dockerCliContentSha256,
    dockerContext: "default",
    endpointPolicy: "platform_default_local_socket_only",
    postgresImageReference: input.postgresImageReference,
  });
}
