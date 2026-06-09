import { z } from 'zod';
import * as core from '../core/alerts.js';
import { wrapOk } from './_wrap.js';

export function registerAlertTools(server) {
  server.tool('alert_create', 'Create a price alert via the TradingView alert dialog', {
    condition: z.string().describe('Alert condition (e.g., "crossing", "greater_than", "less_than")'),
    price: z.coerce.number().describe('Price level for the alert'),
    message: z.string().optional().describe('Alert message'),
    symbol: z.string().optional().describe('Symbol to alert on (e.g. "MOEX:VTBR"); default = active chart'),
  }, wrapOk('alert_create', ({ condition, price, message, symbol }) => core.create({ condition, price, message, symbol })));

  server.tool('alert_list',
    'List active alerts',
    {},
    wrapOk('alert_list', () => core.list()));

  server.tool('alert_delete', 'Delete alerts by id (alert_id / alert_ids from alert_list) or all of them (delete_all)', {
    alert_id: z.coerce.number().optional().describe('Delete a single alert by its alert_id (from alert_list)'),
    alert_ids: z.array(z.coerce.number()).optional().describe('Delete multiple alerts by alert_id'),
    delete_all: z.coerce.boolean().optional().describe('Delete all alerts'),
  }, wrapOk('alert_delete', ({ alert_id, alert_ids, delete_all }) => core.deleteAlerts({ alert_id, alert_ids, delete_all })));
}
