/* Jewellery POS — v1. Vanilla JS, no build step. All state in localStorage. */
'use strict';

// ---------- storage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('jpos.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('jpos.' + k, JSON.stringify(v)); } catch (e) {} },
};

const DEFAULT_SETTINGS = {
  shopName: '',
  gstOn: true, gstPct: 3,
  roundTo: 1,                       // round final to nearest ₹1 / 10 / 50
  feed: {                           // which live feed item drives each metal
    gold:   { name: null, unit: 'auto' },   // unit: auto | g | 10g | kg
    silver: { name: null, unit: 'auto' },
  },
  adj: { gold: { type: 'rs', v: 0 }, silver: { type: 'rs', v: 0 } }, // shop adjustment on ₹/g
  manual: { gold: null, silver: null },     // ₹/g override; null = use live
  purity: { '24K': 1, '22K': 0.916, '18K': 0.75, '999': 1 },
};

const DEFAULT_CATS = [
  ['Nose pin', '💎', 'gold', '22K', 'pct', 10], ['Ear rings', '✨', 'gold', '22K', 'pct', 10],
  ['Ring', '💍', 'gold', '22K', 'pct', 10], ['Pendant', '🔱', 'gold', '22K', 'pct', 10],
  ['Chain', '⛓️', 'gold', '22K', 'pct', 10], ['Bangles', '⭕', 'gold', '22K', 'pct', 10],
  ['Mangalsutra', '📿', 'gold', '22K', 'pct', 10], ['Coin', '🪙', 'gold', '24K', 'pct', 3],
  ['Payal', '👣', 'silver', '999', 'pg', 10], ['Bichhiya', '🦶', 'silver', '999', 'pg', 10],
  ['Glass', '🥛', 'silver', '999', 'pg', 10], ['Katori', '🥣', 'silver', '999', 'pg', 10],
  ['Lota', '🏺', 'silver', '999', 'pg', 10], ['Thali', '🍽️', 'silver', '999', 'pg', 10],
  ['Machhli', '🐟', 'silver', '999', 'pg', 10], ['Kada', '⭕', 'silver', '999', 'pg', 10],
  ['Coin', '🪙', 'silver', '999', 'pg', 5], ['Murti', '🛕', 'silver', '999', 'pg', 15],
].map(([name, icon, metal, purity, mtype, mval], i) => ({ id: 'c' + i, name, icon, metal, purity, mtype, mval }));

let S = Object.assign(structuredClone(DEFAULT_SETTINGS), store.get('settings', {}));
let CATS = store.get('cats', DEFAULT_CATS);
let LIST = store.get('list', []);
let FEED = store.get('feed', { items: [], at: null });   // last snapshot, survives offline
let feedState = 'connecting';
let tab = 'price', metalTab = 'gold';

const save = () => { store.set('settings', S); store.set('cats', CATS); store.set('list', LIST); };

// ---------- money ----------
const r2 = n => Math.round(n * 100) / 100;
const inr = (n, dp = 0) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Feed price -> ₹ per gram. Gold boards usually quote per 10 g, silver per kg.
function perGram(price, unit, metal) {
  const p = Number(price); if (!isFinite(p) || p <= 0) return null;
  if (unit === 'g') return p; if (unit === '10g') return p / 10; if (unit === 'kg') return p / 1000;
  if (metal === 'gold') return p > 30000 ? p / 10 : p;          // auto
  return p > 5000 ? p / 1000 : p;
}
function feedItem(metal) {
  const want = S.feed[metal].name; if (!FEED.items.length) return null;
  if (want) return FEED.items.find(i => i.name === want) || null;
  // first-run guess: first visible item whose name/src mentions the metal
  const re = metal === 'gold' ? /gold|xau/i : /silver|xag/i;
  return FEED.items.find(i => re.test(i.name + ' ' + i.src) && i.isView !== false) || FEED.items.find(i => re.test(i.name + ' ' + i.src)) || null;
}
function baseRate(metal) {          // ₹/g for pure metal before shop adjustment
  if (S.manual[metal]) return { v: Number(S.manual[metal]), src: 'manual' };
  const it = feedItem(metal); if (!it) return { v: null, src: 'none' };
  return { v: perGram(it.ask, S.feed[metal].unit, metal), src: 'live', name: it.name };
}
function rateFor(metal, purity) {   // ₹/g the shop charges for this purity
  const b = baseRate(metal); if (b.v == null) return null;
  let r = b.v * (S.purity[purity] ?? 1);
  const a = S.adj[metal]; r = a.type === 'pct' ? r * (1 + a.v / 100) : r + Number(a.v || 0);
  return r2(r);
}

