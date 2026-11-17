// Token Radar — the entrypoint.
//
// Reads the sealed protocol snapshot, ranks the pre-token protocols by the
// model's implied value, and writes everything the grade reads:
//
//   <out>/board.json     the ranked board (rows 1..n, watchlist covered)
//   <out>/data.js        window.RADAR, the dashboard's whole dataset
//   <out>/dashboard/     a copy of this repository's dashboard/
//   <out>/screenshots/   a copy of this repository's screenshots/
//   <out>/dossier.json   buildDossier of the output directory
//
// Run it from the repository root:
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// In the grader the snapshot is /input/snapshot.json and the output is
// /output. The run is deterministic: the same snapshot always writes the
// same bytes, so the entry's two graded runs agree byte for byte.

import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, MODEL, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** Where the snapshot lives when no --input is given (the grader's path). */
const DEFAULT_INPUT = '/input/snapshot.json';
/** Where the output goes when MAKEFUN_OUTPUT_DIR is not set (the grader's path). */
const DEFAULT_OUTPUT = '/output';
/** The dossier's text cap the gate compares against, in UTF-8 bytes. */
const DOSSIER_TEXT_MAX_BYTES = 65536;

/** The repository root: the directory this file lives in. */
const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

/** Fail loudly with a message on stderr and a non-zero exit. */
function fail(message: string): never {
  console.error(`token-radar: ${message}`);
  process.exit(1);
}

/** The value of a `--flag value` argument, or null when the flag is absent. */
function flagValue(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag);
  if (at === -1 || at + 1 >= argv.length) return null;
  return argv[at + 1]!;
}

/** The snapshot's path: --input, then MAKEFUN_INPUT_DIR, then the default. */
function inputPath(argv: string[]): string {
  const given = flagValue(argv, '--input') ?? process.env.MAKEFUN_INPUT_DIR ?? DEFAULT_INPUT;
  // A directory means its snapshot.json; a file is read as-is.
  if (existsSync(given) && statSync(given).isDirectory()) return join(given, 'snapshot.json');
  return given;
}

/** The output directory: --output, then MAKEFUN_OUTPUT_DIR, then the default. */
function outputDir(argv: string[]): string {
  return flagValue(argv, '--output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? DEFAULT_OUTPUT;
}

/** Read the snapshot file and parse it, or fail with the reason. */
function readSnapshot(path: string) {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    fail(`cannot read the snapshot at ${path}`);
  }
  try {
    return parseSnapshot(text!);
  } catch (err) {
    fail(`the snapshot at ${path} is not one the model scores: ${(err as Error).message}`);
  }
}

/** Copy a directory from the repository into the output, replacing any copy there. */
function copyTree(name: string, out: string): void {
  const from = join(REPO_ROOT, name);
  const to = join(out, name);
  if (!existsSync(from) || !statSync(from).isDirectory()) fail(`the repository has no ${name}/ directory to copy`);
  cpSync(from, to, { recursive: true });
}

function main(): void {
  const argv = process.argv.slice(2);
  const input = inputPath(argv);
  const out = outputDir(argv);

  const snapshot = readSnapshot(input);
  const { board, radar } = buildRadar(snapshot, MODEL);

  const issue = boardIssue(board, snapshot);
  if (issue !== null) fail(`the board is not one the gate will take: ${issue}`);

  mkdirSync(out, { recursive: true });

  const boardDoc = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: radar.model_version,
    board_size: board.length,
    watchlist_size: snapshot.watchlist.length,
    rows: board,
  };
  writeFileSync(join(out, 'board.json'), `${JSON.stringify(boardDoc, null, 2)}\n`, 'utf8');
  writeFileSync(join(out, 'data.js'), dataScript(radar), 'utf8');

  copyTree('dashboard', out);
  copyTree('screenshots', out);

  const dossier = buildDossier(out, { text_max_bytes: DOSSIER_TEXT_MAX_BYTES });
  writeFileSync(join(out, 'dossier.json'), dossier);

  console.log(
    `token-radar: ${board.length} rows (${snapshot.watchlist.length} watchlist, ` +
      `${radar.early_size} early, ${radar.live_size} live) from ${snapshot.as_of} -> ${out}`,
  );
}

main();
