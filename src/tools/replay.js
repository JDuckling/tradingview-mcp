import { z } from 'zod';
import * as core from '../core/replay.js';
import { wrapOk } from './_wrap.js';

export function registerReplayTools(server) {
  server.tool('replay_start', 'Start bar replay mode, optionally at a specific date', {
    date: z.string().optional().describe('Date to start replay from (YYYY-MM-DD format). If omitted, selects first available date.'),
  }, wrapOk('replay_start', ({ date }) => core.start({ date })));

  server.tool('replay_step',
    'Advance one bar in replay mode',
    {},
    wrapOk('replay_step', () => core.step()));

  server.tool('replay_autoplay', 'Toggle autoplay in replay mode, optionally set speed', {
    speed: z.coerce.number().optional().describe('Autoplay delay in ms (lower = faster). Valid values: 100, 143, 200, 300, 1000, 2000, 3000, 5000, 10000. Leave empty to just toggle.'),
  }, wrapOk('replay_autoplay', ({ speed }) => core.autoplay({ speed })));

  server.tool('replay_stop',
    'Stop replay and return to realtime',
    {},
    wrapOk('replay_stop', () => core.stop()));

  server.tool('replay_trade', 'Execute a trade action in replay mode (buy, sell, or close position)', {
    action: z.string().describe('Trade action: buy, sell, or close'),
  }, wrapOk('replay_trade', ({ action }) => core.trade({ action })));

  server.tool('replay_status',
    'Get current replay mode status',
    {},
    wrapOk('replay_status', () => core.status()));
}
