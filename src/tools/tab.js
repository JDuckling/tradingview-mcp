import { z } from 'zod';
import * as core from '../core/tab.js';
import { wrapOk } from './_wrap.js';

export function registerTabTools(server) {
  server.tool('tab_list',
    'List all open TradingView chart tabs',
    {},
    wrapOk('tab_list', () => core.list()));

  server.tool('tab_new',
    'Open a new chart tab',
    {},
    wrapOk('tab_new', () => core.newTab()));

  server.tool('tab_close',
    'Close the current chart tab',
    {},
    wrapOk('tab_close', () => core.closeTab()));

  server.tool('tab_switch', 'Switch to a chart tab by index', {
    index: z.coerce.number().describe('Tab index (0-based, from tab_list)'),
  }, wrapOk('tab_switch', ({ index }) => core.switchTab({ index })));
}