// Price one line. wt in grams. Overrides from negotiation: rate (₹/g), making (₹ absolute)
function price(line) {
  const c = CATS.find(x => x.id === line.catId) || line.cat;
  const rate = line.rate ?? rateFor(c.metal, c.purity);
  if (rate == null || !(line.wt > 0)) return { c, rate, metal: 0, making: 0, gst: 0, total: 0, ok: rate != null };
  const metal = r2(line.wt * rate);
  const mv = line.mval ?? c.mval;
  let making = line.making ?? (c.mtype === 'pct' ? metal * mv / 100 : c.mtype === 'pg' ? line.wt * mv : Number(mv));
  making = r2(making);
  const gst = S.gstOn ? r2((metal + making) * S.gstPct / 100) : 0;
  return { c, rate, metal, making, gst, total: r2(metal + making + gst), ok: true };
}
const roundOff = t => Math.round(t / S.roundTo) * S.roundTo;
const makingLabel = (c, v = c.mval) => c.mtype === 'pct' ? v + '%' : c.mtype === 'pg' ? '₹' + v + '/g' : '₹' + v + ' flat';
const mUnit = c => c.mtype === 'pct' ? '% of metal' : c.mtype === 'pg' ? '₹ per gram' : '₹ per piece';
const numStr = n => String(r2(n));

// ---------- live feed ----------
function unpack(d) {
  try {
    if (typeof d === 'string') { try { return JSON.parse(d); } catch (e) {} }
    else if (d && !(d instanceof ArrayBuffer) && !ArrayBuffer.isView(d)) return d;
    return JSON.parse(pako.inflateRaw(d, { to: 'string' }));
  } catch (e) { return null; }
}
function connectFeed() {
  if (!window.io) { feedState = 'error'; renderTop(); return; }
  const sock = io('https://vickygold.co.in:10001', { transports: ['websocket', 'polling'], timeout: 15000 });
  sock.on('connect', () => { feedState = 'live'; sock.emit('room', 'vickygold'); sock.emit('client', 'vickygold'); renderTop(); });
  sock.on('connect_error', () => { feedState = 'error'; renderTop(); });
  sock.on('disconnect', () => { feedState = 'error'; renderTop(); });
  sock.on('mainProduct', d => {
    const o = unpack(d); if (!Array.isArray(o)) return;
    FEED = { at: Date.now(), items: o.map(r => ({ name: String(r.name ?? r.symbol ?? '?'), src: String(r.src ?? ''), ask: Number(r.ask), bid: Number(r.bid), high: Number(r.high), low: Number(r.low), isView: r.isView })) };
    store.set('feed', FEED); feedState = 'live';
    renderTop(); if (tab === 'rates' || tab === 'list') render(); refreshSheet();
  });
}
setInterval(renderTop, 30000);

// ---------- top strip ----------
function renderTop() {
  const g = rateFor('gold', '22K'), g24 = rateFor('gold', '24K'), s = rateFor('silver', '999');
  const cell = (cls, label, v) => `<div class="rate ${cls}"><small>${label}</small><b>${v == null ? '—' : inr(v)}<small>/g</small></b></div>`;
  $('rateStrip').innerHTML = cell('gold', 'Gold 22K', g) + cell('gold', 'Gold 24K', g24) + cell('silver', 'Silver', s);
  const age = FEED.at ? Math.round((Date.now() - FEED.at) / 60000) : null;
  const manual = S.manual.gold || S.manual.silver;
  let txt, cls;
  if (feedState === 'live' && FEED.at) { txt = 'Live rates · updated ' + (age < 1 ? 'just now' : age + ' min ago'); cls = 'ok'; }
  else if (FEED.at) { txt = 'Feed offline · using rates from ' + new Date(FEED.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); cls = 'bad'; }
  else if (feedState === 'error') { txt = 'Could not reach rate feed · set a rate in Rates tab'; cls = 'bad'; }
  else { txt = 'Connecting to live rates…'; cls = ''; }
  if (manual) txt += ' · manual rate on';
  $('feedStatus').className = 'feed ' + cls; $('feedText').textContent = txt;
}

