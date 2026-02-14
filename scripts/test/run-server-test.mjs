import { spawn } from 'node:child_process';
import path from 'node:path';

const target = process.argv[2];

if (!target) {
  console.error('Usage: npm run test:server:file -- <path-to-test.ts>');
  process.exit(1);
}

const normalized = path.normalize(target);
const command = `npx tsx "${normalized}"`;
const child = spawn(command, {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Test process terminated by signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
