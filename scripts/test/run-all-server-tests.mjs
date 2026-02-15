import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const serverDir = path.resolve(rootDir, 'apps', 'server');

async function collectTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectTestFiles(fullPath);
      files.push(...nested);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function runSingleTest(testFile) {
  return new Promise((resolve) => {
    const relative = path.relative(rootDir, testFile);
    console.log(`\n==> Running ${relative}`);
    const command = `npx tsx "${relative}"`;
    const child = spawn(command, {
      stdio: 'inherit',
      shell: true,
    });

    child.on('exit', (code, signal) => {
      if (signal) {
        resolve({ ok: false, code: 1, file: relative });
        return;
      }
      resolve({ ok: code === 0, code: code ?? 1, file: relative });
    });
  });
}

async function main() {
  const tests = (await collectTestFiles(serverDir)).sort((a, b) => a.localeCompare(b));
  if (tests.length === 0) {
    console.log('No server test files found under apps/server.');
    return;
  }

  for (const testFile of tests) {
    const result = await runSingleTest(testFile);
    if (!result.ok) {
      console.error(`\nTest failed: ${result.file}`);
      process.exit(result.code);
    }
  }

  console.log(`\nAll server tests passed (${tests.length} files).`);
}

main().catch((error) => {
  console.error('Failed to execute server tests:', error);
  process.exit(1);
});