// ---------- views ----------
const $ = id => document.getElementById(id);
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const n = LIST.length; $('listCount').hidden = !n; $('listCount').textContent = n;
  $('view').innerHTML = ({ price: viewPrice, list: viewList, rates: viewRates, settings: viewSettings })[tab]();
}

function viewPrice() {
  const cats = CATS.filter(c => c.metal === metalTab);
  return `<div class="seg"><button data-metal="gold" class="${metalTab === 'gold' ? 'on' : ''}">Gold</button><button data-metal="silver" class="${metalTab === 'silver' ? 'on' : ''}">Silver</button></div>
  <div class="grid">${cats.map(c => `<button class="tile" data-cat="${c.id}"><span>${c.icon || '•'}</span>${esc(c.name)}<small>${c.purity} · ${makingLabel(c)}</small></button>`).join('')}</div>
  <p class="note">Tap an item, type its weight, and the price appears. Add items to the customer's list to quote several at once.</p>`;
}

function listTotals() {
  let metal = 0, making = 0, gst = 0;
  LIST.forEach(l => { const p = price(l); metal += p.metal; making += p.making; gst += p.gst; });
  const sub = r2(metal + making + gst), fin = roundOff(sub);
  return { metal: r2(metal), making: r2(making), gst: r2(gst), sub, fin, ro: r2(fin - sub) };
}
function viewList() {
  if (!LIST.length) return `<div class="card empty">No items yet.<br>Go to <b>Price</b>, tap an item and add it here.</div>`;
  const T = listTotals();
  return `<div class="card">${LIST.map((l, i) => { const p = price(l); const neg = l.rate != null || l.making != null || l.mval != null;
    return `<button class="line" data-line="${i}"><span class="t">${p.c.icon || ''} ${esc(p.c.name)} <small class="num">${l.wt} g</small>${neg ? '<span class="tag">Adjusted</span>' : ''}</span><span class="amt num">${inr(p.total)}</span>
    <span class="d num">${p.c.purity} @ ${inr(p.rate, 2)}/g = ${inr(p.metal, 2)} · Making ${inr(p.making, 2)}${S.gstOn ? ' · GST ' + inr(p.gst, 2) : ''}</span></button>`; }).join('')}</div>
  <div class="card totals num"><div><span>Metal</span><span>${inr(T.metal, 2)}</span></div><div><span>Making</span><span>${inr(T.making, 2)}</span></div>
  ${S.gstOn ? `<div><span>GST ${S.gstPct}%</span><span>${inr(T.gst, 2)}</span></div>` : ''}${T.ro ? `<div><span>Round off</span><span>${T.ro > 0 ? '+' : ''}${T.ro.toFixed(2)}</span></div>` : ''}
  <div class="grand"><span>Total</span><span>${inr(T.fin)}</span></div></div>
  <div class="row"><button class="btn primary" data-act="share">Share on WhatsApp</button><button class="btn" data-act="clear">Clear list</button></div>`;
}

