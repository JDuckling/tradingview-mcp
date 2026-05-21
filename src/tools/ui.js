import { z } from 'zod';
import * as core from '../core/ui.js';
import { wrapOk } from './_wrap.js';

export function registerUiTools(server) {
  server.tool('ui_click', 'Click a UI element by aria-label, data-name, text content, or class substring', {
    by: z.enum(['aria-label', 'data-name', 'text', 'class-contains']).describe('Selector strategy'),
    value: z.string().describe('Value to match against the chosen selector strategy'),
  }, wrapOk('ui_click', ({ by, value }) => core.click({ by, value })));

  server.tool('ui_open_panel', 'Open, close, or toggle TradingView panels (pine-editor, strategy-tester, watchlist, alerts, trading)', {
    panel: z.enum(['pine-editor', 'strategy-tester', 'watchlist', 'alerts', 'trading']).describe('Panel name'),
    action: z.enum(['open', 'close', 'toggle']).describe('Action to perform'),
  }, wrapOk('ui_open_panel', ({ panel, action }) => core.openPanel({ panel, action })));

  server.tool('ui_fullscreen',
    'Toggle TradingView fullscreen mode',
    {},
    wrapOk('ui_fullscreen', () => core.fullscreen()));

  server.tool('layout_list',
    'List saved chart layouts',
    {},
    wrapOk('layout_list', () => core.layoutList()));

  server.tool('layout_switch', 'Switch to a saved chart layout by name or ID', {
    name: z.string().describe('Name or ID of the layout to switch to'),
  }, wrapOk('layout_switch', ({ name }) => core.layoutSwitch({ name })));

  server.tool('ui_keyboard', 'Press keyboard keys or shortcuts (e.g., Enter, Escape, Alt+S, Ctrl+Z)', {
    key: z.string().describe('Key to press (e.g., "Enter", "Escape", "Tab", "a", "ArrowUp")'),
    modifiers: z.array(z.enum(['ctrl', 'alt', 'shift', 'meta'])).optional().describe('Modifier keys to hold (e.g., ["ctrl", "shift"])'),
  }, wrapOk('ui_keyboard', ({ key, modifiers }) => core.keyboard({ key, modifiers })));

  server.tool('ui_type_text', 'Type text into the currently focused input/textarea element', {
    text: z.string().describe('Text to type into the focused element'),
  }, wrapOk('ui_type_text', ({ text }) => core.typeText({ text })));

  server.tool('ui_hover', 'Hover over a UI element by aria-label, data-name, or text content', {
    by: z.enum(['aria-label', 'data-name', 'text', 'class-contains']).describe('Selector strategy'),
    value: z.string().describe('Value to match'),
  }, wrapOk('ui_hover', ({ by, value }) => core.hover({ by, value })));

  server.tool('ui_scroll', 'Scroll the chart or page up/down/left/right', {
    direction: z.enum(['up', 'down', 'left', 'right']).describe('Scroll direction'),
    amount: z.coerce.number().optional().describe('Scroll amount in pixels (default 300)'),
  }, wrapOk('ui_scroll', ({ direction, amount }) => core.scroll({ direction, amount })));

  server.tool('ui_mouse_click', 'Click at specific x,y coordinates on the TradingView window', {
    x: z.coerce.number().describe('X coordinate (pixels from left)'),
    y: z.coerce.number().describe('Y coordinate (pixels from top)'),
    button: z.enum(['left', 'right', 'middle']).optional().describe('Mouse button (default left)'),
    double_click: z.coerce.boolean().optional().describe('Double click (default false)'),
  }, wrapOk('ui_mouse_click', ({ x, y, button, double_click }) => core.mouseClick({ x, y, button, double_click })));

  server.tool('ui_find_element', 'Find UI elements by text, aria-label, or CSS selector and return their positions', {
    query: z.string().describe('Text content, aria-label value, or CSS selector to search for'),
    strategy: z.enum(['text', 'aria-label', 'css']).optional().describe('Search strategy (default: text)'),
  }, wrapOk('ui_find_element', ({ query, strategy }) => core.findElement({ query, strategy })));

  server.tool('ui_evaluate', 'Execute JavaScript code in the TradingView page context for advanced automation', {
    expression: z.string().describe('JavaScript expression to evaluate in the page context. Wrap in IIFE for complex logic.'),
  }, wrapOk('ui_evaluate', ({ expression }) => core.uiEvaluate({ expression })));
}
