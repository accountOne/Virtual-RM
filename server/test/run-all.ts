/** Entry point for `npm test` (server/package.json) — imports every *.test.ts file (which
 * register their cases as a side effect via describe/test from ./test-runner), then runs
 * them all and exits non-zero if anything failed. */
import './intents.test';
import './entities.test';
import './synonyms.test';
import './dates.test';
import './amounts.test';
import './statuses.test';
import './query-execution.test';
import './navigation.test';
import './cross-domain.test';
import './model-router.test';
import './tools.test';
import './calculation-engine.test';
import './reasoning-engine.test';
import './conversation-context.test';
import './security-isolation.test';

import { runAll } from './test-runner';

runAll();
