import { z } from 'zod';
import * as core from '../core/capture.js';
import { wrapOk } from './_wrap.js';

export function registerCaptureTools(server) {
  server.tool('capture_screenshot', 'Take a screenshot of the TradingView chart', {
    region: z.string().optional().describe('Region to capture: full, chart, strategy_tester (default full)'),
    filename: z.string().optional().describe('Custom filename (without extension)'),
    method: z.string().optional().describe('Capture method: cdp (Page.captureScreenshot) or api (chartWidgetCollection.takeScreenshot) (default cdp)'),
  }, wrapOk('capture_screenshot', ({ region, filename, method }) => core.captureScreenshot({ region, filename, method })));
}
