/**
 * Core alert logic.
 */
import { evaluate, evaluateAsync, safeString, requireFinite } from '../connection.js';

// Map a user-facing condition string to a TradingView price-alert condition type.
// Verified live 2026-06-01: cross / greater / less all accepted by create_alert.
function mapCondition(condition) {
  const c = String(condition || '').toLowerCase().replace(/[\s-]/g, '_');
  if (/^(greater|greater_than|above|gt)$/.test(c)) return 'greater';
  if (/^(less|less_than|below|lt)$/.test(c)) return 'less';
  if (/cross_up|crossing_up/.test(c)) return 'cross_up';
  if (/cross_down|crossing_down/.test(c)) return 'cross_down';
  return 'cross'; // crossing / default
}

export async function create({ condition, price, message }) {
  const p = requireFinite(price, 'price');
  const condType = mapCondition(condition);

  // --- Primary path: REST create_alert in the page main world (same origin +
  // credentials as TradingView's own alert dialog), mirroring core.list().
  // CRITICAL: no Content-Type header. application/json triggers a CORS preflight
  // (OPTIONS) that pricealerts.tradingview.com rejects -> "Failed to fetch". A
  // "simple" request (default text/plain) is accepted; the server parses the JSON
  // body regardless. Verified live 2026-06-01 (cross/greater/less all -> s:ok).
  const rest = await evaluateAsync(`
    (async function(){
      try {
        var c = window.TradingViewApi.activeChart();
        var resolution = c.resolution() || '1D';
        var pro = null, currency = null;
        try { var ext = c.symbolExt(); pro = ext.pro_name || ext.full_name; } catch(e){}
        try {
          var w = window.TradingViewApi._activeChartWidgetWV.value();
          var si = w._chartWidget.model().mainSeries().symbolInfo();
          if (si) { pro = si.pro_name || si.full_name || pro; currency = si.currency_code; }
        } catch(e){}
        if (!pro) return { ok:false, error:'could not resolve chart symbol' };
        var symObj = { symbol: pro };
        if (currency) { symObj['adjustment'] = 'splits'; symObj['currency-id'] = currency; }
        var price = ${p};
        var condType = ${safeString(condType)};
        var msg = ${safeString(message || '')} || (pro + ' ' + condType + ' ' + price);
        var body = { payload: {
          symbol: '=' + JSON.stringify(symObj),
          resolution: resolution,
          message: msg,
          sound_file: null, sound_duration: 0, popup: true,
          expiration: new Date(Date.now() + 30*86400000).toISOString(),
          auto_deactivate: true, email: false, sms_over_email: false,
          mobile_push: true, web_hook: null, name: null,
          conditions: [{ type: condType, frequency: 'on_first_fire',
            series: [{ type:'barset' }, { type:'value', value: price }], resolution: resolution }],
          active: true, ignore_warnings: true
        }};
        var r = await fetch('https://pricealerts.tradingview.com/create_alert', {
          method: 'POST', credentials: 'include', body: JSON.stringify(body) });
        var j = await r.json();
        var alertId = j && j.r && j.r.alert_id;
        return { ok: (r.status === 200 && j && j.s === 'ok'), status: r.status,
                 alert_id: alertId || null, symbol: pro, errmsg: (j && j.errmsg) || null };
      } catch(e){ return { ok:false, error: e.message }; }
    })()
  `);

  if (rest && rest.ok) {
    return { success: true, alert_id: rest.alert_id, symbol: rest.symbol,
             price: p, condition: condType, message: message || '(auto)', source: 'rest_api' };
  }

  // --- Fallback path: DOM dialog with locale-independent selectors. Best-effort
  // (kept so the tool degrades gracefully if the private REST shape ever changes).
  const restErr = (rest && (rest.error || rest.errmsg)) || 'rest path returned not-ok';
  await evaluate(`
    (function(){
      var open = document.querySelector('[data-name="set-alert-button"]')
        || document.querySelector('[aria-label="Create Alert"]')
        || document.querySelector('[aria-label="Создать оповещение"]');
      if (open) { open.click(); return true; }
      var panel = document.querySelector('[data-name="alerts"]');   // open side panel, then retry
      if (panel) { panel.click(); }
      return false;
    })()
  `);
  await new Promise(r => setTimeout(r, 800));
  await evaluate(`
    (function(){ var b=document.querySelector('[data-name="set-alert-button"]'); if(b){ b.click(); return true; } return false; })()
  `);
  await new Promise(r => setTimeout(r, 800));

  const priceSet = await evaluate(`
    (function(){
      var inputs = document.querySelectorAll('input[type="text"], input[inputmode="decimal"], input[inputmode="numeric"]');
      for (var i=0;i<inputs.length;i++){
        var inp = inputs[i]; var r = inp.getBoundingClientRect();
        if (r.width>0 && r.height>0 && /^[\\d\\s.,]*$/.test(inp.value)) {
          var nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          nativeSet.call(inp, ${safeString(String(p))});
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    })()
  `);

  if (message) {
    await evaluate(`
      (function(){
        var ta = document.querySelector('textarea');
        if (ta) { var s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          s.call(ta, ${JSON.stringify(message)}); ta.dispatchEvent(new Event('input', { bubbles: true })); }
      })()
    `);
  }
  await new Promise(r => setTimeout(r, 400));
  const created = await evaluate(`
    (function(){
      var btns = document.querySelectorAll('button');
      for (var i=0;i<btns.length;i++){ var t=(btns[i].textContent||'').trim();
        if (/^(Create|Создать)$/.test(t)) { btns[i].click(); return true; } }
      return false;
    })()
  `);

  return { success: !!created, price: p, condition: condType, message: message || '(none)',
           price_set: !!priceSet, source: 'dom_fallback', rest_error: restErr };
}

