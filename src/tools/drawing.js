import { z } from 'zod';
import * as core from '../core/drawing.js';
import { wrapOk, errResponse, STATUS_CODES } from './_wrap.js';

export function registerDrawingTools(server) {
  server.tool('draw_shape', 'Draw a shape/line on the chart', {
    shape: z.string().describe('Shape type: horizontal_line, vertical_line, trend_line, rectangle, text'),
    point: z.object({ time: z.coerce.number(), price: z.coerce.number() }).describe('{ time: unix_timestamp, price: number }'),
    point2: z.object({ time: z.coerce.number(), price: z.coerce.number() }).optional().describe('Second point for two-point shapes (trend_line, rectangle)'),
    overrides: z.string().optional().describe('JSON string of style overrides (e.g., \'{"linecolor": "#ff0000", "linewidth": 2}\')'),
    text: z.string().optional().describe('Text content for text shapes'),
  }, wrapOk('draw_shape', (args) => core.drawShape(args)));

  server.tool('draw_list',
    'List all shapes/drawings on the chart',
    {},
    wrapOk('draw_list', () => core.listDrawings()));

  server.tool('draw_clear',
    'Remove all drawings from the chart',
    {},
    wrapOk('draw_clear', () => core.clearAll()));

  server.tool('draw_remove_one', 'Remove a specific drawing by entity ID', {
    entity_id: z.string().describe('Entity ID of the drawing to remove (from draw_list)'),
  }, async ({ entity_id }) => {
    try {
      const payload = await core.removeOne({ entity_id });
      return wrapOk('draw_remove_one', () => payload)({ entity_id });
    } catch (e) {
      const code = /shape not found|not found/i.test(e?.message)
        ? STATUS_CODES.NOT_FOUND
        : STATUS_CODES.INTERNAL_ERROR;
      return errResponse('draw_remove_one', code, e?.message || String(e));
    }
  });

  server.tool('draw_get_properties', 'Get properties and points of a specific drawing', {
    entity_id: z.string().describe('Entity ID of the drawing (from draw_list)'),
  }, async ({ entity_id }) => {
    try {
      const payload = await core.getProperties({ entity_id });
      return wrapOk('draw_get_properties', () => payload)({ entity_id });
    } catch (e) {
      const code = /shape not found|not found/i.test(e?.message)
        ? STATUS_CODES.NOT_FOUND
        : STATUS_CODES.INTERNAL_ERROR;
      return errResponse('draw_get_properties', code, e?.message || String(e));
    }
  });
}
