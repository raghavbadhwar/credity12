#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strict = process.env.LAUNCH_GATE_STRICT === '1';

const checks = [];

const exists = (rel) => fs.existsSync(path.join(root, rel));

function add(name, pass, detail, required = true) {
  checks.push({ name, pass, detail, required });
}

add('runbook: incident-response', exists('docs/runbooks/incident-response.md'), 'docs/runbooks/incident-response.md');
add('runbook: rollback', exists('docs/runbooks/rollback.md'), 'docs/runbooks/rollback.md');
add('gate doc: production launch', exists('docs/gates/production-launch-gate.md'), 'docs/gates/production-launch-gate.md');
add('compliance evidence template', exists('docs/compliance/launch-evidence-template.md'), 'docs/compliance/launch-evidence-template.md');

add('distributed rate limit store configured', !!process.env.REDIS_URL, 'REDIS_URL present', strict);
add('error tracking configured', !!(process.env.SENTRY_DSN || process.env.GATEWAY_SENTRY_DSN), 'SENTRY_DSN/GATEWAY_SENTRY_DSN present', strict);
add('jwt secrets configured', !!(process.env.JWT_SECRET && process.env.JWT_REFRESH_SECRET), 'JWT_SECRET + JWT_REFRESH_SECRET present', strict);

let failed = 0;
for (const c of checks) {
  const ok = c.pass || !c.required;
  if (!ok) failed += 1;
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${c.name} - ${c.detail}${c.required ? '' : ' (advisory)'}`);
}

if (failed > 0) {
  console.error(`\nLaunch gate failed (${failed} required checks).`);
  process.exit(1);
}

console.log('\nLaunch gate checks passed.');
