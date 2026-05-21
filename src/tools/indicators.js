import { z } from 'zod';
import * as core from '../core/indicators.js';
import { wrapOk, errResponse, STATUS_CODES } from './_wrap.js';

export function registerIndicatorTools(server) {
  server.tool('indicator_set_inputs', 'Change indicator/study input values (e.g., length, source, period)', {
    entity_id: z.string().describe('Entity ID of the study (from chart_get_state)'),
    inputs: z.string().describe('JSON string of input overrides, e.g. \'{"length": 50, "source": "close"}\'. Keys are input IDs, values are the new values.'),
  }, async ({ entity_id, inputs }) => {
    try {
      const payload = await core.setInputs({ entity_id, inputs });
      return wrapOk('indicator_set_inputs', () => payload)({ entity_id, inputs });
    } catch (e) {
      const code = /not found|no such/i.test(e?.message)
        ? STATUS_CODES.NOT_FOUND
        : STATUS_CODES.INTERNAL_ERROR;
      return errResponse('indicator_set_inputs', code, e?.message || String(e));
    }
  });

  server.tool('indicator_toggle_visibility', 'Show or hide an indicator/study on the chart', {
    entity_id: z.string().describe('Entity ID of the study (from chart_get_state)'),
    visible: z.coerce.boolean().describe('true to show, false to hide'),
  }, async ({ entity_id, visible }) => {
    try {
      const payload = await core.toggleVisibility({ entity_id, visible });
      return wrapOk('indicator_toggle_visibility', () => payload)({ entity_id, visible });
    } catch (e) {
      const code = /not found|no such/i.test(e?.message)
        ? STATUS_CODES.NOT_FOUND
        : STATUS_CODES.INTERNAL_ERROR;
      return errResponse('indicator_toggle_visibility', code, e?.message || String(e));
    }
  });
}
