// CLI entrypoint: `deno task ingest --source <id> | --all [--file <zip>] [--dry-run]`
// Docs: docs/ingestion.md §7. Runs against any Postgres with the migrations applied.
import { runSource, allSources } from './core.ts';
import { error } from './log.ts';

function usage(): never {
  console.error('Usage: deno task ingest --source <id> | --all [--file <zip>] [--dry-run]');
  console.error('  --source tw_tourism_attractions   ingest one source (live or --file fixture)');
  console.error('  --all                             every source, sequentially');
  console.error('  --source curated                  import data/activities.json + data/curated_links.json');
  console.error('  --file <zip>                      offline fixture instead of the network (TA sources)');
  console.error('  --dry-run                         fetch + normalise, print stats, no DB writes');
  Deno.exit(2);
}

function parseArgs(argv: string[]): { sources: string[]; file?: string; dryRun: boolean } {
  const out = { sources: [] as string[], file: undefined as string | undefined, dryRun: false };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--source') out.sources.push(argv[++i]);
    else if (a === '--all') out.sources = allSources();
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') usage();
    else usage();
    i++;
  }
  if (out.sources.length === 0) usage();
  if (out.file && out.sources.length !== 1) {
    console.error('--file requires exactly one --source');
    Deno.exit(2);
  }
  if (out.file && out.sources[0] === 'curated') {
    console.error('--file is not supported for curated (it always reads data/activities.json)');
    Deno.exit(2);
  }
  return out;
}

async function main() {
  const args = parseArgs(Deno.args);
  let exitCode = 0;

  for (const sourceId of args.sources) {
    let result;
    try {
      result = await runSource(sourceId, 'cli', {
        dryRun: args.dryRun, sourceFile: args.file,
      });
    } catch (err) {
      error(sourceId, null, 'start', `fatal: ${err}`, err);
      exitCode = 1;
      continue;
    }
    console.log(JSON.stringify({ source: sourceId, ...result }));
    if (result.status === 'failed') exitCode = 1;
  }
  Deno.exit(exitCode);
}

main().catch((err) => {
  error('cli', null, 'start', `fatal: ${err}`, err);
  Deno.exit(1);
});
