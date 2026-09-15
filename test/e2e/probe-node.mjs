#!/usr/bin/env node
/**
 * Inspects a node type on a running E2E stack: its connection shape and parameters.
 *
 * This is step one of adding E2E coverage for a new node or operation mode — you need
 * to know which inputs n8n expects (main vs. ai_embedding vs. ai_document ...) and the
 * exact parameter names before you can build a workflow that n8n will accept.
 *
 *   E2E_KEEP=1 pnpm test:e2e            # bring a stack up and leave it running
 *   node test/e2e/probe-node.mjs                        # list node types
 *   node test/e2e/probe-node.mjs vectorStoreCouchbase   # filter by substring
 *   node test/e2e/probe-node.mjs n8n-nodes-couchbase.couchbase --params
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.E2E_N8N_URL ?? 'http://127.0.0.1:5678';
const OWNER = { email: 'e2e@example.com', password: 'Testpassw0rd!' };

// n8n rate-limits /rest/login, so the session is cached between invocations —
// running this tool a few times in a row would otherwise lock you out.
const COOKIE_CACHE = join(tmpdir(), 'n8n-e2e-probe-cookie');
let cookie = '';
try {
	cookie = readFileSync(COOKIE_CACHE, 'utf8').trim();
} catch {
	/* no cached session yet */
}
async function api(path, opts = {}) {
	const res = await fetch(`${BASE}${path}`, {
		headers: {
			'Content-Type': 'application/json',
			'browser-id': 'probe',
			...(cookie ? { cookie } : {}),
		},
		...opts,
	});
	const sc = res.headers.getSetCookie?.() ?? [];
	if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
	const text = await res.text();
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

const [filter, ...flags] = process.argv.slice(2);
const showParams = flags.includes('--params');

async function ensureSession() {
	if (cookie) {
		const me = await api('/rest/login');
		if (me?.email) return;
	}
	const res = await api('/rest/login', {
		method: 'POST',
		body: JSON.stringify({ emailOrLdapLoginId: OWNER.email, password: OWNER.password }),
	});
	if (typeof res === 'string' && res.includes('Too many requests')) {
		console.error('n8n is rate-limiting logins. Wait a minute and retry.');
		process.exit(1);
	}
	try {
		writeFileSync(COOKIE_CACHE, cookie, { mode: 0o600 });
	} catch {
		/* cache is best-effort */
	}
}

await ensureSession();

const types = await api('/types/nodes.json');
if (!Array.isArray(types)) {
	console.error('Could not read node types. Is the stack up (E2E_KEEP=1 pnpm test:e2e)?');
	process.exit(1);
}

const matches = types.filter((t) => !filter || String(t.name).includes(filter));
if (!filter) {
	console.log(`${types.length} node types loaded. Pass a substring to inspect one, e.g.:`);
	for (const t of matches.filter((t) => t.name.startsWith('n8n-nodes-couchbase.'))) {
		console.log(`  ${t.name}`);
	}
	process.exit(0);
}

for (const t of matches) {
	console.log(`\n=== ${t.name} (typeVersion ${JSON.stringify(t.version)})`);
	console.log(`  inputs : ${JSON.stringify(t.inputs)}`);
	console.log(`  outputs: ${JSON.stringify(t.outputs)}`);
	console.log(`  creds  : ${JSON.stringify(t.credentials ?? [])}`);
	if (!showParams) {
		console.log(`  params : ${(t.properties ?? []).map((p) => p.name).join(', ')}`);
		console.log('  (pass --params for full parameter detail)');
		continue;
	}
	for (const p of t.properties ?? []) {
		console.log(`  - ${p.name} (${p.type}) default=${JSON.stringify(p.default)}`);
		if (p.displayOptions?.show) console.log(`      shown when ${JSON.stringify(p.displayOptions.show)}`);
		if (Array.isArray(p.options) && p.type === 'options') {
			console.log(`      values: ${p.options.map((o) => o.value).join(', ')}`);
		}
	}
}
