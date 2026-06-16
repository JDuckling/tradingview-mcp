import { z } from 'zod';
import * as core from '../core/drawing.js';
import { wrapOk, okResponse, errResponse, STATUS_CODES } from './_wrap.js';

export function registerDrawingTools(server) {
  server.tool('draw_shape', 'Draw a shape/line on the chart', {
    shape: z.string().describe('Shape type: horizontal_line, vertical_line, trend_line, rectangle, text'),
    point: z.object({ time: z.coerce.number(), price: z.coerce.number() }).describe('{ time: unix_timestamp, price: number }'),
    point2: z.object({ time: z.coerce.number(), price: z.coerce.number() }).optional().describe('Second point for two-point shapes (trend_line, rectangle)'),
    overrides: z.string().optional().describe('JSON string of style overrides (e.g., \'{"linecolor": "#ff0000", "linewidth": 2}\')'),
    text: z.string().optional().describe('Text content for text shapes'),
  }, wrapOk('draw_shape', (args) => core.drawShape(args)));

  server.tool('draw_batch',
    'Execute a whole annotation plan in ONE call: draw many shapes and/or create many alerts (e.g. chart_annotator draw_plan.json). Continues on per-item error; returns per-index results + an aggregate summary. Shapes draw on the ACTIVE chart (set the symbol first via chart_set_symbol); alerts use their own optional `symbol` field. `overrides` may be a JSON string OR an object.',
    {
      shapes: z.array(z.object({
        shape: z.string(),
        point: z.object({ time: z.coerce.number(), price: z.coerce.number() }),
        point2: z.object({ time: z.coerce.number(), price: z.coerce.number() }).optional(),
        overrides: z.any().optional(),
        text: z.string().optional(),
      })).optional().describe('Shapes to draw (same fields as draw_shape; overrides object or JSON string)'),
      alerts: z.array(z.object({
        condition: z.string(),
        price: z.coerce.number(),
        message: z.string().optional(),
        symbol: z.string().optional(),
      })).optional().describe('Alerts to create (same fields as alert_create)'),
    }, async ({ shapes = [], alerts = [] }) => {
      const total = (shapes?.length || 0) + (alerts?.length || 0);
      if (total === 0) {
        return errResponse('draw_batch', STATUS_CODES.VALIDATION_ERROR,
          'draw_batch: empty plan — provide shapes and/or alerts');
      }
      try {
        const payload = await core.drawBatch({ shapes, alertSpecs: alerts });
        const s = payload.summary;
        if (s.shapes_drawn === 0 && s.alerts_created === 0) {
          return errResponse('draw_batch', STATUS_CODES.INTERNAL_ERROR,
            `draw_batch: all ${total} item(s) failed`, payload);
        }
        const { success: _success, ...clean } = payload;
        return okResponse('draw_batch', clean);
      } catch (e) {
        return errResponse('draw_batch', STATUS_CODES.INTERNAL_ERROR, e?.message || String(e));
      }
    });

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
