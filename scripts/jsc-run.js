/* Headless CLI runner for the pure tests, using the JavaScriptCore shell that
   ships with macOS. No node, no install, no browser: runs in milliseconds.

   Covers everything that does not need a DOM -- js/core/* and the content
   files. The E2E suite needs a real browser and runs separately
   (scripts/e2e-headless.sh).

   Invoked by scripts/test.sh from the project root. */

globalThis.window = globalThis;
globalThis.console = globalThis.console || { log: print, warn: print, error: print };

// `fetch` shim over jsc's readFile. Paths in the tests are written relative to
// tests/index.html, i.e. "../data/x" means "<root>/data/x".
globalThis.fetch = async (url) => {
  const path = String(url).replace(/^(\.\.\/|\.\/)+/, '');
  const text = readFile(path);
  return {
    ok: true,
    status: 200,
    text: async () => text,
    json: async () => JSON.parse(text)
  };
};

const { runAll } = await import('../tests/runner.js');

await import('../tests/unit/pacing.test.js');
await import('../tests/unit/hand.test.js');
await import('../tests/unit/rules.test.js');
await import('../tests/unit/layout.test.js');
await import('../tests/unit/memory.test.js');
await import('../tests/unit/distractors.test.js');
await import('../tests/unit/stories.test.js');
await import('../tests/unit/speechmatch.test.js');
await import('../tests/unit/data.test.js');

const results = await runAll();

const E = String.fromCharCode(27);
const RESET = E + '[0m', RED = E + '[31m', GREEN = E + '[32m', DIM = E + '[2m';

for (const suite of results.suites) {
  const bad = suite.tests.filter(t => !t.ok).length;
  print((bad ? RED + 'x' : GREEN + 'ok') + ' ' + suite.name + RESET +
        ' ' + DIM + (suite.tests.length - bad) + '/' + suite.tests.length + RESET);
  for (const t of suite.tests) {
    if (!t.ok) print('    ' + RED + 'x ' + t.name + RESET + '\n      ' + t.error);
  }
}
print('');
print(results.ok
  ? GREEN + results.passed + '/' + results.total + ' passed' + RESET
  : RED + results.failed + ' FAILED' + RESET + ' (' + results.passed + '/' + results.total + ' passed)');

if (!results.ok) throw new Error('tests failed');
