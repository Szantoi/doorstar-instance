#!/usr/bin/env node
/** Live, secret-safe verification of the six Doorstar Codex Nexus principals. */

import {
  DEFAULT_NEXUS_MCP_URL,
  NEXUS_PRINCIPAL_TOKEN_ENVIRONMENT,
  resolveNexusToken,
} from '../dist/nexusKnowledge.js';

const principals = Object.keys(NEXUS_PRINCIPAL_TOKEN_ENVIRONMENT);
const blockedTools = ['write_memory', 'complete_task', 'delete_skill'];

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

for (const principal of principals) {
  const token = await resolveNexusToken({ principal });
  if (!token) throw new Error(`${principal}: credential unavailable`);

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
    arguments: { query: 'belteri ajtotok falvastagsag', limit: 1 },
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
    !payload.results?.[0]?.metadata?.source
  ) {
    throw new Error(`${principal}: scoped knowledge search validation failed`);
  }

  console.log(`${principal}: tools=1, blocked=3/3, island=doorstar, source=yes`);
}

console.log(`Verified ${principals.length} distinct Doorstar Codex Nexus principals.`);
