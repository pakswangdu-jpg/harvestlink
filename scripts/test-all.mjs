import { spawn } from 'node:child_process';

const commands = [
  {
    label: 'Frontend Node tests',
    command: process.execPath,
    args: ['--experimental-vm-modules', '--test', 'tests/*.test.mjs'],
    cwd: process.cwd(),
  },
  {
    label: 'Backend Node tests',
    command: process.execPath,
    args: ['--experimental-test-module-mocks', '--test', 'tests/*.test.js'],
    cwd: `${process.cwd()}\\backend`,
  },
  {
    label: 'Dedicated Vitest suite',
    command: process.execPath,
    args: ['node_modules/vitest/vitest.mjs', 'run'],
    cwd: process.cwd(),
  },
];

let failed = false;

for (const item of commands) {
  console.log(`\n[HarvestLink] Running ${item.label}...\n`);
  const exitCode = await new Promise((resolve) => {
    const child = spawn(item.command, item.args, { stdio: 'inherit', shell: false, cwd: item.cwd });
    child.on('close', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    failed = true;
    console.error(`[HarvestLink] ${item.label} FAILED (exit ${exitCode}).`);
  } else {
    console.log(`[HarvestLink] ${item.label} PASSED.`);
  }
}

console.log(`\n[HarvestLink] test:all ${failed ? 'FAILED' : 'PASSED'}.`);
process.exit(failed ? 1 : 0);
