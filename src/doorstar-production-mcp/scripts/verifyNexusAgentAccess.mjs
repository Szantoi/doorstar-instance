#!/usr/bin/env node
/** Live, secret-safe verification of the six Doorstar Codex Nexus principals. */

import {
  DEFAULT_NEXUS_MCP_URL,
  DOORSTAR_WOODWORKING_CORPUS_FINGERPRINT,
  NEXUS_PRINCIPAL_TOKEN_ENVIRONMENT,
  NexusKnowledgeClient,
  resolveNexusToken,
} from '../dist/nexusKnowledge.js';

const principals = Object.keys(NEXUS_PRINCIPAL_TOKEN_ENVIRONMENT);
const blockedTools = ['write_memory', 'complete_task', 'delete_skill'];
const healthUrl = new URL('/health', DEFAULT_NEXUS_MCP_URL);

async function rpc(token, method, params) {
  const response = await fetch(DEFAULT_NEXUS_MCP_URL, {
    method: 'POST',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    // The status remains usable and no upstream body is printed.
  }
  return { status: response.status, body };
}

async function health(token) {
  const response = await fetch(healthUrl, {
    method: 'GET',
    redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    // The status remains usable and no upstream body is printed.
  }
  return { status: response.status, body };
}

for (const principal of principals) {
  const token = await resolveNexusToken({ principal });
  if (!token) throw new Error(`${principal}: credential unavailable`);

  const tenantHealth = await health(token);
  if (
    tenantHealth.status !== 200 ||
    tenantHealth.body?.status !== 'ok' ||
    tenantHealth.body?.collectionName !== 'doorstar-woodworking' ||
    tenantHealth.body?.tenantId !== 'doorstar' ||
    tenantHealth.body?.scope !== 'woodworking' ||
    tenantHealth.body?.port !== 3467 ||
    !Number.isInteger(tenantHealth.body?.documents) ||
    tenantHealth.body.documents < 1 ||
    tenantHealth.body?.corpusFingerprint !== DOORSTAR_WOODWORKING_CORPUS_FINGERPRINT
  ) {
    throw new Error(`${principal}: tenant health attestation failed`);
  }

  const listed = await rpc(token, 'tools/list', {});
  const names = [...new Set((listed.body.result?.tools ?? []).map((tool) => tool.name))];
  if (listed.status !== 200 || names.length !== 1 || names[0] !== 'search_knowledge') {
    throw new Error(`${principal}: tool allowlist validation failed`);
  }

  for (const tool of blockedTools) {
    const denied = await rpc(token, 'tools/call', { name: tool, arguments: {} });
    if (denied.status !== 403 || denied.body.error?.code !== -32003) {
      throw new Error(`${principal}: ${tool} was not denied by Nexus`);
    }
  }

  const searched = await rpc(token, 'tools/call', {
    name: 'search_knowledge',
    arguments: { query: 'falnyilas', limit: 1, domain: 'woodworking' },
  });
  let payload = {};
  try {
    payload = JSON.parse(searched.body.result?.content?.[0]?.text ?? '{}');
  } catch {
    // Validated below without logging the upstream content.
  }
  if (
    searched.status !== 200 ||
    payload.island !== 'doorstar' ||
    payload.collection !== 'doorstar-woodworking' ||
    payload.domain !== 'woodworking' ||
    payload.scope !== 'woodworking' ||
    payload.corpusFingerprint !== tenantHealth.body.corpusFingerprint ||
    payload.results?.some((result) =>
      result.metadata?.domain !== 'woodworking' ||
      result.metadata?.tenantId !== 'doorstar' ||
      result.metadata?.scope !== 'woodworking' ||
      !/^tenant:doorstar;scope:woodworking;card:[a-z0-9][a-z0-9-]*$/.test(result.metadata?.source ?? '')
    ) ||
    !payload.results?.[0]
  ) {
    throw new Error(`${principal}: scoped knowledge search validation failed`);
  }

  const nonWoodworking = await rpc(token, 'tools/call', {
    name: 'search_knowledge',
    arguments: { query: 'fejlesztoi forraskod repository API konfiguracio', limit: 1, domain: 'woodworking' },
  });
  let negativePayload = {};
  try {
    negativePayload = JSON.parse(nonWoodworking.body.result?.content?.[0]?.text ?? '{}');
  } catch {
    // Validated below without logging the upstream content.
  }
  if (
    nonWoodworking.status !== 200 ||
    negativePayload.domain !== 'woodworking' ||
    negativePayload.collection !== 'doorstar-woodworking' ||
    negativePayload.count !== 0 ||
    !Array.isArray(negativePayload.results) ||
    negativePayload.results.length !== 0
  ) {
    throw new Error(`${principal}: non-woodworking query did not fail closed`);
  }

  // Exercise the same strict client path that the stdio bridge uses. It pins
  // the checked-in corpus fingerprint and complete deterministic cards, so a
  // valid-looking upstream label cannot smuggle code or book text.
  const trustedClient = new NexusKnowledgeClient({ token });
  const trustedPositive = await trustedClient.search('falnyilas', 1);
  const trustedNegative = await trustedClient.search('fejlesztoi forraskod repository API konfiguracio', 1);
  if (trustedPositive.results.length !== 1 || trustedNegative.results.length !== 0) {
    throw new Error(`${principal}: bridge trust-root validation failed`);
  }

  console.log(`${principal}: tools=1, blocked=3/3, tenant=doorstar-woodworking, scope=woodworking, manifest=pinned, nonwood=0`);
}

console.log(`Verified ${principals.length} distinct Doorstar Codex Nexus principals.`);
