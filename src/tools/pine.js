import { z } from 'zod';
import * as core from '../core/pine.js';
import { wrapOk, errResponse, STATUS_CODES } from './_wrap.js';

export function registerPineTools(server) {
  server.tool('pine_get_source',
    'Get current Pine Script source code from the editor',
    {},
    wrapOk('pine_get_source', () => core.getSource()));

  server.tool('pine_set_source', 'Set Pine Script source code in the editor', {
    source: z.string().describe('Pine Script source code to inject'),
  }, wrapOk('pine_set_source', ({ source }) => core.setSource({ source })));

  server.tool('pine_compile',
    'Compile / add the current Pine Script to the chart',
    {},
    wrapOk('pine_compile', () => core.compile()));

  server.tool('pine_get_errors',
    'Get Pine Script compilation errors from Monaco markers',
    {},
    wrapOk('pine_get_errors', () => core.getErrors()));

  server.tool('pine_save',
    'Save the current Pine Script (Ctrl+S)',
    {},
    wrapOk('pine_save', () => core.save()));

  server.tool('pine_get_console',
    'Read Pine Script console/log output (compile messages, log.info(), errors)',
    {},
    wrapOk('pine_get_console', () => core.getConsole()));

  server.tool('pine_smart_compile',
    'Intelligent compile: detects button, compiles, checks errors, reports study changes',
    {},
    wrapOk('pine_smart_compile', () => core.smartCompile()));

  server.tool('pine_new', 'Create a new blank Pine Script', {
    type: z.enum(['indicator', 'strategy', 'library']).describe('Type of script to create'),
  }, wrapOk('pine_new', ({ type }) => core.newScript({ type })));

  server.tool('pine_open', 'Open a saved Pine Script by name', {
    name: z.string().describe('Name of the saved script to open (case-insensitive match)'),
  }, async ({ name }) => {
    try {
      const payload = await core.openScript({ name });
      return wrapOk('pine_open', () => payload)({ name });
    } catch (e) {
      const code = /not found|no such|not exist/i.test(e?.message)
        ? STATUS_CODES.NOT_FOUND
        : STATUS_CODES.INTERNAL_ERROR;
      return errResponse('pine_open', code, e?.message || String(e), { source: 'internal_api' });
    }
  });

  server.tool('pine_list_scripts',
    'List saved Pine Scripts',
    {},
    wrapOk('pine_list_scripts', () => core.listScripts()));

  server.tool('pine_analyze',
    'Run static analysis on Pine Script code WITHOUT compiling — catches array out-of-bounds, unguarded array.first()/last(), bad loop bounds, and implicit bool casts. Works offline, no TradingView connection needed.',
    { source: z.string().describe('Pine Script source code to analyze') },
    wrapOk('pine_analyze', ({ source }) => core.analyze({ source })));

  server.tool('pine_check',
    'Compile Pine Script via TradingView\'s server API without needing the chart open. Returns compilation errors/warnings. Useful for validating code before injecting into the chart.',
    { source: z.string().describe('Pine Script source code to compile/validate') },
    wrapOk('pine_check', ({ source }) => core.check({ source })));
}
