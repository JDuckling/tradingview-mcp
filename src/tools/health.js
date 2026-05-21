import { z } from 'zod';
import * as core from '../core/health.js';
import { wrapOk, errResponse, STATUS_CODES } from './_wrap.js';

export function registerHealthTools(server) {
  server.tool('tv_health_check', 'Check CDP connection to TradingView and return current chart state', {}, async () => {
    try {
      const payload = await core.healthCheck();
      return wrapOk('tv_health_check', () => payload)({});
    } catch (e) {
      return errResponse(
        'tv_health_check',
        STATUS_CODES.CONNECTION_ERROR,
        e?.message || String(e),
        { hint: 'TradingView is not running with CDP enabled. Use the tv_launch tool to start it automatically.' },
      );
    }
  });

  server.tool('tv_discover',
    'Report which known TradingView API paths are available and their methods',
    {},
    wrapOk('tv_discover', () => core.discover()));

  server.tool('tv_ui_state',
    'Get current UI state: which panels are open, what buttons are visible/enabled/disabled',
    {},
    wrapOk('tv_ui_state', () => core.uiState()));

  server.tool('tv_launch', 'Launch TradingView Desktop with Chrome DevTools Protocol (remote debugging) enabled. Auto-detects install location on Mac, Windows, and Linux.', {
    port: z.coerce.number().optional().describe('CDP port (default 9222)'),
    kill_existing: z.coerce.boolean().optional().describe('Kill existing TradingView instances first (default true)'),
  }, wrapOk('tv_launch', ({ port, kill_existing }) => core.launch({ port, kill_existing })));
}
