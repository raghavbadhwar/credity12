import { execSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';

const circuits = ['score_threshold', 'age_verification', 'cross_vertical_aggregate'];
const single = process.argv[2];
const proofPathArg = process.argv[3];
const publicPathArg = process.argv[4];
const selected = single ? [single] : circuits;

for (const circuit of selected) {
  const base = path.join(process.cwd(), 'artifacts', circuit);
  const vkey = path.join(base, 'verification_key.json');
  const publicOut = publicPathArg || path.join(base, 'public.json');
  const proofOut = proofPathArg || path.join(base, 'proof.json');

  if (!existsSync(vkey)) {
    throw new Error(`Missing verification key for ${circuit}: ${vkey}`);
  }
  if (!existsSync(publicOut)) {
    throw new Error(`Missing public signals for ${circuit}: ${publicOut}`);
  }
  if (!existsSync(proofOut)) {
    throw new Error(`Missing proof for ${circuit}: ${proofOut}`);
  }

  execSync(`snarkjs groth16 verify ${vkey} ${publicOut} ${proofOut}`, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${path.join(process.cwd(), 'node_modules', '.bin')}:${process.env.PATH || ''}`,
    },
  });
}
