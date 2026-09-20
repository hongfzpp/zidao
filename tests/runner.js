/* Tiny zero-dependency test runner. Runs in the browser because this project
   has no node toolchain. Collects results into window.__testResults so they can
   be read programmatically as well as rendered. */

const suites = [];
let current = null;

export function describe (name, fn) {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

export function it (name, fn) {
  if (!current) throw new Error('it() outside describe()');
  current.tests.push({ name, fn });
}

class AssertionError extends Error {}

const show = v => {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v instanceof Set) return `Set(${[...v].join(',')})`;
  try { return JSON.stringify(v); } catch { return String(v); }
};

export function expect (actual) {
  const api = {
    toBe (want) {
      if (!Object.is(actual, want))
        throw new AssertionError(`expected ${show(want)}, got ${show(actual)}`);
    },
    toEqual (want) {
      const a = JSON.stringify(actual), b = JSON.stringify(want);
      if (a !== b) throw new AssertionError(`expected ${b}, got ${a}`);
    },
    toBeTruthy () {
      if (!actual) throw new AssertionError(`expected truthy, got ${show(actual)}`);
    },
    toBeFalsy () {
      if (actual) throw new AssertionError(`expected falsy, got ${show(actual)}`);
    },
    toContain (item) {
      const ok = typeof actual === 'string'
        ? actual.includes(item)
        : Array.from(actual || []).includes(item);
      if (!ok) throw new AssertionError(`expected ${show(actual)} to contain ${show(item)}`);
    },
    notToContain (item) {
      const ok = typeof actual === 'string'
        ? actual.includes(item)
        : Array.from(actual || []).includes(item);
      if (ok) throw new AssertionError(`expected ${show(actual)} NOT to contain ${show(item)}`);
    },
    toHaveLength (n) {
      if ((actual?.length ?? -1) !== n)
        throw new AssertionError(`expected length ${n}, got ${actual?.length}`);
    },
    toBeGreaterThan (n) {
      if (!(actual > n)) throw new AssertionError(`expected ${show(actual)} > ${n}`);
    },
    toBeLessThan (n) {
      if (!(actual < n)) throw new AssertionError(`expected ${show(actual)} < ${n}`);
    },
    toBeLessThanOrEqual (n) {
      if (!(actual <= n)) throw new AssertionError(`expected ${show(actual)} <= ${n}`);
    },
    toBeGreaterThanOrEqual (n) {
      if (!(actual >= n)) throw new AssertionError(`expected ${show(actual)} >= ${n}`);
    }
  };
  return api;
}

export async function runAll ({ onProgress } = {}) {
  const results = { passed: 0, failed: 0, suites: [], failures: [] };

  for (const suite of suites) {
    const sres = { name: suite.name, tests: [] };
    for (const t of suite.tests) {
      const t0 = performance.now();
      try {
        await t.fn();
        sres.tests.push({ name: t.name, ok: true, ms: performance.now() - t0 });
        results.passed++;
      } catch (err) {
        sres.tests.push({ name: t.name, ok: false, error: err.message, ms: performance.now() - t0 });
        results.failures.push(`${suite.name} › ${t.name}\n    ${err.message}`);
        results.failed++;
      }
      onProgress?.(results);
    }
    results.suites.push(sres);
  }

  results.total = results.passed + results.failed;
  results.ok = results.failed === 0;
  results.slowest = results.suites
    .flatMap(s => s.tests.map(t => ({ name: `${s.name} › ${t.name}`, ms: Math.round(t.ms || 0) })))
    .sort((a, b) => b.ms - a.ms).slice(0, 12);
  window.__testResults = results;
  return results;
}

export function render (results, host) {
  const pct = results.total ? Math.round((results.passed / results.total) * 100) : 0;
  host.innerHTML =
    `<div class="summary ${results.ok ? 'ok' : 'bad'}">` +
    `${results.passed} / ${results.total} passed (${pct}%)` +
    (results.failed ? ` — <b>${results.failed} FAILED</b>` : ' — all green') +
    `</div>` +
    results.suites.map(s => {
      const bad = s.tests.filter(t => !t.ok).length;
      return `<section class="${bad ? 'bad' : 'ok'}">` +
        `<h3>${bad ? '✗' : '✓'} ${s.name} <span>${s.tests.length - bad}/${s.tests.length}</span></h3>` +
        s.tests.map(t => `<div class="t ${t.ok ? 'ok' : 'bad'}">${t.ok ? '✓' : '✗'} ${t.name}` +
          (t.ok ? '' : `<pre>${t.error}</pre>`) + `</div>`).join('') +
        `</section>`;
    }).join('');
}
