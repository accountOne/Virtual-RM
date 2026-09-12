// Virtual RM must run entirely inside the caller's authenticated SecurityContext (spec §13/§14)
// — never a self-asserted identity, and never a tool outside the whitelist.
import { assert, assertEqual, describe, test } from '../test-runner';
import { assertToolAllowed, ToolNotAuthorizedError, TOOL_SECURITY_REGISTRY } from '../../src/tools/tool-security';
import { toolRegistry } from '../../src/tools';
import { TestClient } from './http-client';
import { getMakerClient } from './fixtures';

describe('Virtual RM — session-bound access, no self-asserted identity', () => {
  test('POST /api/virtual-rm/query requires a valid session — an anonymous caller gets 401, not a default identity', async () => {
    const anonymous = new TestClient();
    const res = await anonymous.post('/api/virtual-rm/query', { message: 'Số dư tài khoản hiện tại' });
    assertEqual(res.status, 401);
  });

  test('a well-formed, authenticated query succeeds using the session identity (never one from the body)', async () => {
    const res = await getMakerClient().post<{ success: boolean }>('/api/virtual-rm/query', { message: 'Số dư tài khoản hiện tại' });
    assertEqual(res.status, 200);
    assertEqual(res.body.success, true);
  });

  test('a query with no message text is rejected with 400, not silently answered', async () => {
    const res = await getMakerClient().post<{ success: boolean }>('/api/virtual-rm/query', { message: '' });
    assertEqual(res.status, 400);
    assertEqual(res.body.success, false);
  });
});

describe('AI tool layer — fail-closed whitelist (spec §14: "AI không được gọi tool ngoài whitelist")', () => {
  test('every tool in the actual tool registry has a registered SecureToolDefinition — none can be called unclassified', () => {
    for (const name of Object.keys(toolRegistry)) {
      assert(!!TOOL_SECURITY_REGISTRY[name], `tool "${name}" is in toolRegistry but has no SecureToolDefinition`);
    }
  });

  test('a completely unregistered tool name is refused outright, regardless of role', () => {
    let threw = false;
    try {
      assertToolAllowed('delete_everything_tool_that_does_not_exist', 'ADMIN');
    } catch (e) {
      threw = e instanceof ToolNotAuthorizedError;
    }
    assert(threw, 'an unregistered tool must fail closed even for ADMIN');
  });

  test('a registered read-only tool is allowed for any of the three roles', () => {
    const [anyToolName] = Object.keys(toolRegistry);
    assert(!!anyToolName, 'expected at least one tool in the registry');
    assertToolAllowed(anyToolName, 'MAKER');
    assertToolAllowed(anyToolName, 'CHECKER');
    assertToolAllowed(anyToolName, 'ADMIN');
  });

  test('a tool call with no role at all is refused', () => {
    const [anyToolName] = Object.keys(toolRegistry);
    let threw = false;
    try {
      assertToolAllowed(anyToolName, undefined);
    } catch (e) {
      threw = e instanceof ToolNotAuthorizedError;
    }
    assert(threw, 'a missing role must fail closed, not default to allowed');
  });

  test('every currently registered tool is read-only, low-risk (READ) — matches this repo\'s AI layer having no mutating tool yet', () => {
    for (const def of Object.values(TOOL_SECURITY_REGISTRY)) {
      assertEqual(def.riskLevel, 'READ');
      assertEqual(def.readOnly, true);
      assertEqual(def.requiresAuthorization, false);
    }
  });
});