export async function list() {
  // Use pricealerts REST API — returns structured data with alert_id, symbol, price, conditions
  const result = await evaluateAsync(`
    fetch('https://pricealerts.tradingview.com/list_alerts', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.s !== 'ok' || !Array.isArray(data.r)) return { alerts: [], error: data.errmsg || 'Unexpected response' };
        return {
          alerts: data.r.map(function(a) {
            var sym = '';
            try { sym = JSON.parse(a.symbol.replace(/^=/, '')).symbol || a.symbol; } catch(e) { sym = a.symbol; }
            return {
              alert_id: a.alert_id,
              symbol: sym,
              type: a.type,
              message: a.message,
              active: a.active,
              condition: a.condition,
              resolution: a.resolution,
              created: a.create_time,
              last_fired: a.last_fire_time,
              expiration: a.expiration,
            };
          })
        };
      })
      .catch(function(e) { return { alerts: [], error: e.message }; })
  `);
  return { success: true, alert_count: result?.alerts?.length || 0, source: 'internal_api', alerts: result?.alerts || [], error: result?.error };
}

export async function deleteAlerts({ delete_all, alert_id } = {}) {
  // Resolve the target ids. An explicit alert_id (scalar or array) wins; with
  // delete_all we list() first and bulk-delete every id. Either way the same
  // REST endpoint runs once — the bulk endpoint accepts an array.
  const byId = alert_id !== undefined && alert_id !== null;
  let alertIds;
  if (byId) {
    alertIds = Array.isArray(alert_id) ? alert_id : [alert_id];
  } else if (delete_all) {
    const listed = await list();
    if (listed.error) {
      return { success: false, error: `could not list alerts to delete: ${listed.error}`, source: 'rest_api' };
    }
    alertIds = (listed.alerts || []).map(a => a.alert_id);
  } else {
    throw new Error('deleteAlerts requires alert_id or delete_all: true');
  }

  // Alert ids are numeric in TradingView's system; coerce + drop junk so the
  // interpolated array literal below is values-only (no injection surface).
  alertIds = alertIds.filter(id => Number.isFinite(Number(id))).map(id => Number(id));

  if (alertIds.length === 0) {
    if (delete_all && !byId) {
      return { success: true, deleted_count: 0, alert_ids: [], delete_all: true,
               source: 'rest_api', note: 'no active alerts to delete' };
    }
    throw new Error('deleteAlerts: no valid alert_id to delete');
  }

  // --- REST delete_alerts in the page main world (same origin + credentials as
  // TradingView's own alerts panel), mirroring core.create / core.list.
  // CRITICAL: no Content-Type header. application/json triggers a CORS preflight
  // (OPTIONS) that pricealerts.tradingview.com rejects -> "Failed to fetch"; a
  // "simple" request (default text/plain) is accepted and the server parses the
  // JSON body. Verified live 2026-06-01: { payload: { alert_ids: [...] } } -> s:ok;
  // { alert_ids } / { ids } shapes and /delete_alert,/remove_alert endpoints fail.
  const rest = await evaluateAsync(`
    (async function(){
      try {
        var body = { payload: { alert_ids: ${JSON.stringify(alertIds)} } };
        var r = await fetch('https://pricealerts.tradingview.com/delete_alerts', {
          method: 'POST', credentials: 'include', body: JSON.stringify(body) });
        var j = await r.json();
        return { ok: (r.status === 200 && j && j.s === 'ok'), status: r.status,
                 errmsg: (j && j.errmsg) || null };
      } catch(e){ return { ok:false, error: e.message }; }
    })()
  `);

  if (rest && rest.ok) {
    return { success: true, deleted_count: alertIds.length, alert_ids: alertIds,
             delete_all: !!delete_all, source: 'rest_api' };
  }
  return { success: false, alert_ids: alertIds, status: rest && rest.status,
           error: (rest && (rest.error || rest.errmsg)) || 'delete_alerts returned not-ok',
           source: 'rest_api' };
}
