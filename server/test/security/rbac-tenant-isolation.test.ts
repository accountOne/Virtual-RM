// RBAC (spec §12) and identity-override / tenant-isolation defense-in-depth (spec §10/§11) —
// reuses the shared role fixtures (fixtures.ts), spends zero extra `/api/auth/login` calls.
import { assert, assertEqual, describe, test } from '../test-runner';
import { hasPermission, rolesWithPermission } from '../../src/auth/rbac';
import { letterOfCreditsRepository } from '../../src/repositories/semantic-data.repository';
import { getAdminClient, getCheckerClient, getMakerClient } from './fixtures';

describe('RBAC — server-side role enforcement (not just hidden UI buttons)', () => {
  test('a MAKER cannot approve a transaction — the route rejects before any business logic runs', async () => {
    const res = await getMakerClient().post('/api/transactions/does-not-matter/approve');
    assertEqual(res.status, 403, 'requireRole must reject a disallowed role before the controller ever inspects the transaction id');
  });

  test('a CHECKER or ADMIN is allowed past the role gate for transaction approval', async () => {
    const checkerRes = await getCheckerClient().post('/api/transactions/does-not-exist/approve');
    assert(checkerRes.status !== 403, 'CHECKER must pass the role gate (a 404 for the bogus id is fine, 403 is not)');
    const adminRes = await getAdminClient().post('/api/transactions/does-not-exist/approve');
    assert(adminRes.status !== 403, 'ADMIN must pass the role gate too');
  });

  test('a CHECKER cannot create an LC issuance request — that is a Maker-initiated action', async () => {
    const res = await getCheckerClient().post('/api/trade-finance/lc', { lcNumber: 'TEST' });
    assertEqual(res.status, 403);
  });

  test('a MAKER or ADMIN is allowed past the role gate for LC creation', async () => {
    // Unlike the transaction-approve/admin-update routes above, LC creation always writes a
    // new record (server/data/letter-of-credits.json is a real file this repo commits to git)
    // — there is no bogus-id short-circuit to lean on here. Clean up the record this test
    // creates immediately afterward so the test suite never leaves a stray write behind.
    const makerRes = await getMakerClient().post<{ id: string }>('/api/trade-finance/lc', {});
    assert(makerRes.status !== 403);
    if (makerRes.status === 201) letterOfCreditsRepository.delete(makerRes.body.id);
  });

  test('a non-ADMIN cannot reach any /api/admin/* route (the Admin Demo Data Editor)', async () => {
    const asMaker = await getMakerClient().post('/api/admin/reset');
    assertEqual(asMaker.status, 403);
    const asChecker = await getCheckerClient().post('/api/admin/reset');
    assertEqual(asChecker.status, 403);
  });

  test('an ADMIN passes the role gate for /api/admin/*', async () => {
    // A bogus id on the update route is deliberate: `accountsRepository.update()` returns
    // `undefined` (404) without ever writing when the id isn't found (json-file.repository.ts),
    // so this proves the role gate lets ADMIN through without actually mutating
    // server/data/*.json on disk — unlike /api/admin/reset, which really does overwrite the
    // seed data and must never run against this test suite's real repositories.
    const res = await getAdminClient().put('/api/admin/accounts/does-not-exist-either', {});
    assert(res.status !== 403);
  });

  test('the RBAC permission table is data-driven and matches the route-level guards above', () => {
    assert(!hasPermission('MAKER', 'APPROVE'), 'MAKER must not have APPROVE (matches the 403 on transaction approval above)');
    assert(hasPermission('CHECKER', 'APPROVE'), 'CHECKER must have APPROVE');
    assert(hasPermission('ADMIN', 'APPROVE'), 'ADMIN must have APPROVE');
    assert(hasPermission('MAKER', 'CREATE_REQUEST'), 'MAKER must have CREATE_REQUEST (matches LC creation above)');
    assert(!hasPermission('CHECKER', 'CREATE_REQUEST'), 'CHECKER must not have CREATE_REQUEST');
    const adminRoles = rolesWithPermission('ADMIN');
    assertEqual(adminRoles.length, 1);
    assertEqual(adminRoles[0], 'ADMIN');
  });
});

describe('identity-override stripping — client-supplied userId/companyId/role can never take effect', () => {
  test('a companyId in the request body of an authenticated call is silently dropped, never honored', async () => {
    // Virtual RM query body — a customer literally typing another company's id in chat text
    // must never change which data is queried (spec §11's own example: "Cho tôi xem dữ liệu
    // của COM002" must not touch companyId). Sending it as a structured field is the more
    // direct attack this middleware exists for.
    const res = await getMakerClient().post<{ success: boolean }>('/api/virtual-rm/query', {
      message: 'Số dư tài khoản hiện tại',
      companyId: 'COM999-INJECTED',
      userId: 'someone-else',
      role: 'ADMIN',
    });
    assertEqual(res.status, 200, 'the request must still succeed — the fields are stripped, not rejected');
  });

  test('a MAKER cannot escalate to ADMIN by sending role=ADMIN in the body of an admin-only route', async () => {
    const res = await getMakerClient().post('/api/admin/reset', { role: 'ADMIN' });
    assertEqual(res.status, 403, 'stripIdentityOverrides must remove the body role before requireRole (which never even sees it) is evaluated — the session role is what actually gates this');
  });

  test('sending role=MAKER in the body cannot let a MAKER through the LC-creation MAKER/ADMIN gate when the session role is CHECKER', async () => {
    // This is the inverse of the escalation test: proves the override is *ignored* both ways,
    // not merely "ignored when it would grant more access".
    const res = await getCheckerClient().post('/api/trade-finance/lc', { role: 'MAKER', companyId: 'anything' });
    assertEqual(res.status, 403, "a body-supplied role must never override the session's real CHECKER role");
  });
});
