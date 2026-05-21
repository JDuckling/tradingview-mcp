import { z } from 'zod';
import * as core from '../core/watchlist.js';
import { wrapOk, errResponse, STATUS_CODES } from './_wrap.js';

export function registerWatchlistTools(server) {
  server.tool('watchlist_get',
    'Get all symbols from the current TradingView watchlist with last price, change, and change%',
    {},
    wrapOk('watchlist_get', () => core.get()));

  server.tool('watchlist_add', 'Add a symbol to the TradingView watchlist', {
    symbol: z.string().describe('Symbol to add (e.g., AAPL, BTCUSD, ES1!, NYMEX:CL1!)'),
  }, async ({ symbol }) => {
    try {
      const payload = await core.add({ symbol });
      return wrapOk('watchlist_add', () => payload)({ symbol });
    } catch (e) {
      // Try to close any open search/input on error (UI recovery)
      try {
        const { getClient } = await import('../connection.js');
        const c = await getClient();
        await c.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      } catch (_) { /* ignore recovery failure */ }
      // #164 known issue — "Watchlist button not found" is not_supported (UI hidden)
      const code = /button not found|panel/i.test(e?.message)
        ? STATUS_CODES.NOT_SUPPORTED
        : STATUS_CODES.INTERNAL_ERROR;
      return errResponse('watchlist_add', code, e?.message || String(e));
    }
  });
}
