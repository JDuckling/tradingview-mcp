import { z } from 'zod';
import * as core from '../core/pane.js';
import { wrapOk } from './_wrap.js';

export function registerPaneTools(server) {
  server.tool('pane_list',
    'List all chart panes in the current layout with their symbols and active state',
    {},
    wrapOk('pane_list', () => core.list()));

  server.tool('pane_set_layout', 'Change the chart grid layout (e.g., single, 2x2, 2h, 3v)', {
    layout: z.string().describe('Layout code: s (single), 2h, 2v, 2-1, 1-2, 3h, 3v, 4 (2x2), 6, 8. Also accepts: single, 2x1, 1x2, 2x2, quad'),
  }, wrapOk('pane_set_layout', ({ layout }) => core.setLayout({ layout })));

  server.tool('pane_focus', 'Focus a specific chart pane by index (0-based)', {
    index: z.coerce.number().describe('Pane index (0-based, from pane_list)'),
  }, wrapOk('pane_focus', ({ index }) => core.focus({ index })));

  server.tool('pane_set_symbol', 'Set the symbol on a specific pane by index', {
    index: z.coerce.number().describe('Pane index (0-based)'),
    symbol: z.string().describe('Symbol to set (e.g., NQ1!, ES1!, AAPL)'),
  }, wrapOk('pane_set_symbol', ({ index, symbol }) => core.setSymbol({ index, symbol })));
}
