#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const PACKAGE_DEFS = {
  sharedAuth: { name: 'shared-auth', relPath: 'packages/shared-auth', bins: ['tsc'] },
  trustSdk: { name: 'trust-sdk', relPath: 'packages/trust-sdk', bins: ['tsc'] },
  wallet: { name: 'wallet', relPath: 'BlockWalletDigi', bins: ['tsc', 'tsx', 'vitest'] },
  issuer: { name: 'issuer', relPath: 'CredVerseIssuer 3', bins: ['tsc', 'tsx', 'vitest'] },
  recruiter: { name: 'recruiter', relPath: 'CredVerseRecruiter', bins: ['tsc', 'tsx', 'vitest'] },
  gateway: { name: 'gateway', relPath: 'credverse-gateway', bins: ['tsx'] },
  mobile: { name: 'mobile', relPath: 'apps/mobile', bins: ['tsc', 'vitest'] },
  contracts: { name: 'contracts', relPath: 'CredVerseIssuer 3/contracts', bins: ['hardhat', 'solhint'] },
};

const TARGETS = {
  check: {
    packages: ['sharedAuth', 'trustSdk', 'wallet', 'issuer', 'recruiter'],
  },
  test: {
    packages: ['sharedAuth', 'trustSdk', 'wallet', 'issuer', 'recruiter', 'gateway', 'mobile', 'contracts'],
  },
  foundationLocal: {
    packages: ['sharedAuth', 'trustSdk', 'wallet', 'issuer', 'recruiter', 'gateway'],
    builds: [
      {
        name: 'shared-auth',
        relPath: 'packages/shared-auth',
        script: 'build',
        artifact: 'packages/shared-auth/dist/index.js',
      },
      {
        name: 'trust-sdk',
        relPath: 'packages/trust-sdk',
        script: 'build',
        artifact: 'packages/trust-sdk/dist/index.js',
      },
    ],
  },
  walletShared: {
    packages: ['sharedAuth', 'trustSdk'],
  },
  recruiterShared: {
    packages: ['sharedAuth', 'trustSdk'],
  },
  mobileShared: {
    packages: ['sharedAuth'],
  },
};

function binExists(packageDir, binName) {
  const binDir = path.join(packageDir, 'node_modules', '.bin');
  const candidates = process.platform === 'win32' ? [`${binName}.cmd`, `${binName}.exe`, binName] : [binName];
  return candidates.some((candidate) => fs.existsSync(path.join(binDir, candidate)));
}

function needsInstall(packageDir, requiredBins) {
  if (!fs.existsSync(path.join(packageDir, 'node_modules'))) {
    return true;
  }
  return requiredBins.some((binName) => !binExists(packageDir, binName));
}

function runNpm(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCmd, args, {
      cwd,
      env: { ...process.env },
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm ${args.join(' ')} failed in ${cwd} (code ${code})`));
      }
    });
    child.on('error', reject);
  });
}

async function ensurePackage(def, log) {
  const packageDir = path.join(repoRoot, def.relPath);
  const installRequired = needsInstall(packageDir, def.bins);
  if (!installRequired) {
    return false;
  }

  const installCmd = fs.existsSync(path.join(packageDir, 'package-lock.json')) ? 'ci' : 'install';
  log(`[bootstrap] installing deps for ${def.name} (${installCmd})...`);
  await runNpm(packageDir, [installCmd, '--no-audit', '--no-fund']);
  return true;
}

async function ensureBuilds(builds = [], log = console.log) {
  for (const build of builds) {
    const artifactPath = build.artifact ? path.join(repoRoot, build.artifact) : null;
    if (artifactPath && fs.existsSync(artifactPath)) {
      continue;
    }
    log(`[bootstrap] building ${build.name}...`);
    await runNpm(path.join(repoRoot, build.relPath), ['run', build.script]);
  }
}

export async function ensureBootstrapTarget(targetName, log = console.log) {
  const target = TARGETS[targetName];
  if (!target) {
    throw new Error(`Unknown bootstrap target "${targetName}". Available: ${Object.keys(TARGETS).join(', ')}`);
  }

  let installedCount = 0;
  for (const packageKey of target.packages) {
    const def = PACKAGE_DEFS[packageKey];
    if (!def) {
      throw new Error(`Unknown package key "${packageKey}" in target "${targetName}"`);
    }
    if (await ensurePackage(def, log)) {
      installedCount += 1;
    }
  }

  await ensureBuilds(target.builds, log);
  log(`[bootstrap] ${targetName}: ${installedCount === 0 ? 'deps already satisfied' : `installed ${installedCount} package(s)`}`);
}

async function main() {
  const targetName = process.argv[2];
  if (!targetName) {
    process.stderr.write(`Usage: node scripts/bootstrap-deps.mjs <target>\nTargets: ${Object.keys(TARGETS).join(', ')}\n`);
    process.exit(1);
  }
  await ensureBootstrapTarget(targetName);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
