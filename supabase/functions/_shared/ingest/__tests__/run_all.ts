import { runRulesTests } from './rules.ts';
import { runAdapterTests } from './adapters.ts';
import { runIntegrationTests } from './integration.ts';

let failures = 0;
try {
  runRulesTests();
} catch (err) {
  failures += 1;
  console.error('FAIL rules:', err);
}
try {
  runAdapterTests();
} catch (err) {
  failures += 1;
  console.error('FAIL adapters:', err);
}
try {
  await runIntegrationTests();
} catch (err) {
  failures += 1;
  console.error('FAIL integration:', err);
}

if (failures > 0) {
  console.error(`FAILED: ${failures} test group(s)`);
  Deno.exit(1);
}
console.log('ok  all tests');
