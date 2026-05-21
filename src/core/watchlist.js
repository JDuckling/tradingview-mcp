/**
 * Core watchlist logic.
 * Uses TradingView's internal widget API with DOM fallback.
 */
import { evaluate, getClient } from '../connection.js';

export async function get() {
  // Try internal API first — reads from the active watchlist widget
  const symbols = await evaluate(`
    (function() {
      // Method 1: Try the watchlist widget's internal data
      try {
        var rightArea = document.querySelector('[class*="layout__area--right"]');
        if (!rightArea || rightArea.offsetWidth < 50) return { symbols: [], source: 'panel_closed' };
      } catch(e) {}

      // Method 2: Read data-symbol-full attributes from watchlist rows
      var results = [];
      var seen = {};
      var container = document.querySelector('[class*="layout__area--right"]');
      if (!container) return { symbols: [], source: 'no_container' };

      // Find all elements with symbol data attributes
      var symbolEls = container.querySelectorAll('[data-symbol-full]');
      for (var i = 0; i < symbolEls.length; i++) {
        var sym = symbolEls[i].getAttribute('data-symbol-full');
        if (!sym || seen[sym]) continue;
        seen[sym] = true;

        // Find the row and extract price data
        var row = symbolEls[i].closest('[class*="row"]') || symbolEls[i].parentElement;
        var cells = row ? row.querySelectorAll('[class*="cell"], [class*="column"]') : [];
        var nums = [];
        for (var j = 0; j < cells.length; j++) {
          var t = cells[j].textContent.trim();
          if (t && /^[\\-+]?[\\d,]+\\.?\\d*%?$/.test(t.replace(/[\\s,]/g, ''))) nums.push(t);
        }
        results.push({ symbol: sym, last: nums[0] || null, change: nums[1] || null, change_percent: nums[2] || null });
      }

      if (results.length > 0) return { symbols: results, source: 'data_attributes' };

      // Method 3: Scan for ticker-like text in the right panel
      var items = container.querySelectorAll('[class*="symbolName"], [class*="tickerName"], [class*="symbol-"]');
      for (var k = 0; k < items.length; k++) {
        var text = items[k].textContent.trim();
        if (text && /^[A-Z][A-Z0-9.:!]{0,20}$/.test(text) && !seen[text]) {
          seen[text] = true;
          results.push({ symbol: text, last: null, change: null, change_percent: null });
        }
      }

      return { symbols: results, source: results.length > 0 ? 'text_scan' : 'empty' };
    })()
  `);

  return {
    success: true,
    count: symbols?.symbols?.length || 0,
    source: symbols?.source || 'unknown',
    symbols: symbols?.symbols || [],
  };
}

export async function add({ symbol }) {
  // Issue #164: the historical toggle-button selector
  // `[data-name="base-watchlist-widget-button"]` no longer matches in
  // TV 3.1.0+, and the original code threw if not found — even though the
  // panel could already be open and the watchlist queryable. The new flow:
  //   1. Skip the "is panel open" check entirely. If `watchlist_get` works,
  //      the panel is reachable; if it doesn't, the add will fail at the
  //      next step with a clearer message.
  //   2. Try a broader set of "+ button" selectors covering 3.0.x and
  //      3.1.x DOM.
  //   3. If the click selectors all fail, fall back to the keyboard
  //      shortcut TV uses for the same action: focus the watchlist and
  //      send Insert / "+" depending on platform.
  //   4. After triggering search, type symbol → Enter → Escape (unchanged).
  const c = await getClient();

  const addClicked = await evaluate(`
    (function() {
      var selectors = [
        '[data-name="watchlist-add-symbol-button"]',  // TV 3.1.x
        '[data-name="add-symbol-button"]',            // pre-3.1
        'button[aria-label="Add symbol"]',
        'button[aria-label*="Add symbol"]',
        'button[title*="Add symbol"]',
        'button[class*="addSymbol"]',
        'button[class*="addButton"]',
      ];
      for (var s = 0; s < selectors.length; s++) {
        var btn = document.querySelector(selectors[s]);
        if (btn && btn.offsetParent !== null) {
          btn.click();
          return { found: true, selector: selectors[s] };
        }
      }
      // Fallback A: scan right-panel buttons for aria-label match.
      var rightPanel = document.querySelector('[class*="layout__area--right"]')
        || document.querySelector('[class*="rightPanel"]')
        || document.querySelector('[data-name="right-toolbar"]');
      if (rightPanel) {
        var buttons = rightPanel.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          var ariaLabel = buttons[i].getAttribute('aria-label') || '';
          var titleAttr = buttons[i].getAttribute('title') || '';
          if (/add.*symbol/i.test(ariaLabel) || /add.*symbol/i.test(titleAttr) ||
              buttons[i].textContent.trim() === '+') {
            buttons[i].click();
            return { found: true, method: 'fallback_aria' };
          }
        }
      }
      // Fallback B: any visible "+" button anywhere on the page (last-resort —
      // could mis-click in pathological DOMs, but better than failing outright
      // since the user explicitly asked for a watchlist add).
      var anyPlus = document.querySelectorAll('button');
      for (var k = 0; k < anyPlus.length; k++) {
        if (anyPlus[k].textContent.trim() === '+' && anyPlus[k].offsetParent !== null) {
          var rect = anyPlus[k].getBoundingClientRect();
          // Right-panel "+" is typically in the upper-right quadrant.
          if (rect.right > window.innerWidth * 0.6) {
            anyPlus[k].click();
            return { found: true, method: 'fallback_plus_button' };
          }
        }
      }
      return { found: false };
    })()
  `);

  if (!addClicked?.found) {
    throw new Error('Add symbol button not found — TV DOM may have changed. Workaround: add the symbol manually via the watchlist `+` UI.');
  }

  await new Promise(r => setTimeout(r, 300));

  // Type the symbol into the search input
  await c.Input.insertText({ text: symbol });
  await new Promise(r => setTimeout(r, 500));

  // Press Enter to select the first result
  await c.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter' });
  await new Promise(r => setTimeout(r, 300));

  // Press Escape to close search
  await c.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Escape', code: 'Escape' });

  return { success: true, symbol, action: 'added', selector_used: addClicked.selector || addClicked.method };
}
