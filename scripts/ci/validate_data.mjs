// Validate the static site's data files against their JSON schemas.
//
//   cd <repo root> && npm i ajv --no-save && node scripts/ci/validate_data.mjs
//
// Used by .github/workflows/validate-json.yml. ajv is installed by the caller,
// so this script needs no package.json of its own.
//
// strict:false on purpose: ajv v8 refuses to compile an unknown `format` in
// strict mode, and the export schemas declare `format: uri` for fields that are
// legitimately "" in the data. Structural validation is what this gate is for.
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

const ROOT = process.cwd();

// Only files that actually exist and are non-empty are validated; the two
// events files are placeholders in this repository.
const TARGETS = [
  { file: 'data/activities.json', schema: 'data/activity.schema.json' },
  { file: 'data/events_kids.json', schema: 'data/event.schema.json' },
  { file: 'data/events_taoyuan_kids.json', schema: 'data/event.schema.json' },
];

let failed = 0;
for (const { file, schema } of TARGETS) {
  const dataPath = path.join(ROOT, file);
  const schemaPath = path.join(ROOT, schema);
  if (!fs.existsSync(dataPath)) {
    console.log(`${file}: absent, skipped`);
    continue;
  }
  const raw = fs.readFileSync(dataPath, 'utf8').trim();
  if (raw === '' || raw === '[]') {
    console.log(`${file}: empty, skipped`);
    continue;
  }
  const records = JSON.parse(raw);
  if (!Array.isArray(records)) {
    console.error(`${file}: expected a JSON array`);
    failed += 1;
    continue;
  }
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, 'utf8')));
  let invalid = 0;
  records.forEach((record, index) => {
    if (!validate(record)) {
      invalid += 1;
      console.error(
        `${file}[${index}] (${record?.id ?? record?.name ?? '?'}) invalid: ` +
          ajv.errorsText(validate.errors),
      );
    }
  });
  console.log(`${file}: ${records.length} record(s), ${invalid} invalid (schema ${schema})`);
  if (invalid > 0) failed += 1;
}

if (failed > 0) {
  console.error(`validate_data: ${failed} file(s) failed`);
  process.exit(1);
}
console.log('validate_data: all good');