function viewRates() {
  const card = metal => {
    const b = baseRate(metal), it = feedItem(metal), a = S.adj[metal];
    const purities = metal === 'gold' ? ['24K', '22K', '18K'] : ['999'];
    return `<div class="card">
      <div class="field"><label>${metal === 'gold' ? 'Gold' : 'Silver'} source</label><div><span class="pill ${metal}">${b.src === 'manual' ? 'Manual' : b.src === 'live' ? 'Live' : 'Not set'}</span> ${it && b.src === 'live' ? esc(it.name) + ' · ' + inr(it.ask) : ''}</div></div>
      <div class="field"><label>Feed price is quoted per</label><select data-set="feed.${metal}.unit">${['auto', 'g', '10g', 'kg'].map(u => `<option value="${u}" ${S.feed[metal].unit === u ? 'selected' : ''}>${u === 'auto' ? 'Auto-detect' : u === 'g' ? '1 gram' : u === '10g' ? '10 grams' : '1 kg'}</option>`).join('')}</select></div>
      <div class="field"><label>Your adjustment on the live rate</label><div class="inline"><input type="number" inputmode="decimal" id="adj-${metal}" data-set="adj.${metal}.v" value="${a.v}"><select data-set="adj.${metal}.type"><option value="rs" ${a.type === 'rs' ? 'selected' : ''}>₹ per gram</option><option value="pct" ${a.type === 'pct' ? 'selected' : ''}>%</option></select></div></div>
      <div class="field"><label>Manual rate, ₹ per gram of pure ${metal} (leave empty to use live)</label><input type="number" inputmode="decimal" id="man-${metal}" data-set="manual.${metal}" value="${S.manual[metal] ?? ''}" placeholder="Using live rate"></div>
      <div class="field"><label>You charge</label><div class="num">${purities.map(p => `${p}: <b>${rateFor(metal, p) == null ? '—' : inr(rateFor(metal, p), 2)}/g</b>`).join(' · ')}</div></div>
    </div>`;
  };
  const items = FEED.items;
  return `<h2>Gold</h2>${card('gold')}<h2>Silver</h2>${card('silver')}
  <h2>Live feed (Vicky Gold)</h2>
  <p class="note">Pick which feed line drives gold and silver. Check whether it already includes GST (e.g. "incl GST+TCS"); if it does, turn GST off in Settings or set a negative adjustment.</p>
  <div class="card">${items.length ? items.map(it => `<div class="feeditem"><span>${esc(it.name)}${it.isView === false ? ' <small class="note">(hidden on their site)</small>' : ''}</span><b class="num">${inr(it.ask)}</b>
    <div class="use"><button class="btn small" data-use="gold" data-name="${esc(it.name)}">${S.feed.gold.name === it.name ? '✓ ' : ''}Use for gold</button><button class="btn small" data-use="silver" data-name="${esc(it.name)}">${S.feed.silver.name === it.name ? '✓ ' : ''}Use for silver</button></div></div>`).join('')
    : '<div class="empty">No feed data yet. Rates appear here once the live feed connects.</div>'}</div>`;
}

function viewSettings() {
  return `<h2>Shop</h2><div class="card">
    <div class="field"><label>Shop name (shown on shared estimates)</label><input id="shop" data-set="shopName" value="${esc(S.shopName)}" placeholder="e.g. Sharma Jewellers"></div>
    <div class="field"><label>GST</label><div class="inline"><select data-set="gstOn" data-bool="1"><option value="1" ${S.gstOn ? 'selected' : ''}>Add GST</option><option value="0" ${!S.gstOn ? 'selected' : ''}>No GST</option></select><input type="number" inputmode="decimal" id="gstpct" data-set="gstPct" value="${S.gstPct}"></div></div>
    <div class="field"><label>Round final total to nearest</label><select data-set="roundTo">${[1, 10, 50, 100].map(v => `<option value="${v}" ${S.roundTo == v ? 'selected' : ''}>₹${v}</option>`).join('')}</select></div>
    <div class="field"><label>Purity factors (rate = 24K/999 rate × factor)</label><div class="inline">${['22K', '18K'].map(p => `<input type="number" step="0.001" inputmode="decimal" id="pur-${p}" data-set="purity.${p}" value="${S.purity[p]}" aria-label="${p}">`).join('')}</div></div>
  </div>
  <h2>Items & making charges</h2>
  <div class="card">${CATS.map(c => `<button class="line" data-editcat="${c.id}"><span class="t">${c.icon || ''} ${esc(c.name)}</span><span class="pill ${c.metal}">${c.metal === 'gold' ? 'Gold ' + c.purity : 'Silver'}</span><span class="d">Making ${makingLabel(c)}</span></button>`).join('')}</div>
  <div class="row"><button class="btn" data-act="addcat">Add item</button><button class="btn" data-act="resetcats">Reset to defaults</button></div>
  <p class="note">Rate test page: <a href="rate-test.html">rate-test.html</a></p>`;
}

// ---------- bottom sheet ----------
let sheetState = null;
function openSheet(state) { sheetState = state; $('sheet').hidden = false; $('sheetBg').hidden = false; refreshSheet(); }
function closeSheet() { sheetState = null; $('sheet').hidden = true; $('sheetBg').hidden = true; }
function refreshSheet() { if (sheetState) $('sheet').innerHTML = (sheetState.kind === 'cat' ? sheetCat : sheetQuote)(); }

