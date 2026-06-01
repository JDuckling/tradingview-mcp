import { z } from 'zod';
import * as core from '../core/alerts.js';
import { wrapOk } from './_wrap.js';

export function registerAlertTools(server) {
  server.tool('alert_create', 'Create a price alert via the TradingView alert dialog', {
    condition: z.string().describe('Alert condition (e.g., "crossing", "greater_than", "less_than")'),
    price: z.coerce.number().describe('Price level for the alert'),
    message: z.string().optional().describe('Alert message'),
  }, wrapOk('alert_create', ({ condition, price, message }) => core.create({ condition, price, message })));

  server.tool('alert_list',
    'List active alerts',
    {},
    wrapOk('alert_list', () => core.list()));

  server.tool('alert_delete', 'Delete alerts via pricealerts REST — a specific alert_id or all of them', {
    delete_all: z.coerce.boolean().optional().describe('Delete every active alert (lists then bulk-deletes in one request)'),
    alert_id: z.coerce.number().optional().describe('Specific alert_id to delete (from alert_list)'),
  }, wrapOk('alert_delete', ({ delete_all, alert_id }) => core.deleteAlerts({ delete_all, alert_id })));
}
