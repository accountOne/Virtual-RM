/** Entry point for `npm run test:interaction` — imports every *.test.ts file (which register
 * their cases as a side effect via describe/test from ./test-runner), then runs them all and
 * exits non-zero if anything failed. Mirrors server/test/run-all.ts's structure.
 *
 * `message-builder.test.ts` transitively imports `rm-data.service.ts`, which imports
 * `HttpClient` from `@angular/common/http` — a partially-AOT-compiled package whose
 * `@Injectable` static initializer needs the JIT compiler as a fallback outside a real Angular
 * app. Loading `@angular/compiler` first (same fix Angular's own docs give for JIT-in-Node) is
 * enough; nothing in these tests calls Angular's compiler-cli or bootstraps a real component. */
import '@angular/compiler';

import './message-builder.test';
import './timing.test';
import './state.test';
import './context.test';

import { runAll } from './test-runner';

runAll();
