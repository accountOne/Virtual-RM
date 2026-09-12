/** Minimal, dependency-free test runner — this is a demo, so no new test framework
 * dependency (jest/mocha/vitest) is introduced just to run assertions. */

interface TestCase {
  suite: string;
  name: string;
  fn: () => void | Promise<void>;
}

const tests: TestCase[] = [];
let currentSuite = '';

export function describe(suite: string, fn: () => void): void {
  const previous = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = previous;
}

/** `fn` may be async — Phase 5's reasoning-engine tests call through AIProvider.reason(),
 * which is async even for the built-in synchronous mock provider (the interface must support
 * a real, network-backed provider later). runAll() awaits every test either way. */
export function test(name: string, fn: () => void | Promise<void>): void {
  tests.push({ suite: currentSuite, name, fn });
}

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertGreaterOrEqual(actual: number, min: number, message?: string): void {
  if (!(actual >= min)) throw new Error(message ?? `expected ${actual} >= ${min}`);
}

export async function runAll(): Promise<void> {
  let passed = 0;
  let failed = 0;
  const failures: { suite: string; name: string; error: string }[] = [];
  const bySuite = new Map<string, { passed: number; failed: number }>();

  for (const t of tests) {
    const stats = bySuite.get(t.suite) ?? { passed: 0, failed: 0 };
    try {
      await t.fn();
      passed++;
      stats.passed++;
    } catch (e) {
      failed++;
      stats.failed++;
      failures.push({ suite: t.suite, name: t.name, error: (e as Error).message });
    }
    bySuite.set(t.suite, stats);
  }

  console.log(`\nSemantic engine test suite — ${tests.length} tests\n`);
  for (const [suite, stats] of bySuite) {
    const total = stats.passed + stats.failed;
    console.log(`  ${suite}: ${stats.passed}/${total}`);
  }

  if (failures.length) {
    console.log(`\n${failures.length} failure(s):`);
    for (const f of failures) console.log(`  ✗ [${f.suite}] ${f.name}: ${f.error}`);
  }

  console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total`);
  // Always exit explicitly, pass or fail — the security suite (test/security/test-server.ts)
  // keeps a real ephemeral http.Server listening for the whole run, which otherwise keeps the
  // event loop (and this process) alive forever on a clean, all-passing run.
  process.exit(failed > 0 ? 1 : 0);
}