// Quote sheet: weight, rate and making are all editable in place. One keypad types into the selected box.
function qLine(st) {
  const l = { catId: st.line.catId, wt: parseFloat(st.wtStr) || 0 };
  if (st.rateStr !== '') l.rate = parseFloat(st.rateStr) || 0;
  if (st.mvalStr !== '') l.mval = parseFloat(st.mvalStr) || 0;
  return l;
}
function quoteState(line, idx) {
  return { kind: 'quote', idx, line, field: 'wt', fresh: idx != null, target: '',
    wtStr: line.wt ? String(line.wt) : '',
    rateStr: line.rate != null ? numStr(line.rate) : '',
    mvalStr: line.mval != null ? numStr(line.mval) : line.making != null && line.wt ? (() => { const c = CATS.find(x => x.id === line.catId); const m = price({ catId: line.catId, wt: line.wt, rate: line.rate }).metal; return numStr(c.mtype === 'pct' ? line.making / m * 100 : c.mtype === 'pg' ? line.making / line.wt : line.making); })() : '' };
}
function sheetQuote() {
  const st = sheetState, line = qLine(st), wt = line.wt;
  const p = price(line), c = p.c, today = rateFor(c.metal, c.purity);
  const rateEdited = st.rateStr !== '', mkEdited = st.mvalStr !== '';
  const curMval = mkEdited ? line.mval : c.mval;
  const box = (f, label, val, unit, edited, resetLabel) => `<div class="ebox ${st.field === f ? 'on' : ''}">
      <button class="eval" data-field="${f}"><small>${label}${edited ? ' <span class="tag">Edited</span>' : ''}</small><b class="num">${val}</b><small>${unit}</small></button>
      <div class="estep"><button data-step="${f}" data-dir="-1" aria-label="Decrease ${label}">−</button>${edited ? `<button data-reset="${f}" class="rs">${resetLabel}</button>` : '<span></span>'}<button data-step="${f}" data-dir="1" aria-label="Increase ${label}">+</button></div></div>`;
  let neg = '';
  if (wt > 0 && p.ok) {
    const T = parseFloat(st.target); let a = '', b = '';
    if (T > 0) {
      const pre = S.gstOn ? T / (1 + S.gstPct / 100) : T, mk = r2(pre - p.metal);
      const mv = c.mtype === 'pct' ? mk / p.metal * 100 : c.mtype === 'pg' ? mk / wt : mk;
      a = mk >= 0 ? `<button class="opt" data-neg="mval" data-v="${r2(mv)}"><b>Making → ${makingLabel(c, r2(mv))}</b><span>Rate stays ${inr(p.rate, 2)}/g · making ${inr(mk)}</span></button>`
        : `<div class="opt no"><b>Lower making</b><span class="warn">Not possible: metal alone is ${inr(p.metal)}</span></div>`;
      const r = r2(c.mtype === 'pct' ? pre / (wt * (1 + curMval / 100)) : c.mtype === 'pg' ? (pre - wt * curMval) / wt : (pre - curMval) / wt);
      b = r > 0 ? `<button class="opt" data-neg="rate" data-v="${r}"><b>Rate → ${inr(r, 2)}/g</b><span>${today != null ? (today - r >= 0 ? inr(today - r, 2) + '/g below' : inr(r - today, 2) + '/g above') + " today's rate · " : ''}making ${makingLabel(c, curMval)} kept</span></button>` : '';
    }
    neg = `<details class="negot" ${st.negOpen || st.target ? 'open' : ''}><summary>Customer wants a lower price?</summary>
      <input type="number" inputmode="numeric" id="target" value="${st.target || ''}" placeholder="Customer's final price, ₹">${a}${b}</details>`;
  }
  return `<h3><span>${c.icon || ''} ${esc(c.name)} <small class="note">${c.purity}</small></span><button class="x" data-act="close" aria-label="Close">×</button></h3>
    <button class="wt ${st.field === 'wt' ? 'on' : ''}" data-field="wt">${st.wtStr || '0'}<small> g</small></button>
    <div class="edits">
      ${box('rate', 'Rate', p.rate != null ? inr(p.rate, 2) : '—', rateEdited && today != null ? "today " + inr(today, 2) : 'per gram', rateEdited, "↺ Today's")}
      ${box('mval', 'Making', makingLabel(c, curMval), mkEdited ? 'usual ' + makingLabel(c) : mUnit(c), mkEdited, '↺ Usual')}
    </div>
    <div class="bd num">${p.ok ? `<div><span>Metal ${wt} g × ${inr(p.rate, 2)}</span><span>${inr(p.metal, 2)}</span></div><div><span>Making ${makingLabel(c, curMval)}</span><span>${inr(p.making, 2)}</span></div>${S.gstOn ? `<div><span>GST ${S.gstPct}%</span><span>${inr(p.gst, 2)}</span></div>` : ''}<div class="tot"><span>Price</span><span>${inr(roundOff(p.total))}</span></div>`
      : '<div class="warn">No rate yet. Tap Rate and type one.</div>'}</div>
    ${neg}
    <div class="keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => `<button data-key="${k}">${k}</button>`).join('')}</div>
    <div class="row">${st.idx == null ? `<button class="btn primary" data-act="add" ${wt > 0 && p.ok ? '' : 'disabled'}>Add to list</button>` : `<button class="btn primary" data-act="saveline">Save</button><button class="btn" data-act="delline">Remove</button>`}</div>`;
}

