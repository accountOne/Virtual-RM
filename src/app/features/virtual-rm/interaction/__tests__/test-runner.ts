/** Minimal, dependency-free test runner for the frontend RM Interaction Engine — same
 * philosophy as server/test/test-runner.ts (this is a demo; no jest/karma harness is worth
 * standing up just to run plain-function assertions), kept as a separate local copy since the
 * frontend and server are different TS projects/tsconfigs. */

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

  console.log(`\nRM Interaction Engine test suite — ${tests.length} tests\n`);
  for (const [suite, stats] of bySuite) {
    const total = stats.passed + stats.failed;
    console.log(`  ${suite}: ${stats.passed}/${total}`);
  }

  if (failures.length) {
    console.log(`\n${failures.length} failure(s):`);
    for (const f of failures) console.log(`  ✗ [${f.suite}] ${f.name}: ${f.error}`);
  }

  console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) process.exit(1);
}
