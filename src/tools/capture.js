import { z } from 'zod';
import * as core from '../core/capture.js';
import { wrapOk } from './_wrap.js';

export function registerCaptureTools(server) {
  server.tool('capture_screenshot', 'Take a screenshot of the TradingView chart', {
    region: z.string().optional().describe('Region to capture: full, chart, strategy_tester (default full)'),
    filename: z.string().optional().describe('Custom filename (without extension)'),
    method: z.string().optional().describe('Capture method: cdp (Page.captureScreenshot) or api (chartWidgetCollection.takeScreenshot) (default cdp)'),
    wait_for_render: z.coerce.boolean().optional().describe('Wait for the visible chart canvas to stabilize before capture (closes #144 stale-frame). Useful after chart_set_symbol or chart_set_timeframe.'),
  }, wrapOk('capture_screenshot', ({ region, filename, method, wait_for_render }) =>
    core.captureScreenshot({ region, filename, method, waitForRender: wait_for_render })));
}