function sheetCat() {
  const c = sheetState.cat;
  return `<h3><span>${sheetState.isNew ? 'New item' : 'Edit item'}</span><button class="x" data-act="close" aria-label="Close">×</button></h3>
  <div class="card">
    <div class="field"><label>Name</label><input id="cname" value="${esc(c.name)}"></div>
    <div class="field"><label>Icon (emoji)</label><input id="cicon" value="${esc(c.icon || '')}"></div>
    <div class="field"><label>Metal & purity</label><select id="cpur">${[['gold', '24K'], ['gold', '22K'], ['gold', '18K'], ['silver', '999']].map(([m, p]) => `<option value="${m}|${p}" ${c.metal === m && c.purity === p ? 'selected' : ''}>${m === 'gold' ? 'Gold ' + p : 'Silver 999'}</option>`).join('')}</select></div>
    <div class="field"><label>Making charge</label><div class="inline"><select id="cmtype"><option value="pct" ${c.mtype === 'pct' ? 'selected' : ''}>% of metal value</option><option value="pg" ${c.mtype === 'pg' ? 'selected' : ''}>₹ per gram</option><option value="flat" ${c.mtype === 'flat' ? 'selected' : ''}>₹ flat per piece</option></select><input id="cmval" type="number" inputmode="decimal" value="${c.mval}"></div></div>
  </div>
  <div class="row"><button class="btn primary" data-act="savecat">Save</button>${sheetState.isNew ? '' : '<button class="btn" data-act="delcat">Delete</button>'}</div>`;
}

// ---------- events ----------
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 1800); }

