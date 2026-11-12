#!/usr/bin/env node
// Lo usa el plugin: corre un hook del proyecto (scripts/hooks/<nombre>.mjs) si el proyecto lo
// tiene, pasándole el mismo stdin y devolviendo su código de salida. Sin backlog-kit, no hace nada.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, readInput } from './common.mjs';

const name = process.argv[2];
const input = await readInput();
const root = projectRoot(input);
const file = root && name ? path.join(root, 'scripts', 'hooks', `${name}.mjs`) : null;
if (!file || !existsSync(file)) process.exit(0);
const r = spawnSync('node', [file], { input: JSON.stringify(input), encoding: 'utf8', cwd: root });
process.stdout.write(r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
process.exit(r.status ?? 0);
