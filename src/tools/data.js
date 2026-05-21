import { z } from 'zod';
import * as core from '../core/data.js';
import { wrapOk, okResponse, errResponse, STATUS_CODES } from './_wrap.js';

export function registerDataTools(server) {
  server.tool('data_get_ohlcv',
    'Get OHLCV bar data from the chart. Use summary=true for compact stats instead of all bars (saves context). Pass symbol to read a different ticker — wrapper switches chart to that symbol, reads, then restores (cost: ~10-15 s per cross-symbol call).',
    {
      count: z.coerce.number().optional().describe('Number of bars to retrieve (max 500, default 100)'),
      summary: z.coerce.boolean().optional().describe('Return summary stats (high, low, open, close, avg volume, range) instead of all bars — much smaller output'),
      symbol: z.string().optional().describe('Symbol to read (blank or matching active chart = no switch, instant). Cross-symbol reads do a real chart switch and visibly flicker the chart for ~10 s.'),
    },
    wrapOk('data_get_ohlcv', ({ count, summary, symbol }) => core.getOhlcv({ count, summary, symbol })));

  server.tool('data_get_indicator', 'Get indicator/study info and input values', {
    entity_id: z.string().describe('Study entity ID (from chart_get_state)'),
  }, async ({ entity_id }) => {
    try {
      const payload = await core.getIndicator({ entity_id });
      return okResponse('data_get_indicator', payload);
    } catch (e) {
      // "Study not found: X" / "There is no such study" → not_found
      const code = /not found|no such/i.test(e?.message) ? STATUS_CODES.NOT_FOUND : STATUS_CODES.INTERNAL_ERROR;
      return errResponse('data_get_indicator', code, e?.message || String(e));
    }
  });

  server.tool('data_get_strategy_results',
    'Get strategy performance metrics from Strategy Tester',
    {},
    wrapOk('data_get_strategy_results', () => core.getStrategyResults()));

  server.tool('data_get_trades', 'Get trade list from Strategy Tester', {
    max_trades: z.coerce.number().optional().describe('Maximum trades to return'),
  }, wrapOk('data_get_trades', ({ max_trades }) => core.getTrades({ max_trades })));

  server.tool('data_get_equity',
    'Get equity curve data from Strategy Tester',
    {},
    wrapOk('data_get_equity', () => core.getEquity()));

  server.tool('quote_get', 'Get real-time quote data for a symbol (price, OHLC, volume)', {
    symbol: z.string().optional().describe('Symbol to quote (blank = current chart symbol)'),
  }, wrapOk('quote_get', ({ symbol }) => core.getQuote({ symbol })));

  server.tool('depth_get', 'Get order book / DOM (Depth of Market) data from the chart', {}, async () => {
    try {
      const payload = await core.getDepth();
      return okResponse('depth_get', payload);
    } catch (e) {
      return errResponse(
        'depth_get',
        /not found|panel/i.test(e?.message) ? STATUS_CODES.NOT_SUPPORTED : STATUS_CODES.INTERNAL_ERROR,
        e?.message || String(e),
        { hint: 'Open the DOM panel in TradingView before using this tool.' },
      );
    }
  });

  server.tool('data_get_pine_lines',
    'Read horizontal price levels drawn by Pine Script indicators (line.new). Returns deduplicated price levels per study. Use study_filter to target a specific indicator.',
    {
      study_filter: z.string().optional().describe('Substring to match study name (e.g., "Profiler", "NY Levels"). Omit for all.'),
      verbose: z.coerce.boolean().optional().describe('Return raw line data with IDs, coordinates, colors (default false — returns only unique price levels)'),
    },
    wrapOk('data_get_pine_lines', ({ study_filter, verbose }) => core.getPineLines({ study_filter, verbose })));

  server.tool('data_get_pine_labels',
    'Read text labels drawn by Pine Script indicators (label.new). Returns text and price pairs. Use study_filter to target a specific indicator.',
    {
      study_filter: z.string().optional().describe('Substring to match study name. Omit for all.'),
      max_labels: z.coerce.number().optional().describe('Max labels per study (default 50). Set higher if you need all.'),
      verbose: z.coerce.boolean().optional().describe('Return raw label data with IDs, colors, positions (default false — returns only text + price)'),
    },
    wrapOk('data_get_pine_labels', ({ study_filter, max_labels, verbose }) => core.getPineLabels({ study_filter, max_labels, verbose })));

  server.tool('data_get_pine_tables',
    'Read table data drawn by Pine Script indicators (table.new). Returns formatted text rows per table. Use study_filter to target a specific indicator.',
    {
      study_filter: z.string().optional().describe('Substring to match study name. Omit for all.'),
    },
    wrapOk('data_get_pine_tables', ({ study_filter }) => core.getPineTables({ study_filter })));

  server.tool('data_get_pine_boxes',
    'Read box/zone boundaries drawn by Pine Script indicators (box.new). Returns deduplicated {high, low} price zones. Use study_filter to target a specific indicator.',
    {
      study_filter: z.string().optional().describe('Substring to match study name. Omit for all.'),
      verbose: z.coerce.boolean().optional().describe('Return all boxes with IDs and coordinates (default false — returns unique price zones)'),
    },
    wrapOk('data_get_pine_boxes', ({ study_filter, verbose }) => core.getPineBoxes({ study_filter, verbose })));

  server.tool('data_get_study_values',
    'Get current indicator values from the data window for all visible studies (RSI, MACD, Bollinger Bands, EMAs, custom indicators with plot()).',
    {},
    wrapOk('data_get_study_values', () => core.getStudyValues()));
}