document.addEventListener('click', e => {
  const b = e.target.closest('button,[data-line]'); if (!b) return;
  const d = b.dataset;
  if (d.tab) { tab = d.tab; render(); window.scrollTo(0, 0); return; }
  if (d.metal) { metalTab = d.metal; render(); return; }
  if (d.cat) { const c = CATS.find(x => x.id === d.cat); openSheet(quoteState({ catId: c.id }, null)); return; }
  if (d.line != null) { openSheet(quoteState({ ...LIST[+d.line] }, +d.line)); return; }
  if (d.field && sheetState) { sheetState.field = d.field; sheetState.fresh = true; refreshSheet(); return; }
  if (d.key && sheetState) {
    const st = sheetState, k = st.field + 'Str', max = st.field === 'wt' ? 3 : 2;
    let v = st.fresh && d.key !== '⌫' ? '' : st[k];
    if (st.fresh && d.key === '⌫') v = '';
    st.fresh = false;
    if (d.key === '⌫') v = v.slice(0, -1);
    else if (d.key === '.') { if (!v.includes('.')) v = (v || '0') + '.'; }
    else if (!(v.includes('.') && v.split('.')[1].length >= max) && v.length < 9) v = (v === '0' ? '' : v) + d.key;
    st[k] = v; refreshSheet(); return;
  }
  if (d.step && sheetState) {
    const st = sheetState, c = CATS.find(x => x.id === st.line.catId), line = qLine(st), p = price(line);
    if (d.step === 'rate') { const step = c.metal === 'gold' ? 10 : 1; st.rateStr = numStr(Math.max(0, (p.rate || 0) + step * d.dir)); }
    else { const step = c.mtype === 'pct' ? 0.5 : c.mtype === 'pg' ? 1 : 10; st.mvalStr = numStr(Math.max(0, (line.mval ?? c.mval) + step * d.dir)); }
    st.field = d.step; st.fresh = true; refreshSheet(); return;
  }
  if (d.reset && sheetState) { sheetState[d.reset + 'Str'] = ''; sheetState.field = 'wt'; refreshSheet(); return; }
  if (d.neg && sheetState) {
    if (d.neg === 'mval') { sheetState.mvalStr = d.v; }
    if (d.neg === 'rate') { sheetState.rateStr = d.v; }
    refreshSheet(); return;
  }
  if (d.use) { S.feed[d.use].name = d.name; S.manual[d.use] = null; save(); render(); renderTop(); toast('Using ' + d.name + ' for ' + d.use); return; }
  if (d.editcat) { const c = CATS.find(x => x.id === d.editcat); openSheet({ kind: 'cat', cat: { ...c } }); return; }
  switch (d.act) {
    case 'close': closeSheet(); break;
    case 'add': { LIST.push(qLine(sheetState)); save(); closeSheet(); render(); toast('Added to list'); break; }
    case 'saveline': { const l = qLine(sheetState); if (l.wt > 0) LIST[sheetState.idx] = l; save(); closeSheet(); render(); break; }
    case 'delline': LIST.splice(sheetState.idx, 1); save(); closeSheet(); render(); break;
    case 'clear': LIST = []; save(); render(); toast('List cleared'); break;
    case 'share': share(); break;
    case 'addcat': openSheet({ kind: 'cat', isNew: true, cat: { id: 'c' + Date.now(), name: '', icon: '', metal: metalTab, purity: metalTab === 'gold' ? '22K' : '999', mtype: metalTab === 'gold' ? 'pct' : 'pg', mval: 10 } }); break;
    case 'savecat': {
      const c = sheetState.cat; c.name = $('cname').value.trim() || 'Item'; c.icon = $('cicon').value.trim();
      [c.metal, c.purity] = $('cpur').value.split('|'); c.mtype = $('cmtype').value; c.mval = parseFloat($('cmval').value) || 0;
      const i = CATS.findIndex(x => x.id === c.id); if (i >= 0) CATS[i] = c; else CATS.push(c);
      save(); closeSheet(); render(); break;
    }
    case 'delcat': CATS = CATS.filter(x => x.id !== sheetState.cat.id); save(); closeSheet(); render(); break;
    case 'resetcats': CATS = structuredClone(DEFAULT_CATS); save(); render(); toast('Items reset'); break;
  }
});
$('sheetBg').addEventListener('click', closeSheet);
document.addEventListener('toggle', e => { if (e.target.classList?.contains('negot') && sheetState) sheetState.negOpen = e.target.open; }, true);
document.addEventListener('input', e => {
  if (e.target.id === 'target' && sheetState) { sheetState.target = e.target.value; const pos = e.target.selectionStart; refreshSheet(); const t = $('target'); t.focus(); try { t.setSelectionRange(pos, pos); } catch (_) {} }
});
document.addEventListener('change', e => {
  const k = e.target.dataset.set; if (!k) return;
  let v = e.target.value;
  if (e.target.dataset.bool) v = v === '1';
  else if (e.target.type === 'number' || k === 'roundTo') v = v === '' ? null : parseFloat(v);
  const path = k.split('.'); let o = S; path.slice(0, -1).forEach(p => o = o[p]); o[path.at(-1)] = v ?? (k.startsWith('manual') ? null : 0);
  save(); renderTop(); render();
});

function share() {
  const T = listTotals();
  const lines = LIST.map((l, i) => { const p = price(l); return `${i + 1}. ${p.c.name} ${l.wt} g (${p.c.purity} @ ₹${p.rate.toLocaleString('en-IN')}/g)\n   Metal ${inr(p.metal)} + Making ${inr(p.making)}${S.gstOn ? ' + GST ' + inr(p.gst) : ''} = ${inr(p.total)}`; });
  const txt = `${S.shopName ? '*' + S.shopName + '*\n' : ''}Estimate · ${new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}\n\n${lines.join('\n')}\n\n*Total: ${inr(T.fin)}*${S.gstOn ? ' (incl. GST)' : ''}\nRates as of today; final price at time of purchase.`;
  if (navigator.share) navigator.share({ text: txt }).catch(() => {});
  else window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
}

// ---------- boot ----------
render(); renderTop(); connectFeed();
