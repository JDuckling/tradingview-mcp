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

export async function create({ condition, price, message, symbol }) {
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
        // Explicit symbol (e.g. "MOEX:VTBR") → create off-chart without switching the
        // active chart (so a parallel session's chart isn't hijacked). Falls back to
        // the active chart's symbol when no explicit symbol is passed (legacy behavior).
        var explicitSym = ${symbol ? safeString(String(symbol)) : 'null'};
        var c = window.TradingViewApi.activeChart();
        var resolution = (c && c.resolution && c.resolution()) || '1D';
        var pro = explicitSym, currency = null;
        if (!explicitSym) {
          try { var ext = c.symbolExt(); pro = ext.pro_name || ext.full_name; } catch(e){}
          try {
            var w = window.TradingViewApi._activeChartWidgetWV.value();
            var si = w._chartWidget.model().mainSeries().symbolInfo();
            if (si) { pro = si.pro_name || si.full_name || pro; currency = si.currency_code; }
          } catch(e){}
        }
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

export async function deleteAlerts({ delete_all, alert_id, alert_ids } = {}) {
  // Collect explicit ids: alert_id (scalar) and/or alert_ids (array), normalised to finite numbers.
  const ids = []
    .concat(Array.isArray(alert_ids) ? alert_ids : (alert_ids != null ? [alert_ids] : []))
    .concat(alert_id != null && alert_id !== '' ? [alert_id] : [])
    .map(Number)
    .filter(Number.isFinite);

  // delete_all without explicit ids: resolve current alert ids via REST list(), then delete by id.
  // Falls through to the DOM context-menu fallback if listing fails or returns nothing.
  if (delete_all && ids.length === 0) {
    try {
      const listed = await list();
      for (const a of (listed?.alerts || [])) {
        const n = Number(a.alert_id);
        if (Number.isFinite(n)) ids.push(n);
      }
    } catch (e) { /* fall through to DOM fallback */ }
  }

  // --- Primary path: REST delete_alerts in the page main world (same origin +
  // credentials as TradingView's own alert panel), mirroring core.list()/create().
  // CRITICAL: no Content-Type header — application/json triggers a CORS preflight
  // that pricealerts.tradingview.com rejects -> "Failed to fetch". Verified live
  // 2026-06-08: POST /delete_alerts {payload:{alert_ids:[…]}} -> { s:'ok' }.
  if (ids.length > 0) {
    const rest = await evaluateAsync(`
      (async function(){
        try {
          var r = await fetch('https://pricealerts.tradingview.com/delete_alerts', {
            method: 'POST', credentials: 'include',
            body: JSON.stringify({ payload: { alert_ids: ${JSON.stringify(ids)} } }) });
          var j = await r.json();
          return { ok: (r.status === 200 && j && j.s === 'ok'), status: r.status,
                   errmsg: (j && j.errmsg) || null };
        } catch(e){ return { ok:false, error: e.message }; }
      })()
    `);
    if (rest && rest.ok) {
      return { success: true, deleted_ids: ids, count: ids.length,
               mode: delete_all ? 'all' : 'by_id', source: 'rest_api' };
    }
    // Explicit-id delete has no DOM equivalent — report the REST failure directly.
    if (!delete_all) {
      return { success: false, requested_ids: ids, count: 0,
               error: (rest && (rest.error || rest.errmsg)) || 'delete_alerts returned not-ok',
               source: 'rest_api' };
    }
    // delete_all + REST failure -> fall through to DOM fallback below.
  }

  // --- Fallback path (delete_all only): DOM context-menu. Best-effort, kept so the
  // tool degrades gracefully if the private REST shape ever changes.
  if (delete_all) {
    const result = await evaluate(`
      (function() {
        var alertBtn = document.querySelector('[data-name="alerts"]');
        if (alertBtn) alertBtn.click();
        var header = document.querySelector('[data-name="alerts"]');
        if (header) {
          header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));
          return { context_menu_opened: true };
        }
        return { context_menu_opened: false };
      })()
    `);
    return { success: true, note: 'Alert deletion requires manual confirmation in the context menu.', context_menu_opened: result?.context_menu_opened || false, source: 'dom_fallback' };
  }

  throw new Error('Provide alert_id, alert_ids, or delete_all: true.');
}
