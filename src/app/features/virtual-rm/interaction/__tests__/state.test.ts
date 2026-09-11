import { RmStateService } from '../rm-state.service';
import { assertEqual, describe, test } from './test-runner';

describe('rm-state.service — RmStateService', () => {
  test('starts in IDLE', () => {
    const state = new RmStateService();
    assertEqual(state.state(), 'IDLE');
  });

  test('set() transitions the state signal', () => {
    const state = new RmStateService();
    state.set('PROCESSING');
    assertEqual(state.state(), 'PROCESSING');
    state.set('RESPONDING');
    assertEqual(state.state(), 'RESPONDING');
  });

  test('is() matches the current state against one or more candidates', () => {
    const state = new RmStateService();
    state.set('ANALYZING');
    assertEqual(state.is('ANALYZING'), true);
    assertEqual(state.is('PROCESSING', 'ANALYZING', 'RESPONDING'), true);
    assertEqual(state.is('IDLE', 'SUCCESS'), false);
  });
});
