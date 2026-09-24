// Runs every supabase/tests/*.sql file, in name order, against the linked (hosted)
// Supabase project with `npx supabase db query --linked -f`. No Docker needed.
//
// Each test file wraps its work in BEGIN ... ROLLBACK and raises
// 'TC-xx failed: <reason>' (or 'DB-xx failed: ...') when a check fails.
// The first failing file stops the run with exit code 1.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const testsDir = join('supabase', 'tests');
const files = readdirSync(testsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error(`No .sql files in ${testsDir}`);
  process.exit(1);
}

for (const name of files) {
  const file = join(testsDir, name);
  // One command string through the shell, so npx (a .cmd file on Windows) works everywhere.
  const run = spawnSync(`npx supabase db query --linked -f "${file}"`, {
    encoding: 'utf8',
    shell: true,
  });
  const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;

  if (run.status !== 0) {
    const details = unwrapError(output);
    // Postgres error text looks like: "ERROR:  P0001: TC-18 failed: ...\nCONTEXT: ..."
    const match = details.match(/ERROR:\s+(?:[0-9A-Z]{5}:\s+)?([^\n]+)/);
    console.error(`FAIL  ${name}`);
    console.error(`      ${match ? match[1] : 'see details below'}`);
    console.error(`\n${details.trim()}`);
    process.exit(1);
  }

  console.log(`ok    ${name}  ${resultLines(run.stdout).join('; ')}`);
}

console.log(`\nAll ${files.length} test files passed.`);

// The CLI wraps the Postgres error in JSON twice ({"message":"... {\"message\":\"ERROR: ...\"}"}).
// Unwrap the "message" fields until plain text is left.
function unwrapError(output) {
  let text = output;
  for (let depth = 0; depth < 3; depth++) {
    const match = text.match(/"message":"((?:[^"\\]|\\.)*)"/);
    if (!match) break;
    try {
      text = JSON.parse(`"${match[1]}"`);
    } catch {
      break;
    }
  }
  return text;
}

// The CLI prints the last statement's rows as JSON: { "rows": [{ "result": "..." }], ... }
function resultLines(stdout) {
  try {
    const json = JSON.parse(stdout.slice(stdout.indexOf('{')));
    return (json.rows ?? []).map((row) => row.result).filter(Boolean);
  } catch {
    return [];
  }
}
