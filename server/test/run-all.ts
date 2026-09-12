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
import './trade-finance-service.test';
import './reasoning-phase55.test';
import './daily-dashboard.test';

// Login & Session Security upgrade — see docs/security/. Order matters here: fixtures.ts's
// test must run first (it starts the shared Express app and logs in the three role fixtures
// other files reuse), and session.test.ts must run LAST (its revoke-all test intentionally
// revokes every other session for a fixture user, which would break any later file still
// expecting that fixture to be alive).
import './security/fixtures';
import './security/login.test';
import './security/rbac-tenant-isolation.test';
import './security/csrf.test';
import './security/security-headers.test';
import './security/virtual-rm-auth.test';
import './security/audit-log.test';
import './security/session.test';

import { runAll } from './test-runner';

runAll();
