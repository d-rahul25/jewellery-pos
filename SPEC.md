# Jewellery Billing POS — Product Spec (v0.1 draft)

**Platform:** Mobile web (PWA, installable, works offline). Android app later (wrap the PWA via TWA/Capacitor).
**User:** Owner / counter staff of a small gold & silver shop. One phone, one hand, customer waiting.
**Core promise:** *Weigh it → type the weight → see the final price in under 5 seconds.*

---

## 1. Problem

| Pain today | What the app does |
|---|---|
| Customer asks price of item 1, item 2, item 3… shopkeeper recalculates each one | Pick category + type weight → instant price; keep a running list for the customer |
| Rate × weight + making charge done mentally/calculator, error-prone | Formula is built-in per category |
| Making charge differs (gold = % of value, silver = ₹/gram) | Per-category making rules, editable defaults |
| Customer bargains below today's rate → making charge has to be juggled | "Negotiate" mode: enter target price, app back-calculates rate or making |
| Inventory apps are too heavy | **No inventory.** Only a category list (catalog of item *types*, not stock) |

## 2. Non-goals (v1)
- No stock / inventory tracking, no barcode/tagging.
- No accounting ledger, no multi-store.
- No customer accounts / login required for the shopkeeper's customers.

---

## 3. Key concepts

### 3.1 Metals & daily rates
| Metal | Purity options | Rate unit |
|---|---|---|
| Gold | 24K (999), 22K (916), 18K (750) | ₹ per gram (shop may enter per 10 g; app converts) |
| Silver | 999 / Fine, Sterling (925), "Old/Mixed" | ₹ per gram (shop may enter per kg; app converts) |

- **Today's Rate** screen is the first thing shown each day if the rate is stale (> 12 h or a new calendar day).
- Source: manual entry (default, 1 tap per metal). **Optional "Fetch from JK Sons"** button — see §8.
- Keep a rate history (date, metal, purity, rate) for reference on old bills.

### 3.2 Categories (item types, not inventory)
Pre-seeded, editable, re-orderable. Each category has an icon/emoji, metal, default purity and a making-charge rule.

**Silver (default making ₹10/g):** Payal, Bichhiya (toe ring), Glass, Katori, Lota, Thali, Chammach, Machhli (Fish), Coin, Murti, Kada, Chain, Other
**Gold (default making 10%):** Nose pin, Ear rings / Tops, Ring, Pendant, Chain, Bangles, Mangalsutra, Coin, Other

Shop can add its own (e.g. "Payal – heavy" with ₹12/g).

### 3.3 Making charge rules
Each category picks one rule type:

| Rule type | Formula | Typical use |
|---|---|---|
| `PERCENT` | making = metal value × p% | Gold (10%) |
| `PER_GRAM` | making = net weight × ₹x | Silver (₹10/g) |
| `FLAT` | making = ₹x per piece | Small items, coins, nose pins |
| `MIN_OF` / floor | max(rule, minimum ₹) | "at least ₹100 making" on tiny items |

Making can be overridden per line item at billing time (one tap: −/+ or type value).

---

## 4. Price formula (per line item)

```
net_weight      = gross_weight − stone/bead weight (default 0)
metal_value     = net_weight × rate_per_gram(metal, purity)
making          = rule(category) applied            (overridable)
extras          = stone/kundan charge + hallmark/HUID charge (optional, ₹)
line_subtotal   = metal_value + making + extras
GST             = 3% on (metal_value + making) [+ 5% on making if shop separates job-work]  (toggle; default ON 3% total)
line_total      = line_subtotal + GST
```
Bill level: sum of lines − discount − old-gold/silver exchange (v2) → round off to nearest ₹1 / ₹10 (setting).

Weights in grams with 3 decimals (e.g. 4.235 g). Silver large items may be typed in kg-style — app accepts `1.2k` → 1200 g.

---

## 5. Negotiation mode (the bargaining helper)

Customer: "Give it for ₹6,000." The shopkeeper taps **Negotiate** on a line and enters the target. The app shows three ways to get there and the shopkeeper picks one:

| Option | What changes | Shown as |
|---|---|---|
| A. Reduce making | Keep today's rate, shrink making | "Making ₹420 → ₹180 (4.2%)" |
| B. Reduce rate | Keep making rule, lower effective rate | "Rate ₹7,450/g → ₹7,310/g" |
| C. Split | Lower rate to a chosen value, absorb rest in making | slider |

Guardrails (settings): minimum rate floor per metal, minimum making floor. If the target is below the floor the app shows it in red with the shortfall — **it never silently goes below cost**. Also shows "you earn ₹X making on this" so the owner sees margin at a glance (hidden in customer-facing view).

Reverse direction too: **"Customer wants rate ₹X"** → app raises making so final price stays the same (common trick: quote lower rate, recover in making).

---

## 6. Screens

1. **Home / Quick Price** (default screen)
   - Top bar: today's Gold 22K / Silver rates (tap to edit).
   - Grid of category tiles (big, emoji + name), Gold / Silver tabs.
   - Tap tile → numeric keypad for weight → price shows live as you type with breakdown (metal · making · GST).
   - "Add to list" → keeps a running list for the customer (item 1, item 2…). This is the "customer is asking about many items" flow — no bill needed.
2. **Customer List / Estimate**
   - All quoted items, totals, per-line negotiate/edit/delete.
   - Actions: **Share estimate on WhatsApp** (text or image), **Convert to Bill**, Clear.
3. **Bill**
   - Optional customer name + phone, payment mode (cash/UPI/card/split), bill number auto.
   - Output: share as PDF/image on WhatsApp, print via Bluetooth thermal printer (58/80 mm, v1.5), or just save.
4. **Rate Card** — auto-generated price chart for common weights (e.g. payal 20 g, 30 g, 50 g; ring 2 g, 3 g, 4 g) to show/share with customers or stick on the counter.
5. **Today's Rates** — enter/fetch rates, history.
6. **Settings** — shop name/address/GSTIN/logo, categories & making rules, GST toggle, rounding, floors, PIN lock for owner-only fields (margins, floors).
7. **History** — past bills & estimates, search by name/phone/date, daily total sold.

### UX rules
- Big touch targets (≥ 48 px), works one-handed, custom numeric keypad (no OS keyboard pop).
- Hindi + English labels (Hinglish names like "Payal", "Katori" as-is). Indian number format (₹1,23,456).
- Works fully offline; nothing blocks on network.
- **Customer view toggle** — hides margin/floor info when the phone is turned toward the customer.

---

## 7. Data model (local-first)

```
Rate        { id, date, metal, purity, perGram, source: manual|fetched }
Category    { id, name, nameHi, emoji, metal, purity, makingType, makingValue, minMaking, sortOrder, active }
LineItem    { id, categoryId, grossWt, stoneWt, rateUsed, makingType, makingValue, extras, gstPct, total, note }
Estimate    { id, createdAt, customerName?, phone?, lines[], status: open|billed }
Bill        { id, billNo, createdAt, customer, lines[], discount, roundOff, gst, total, payments[] }
Settings    { shop, gstOn, rounding, floors{gold,silver}, pinHash, language }
```
Storage: IndexedDB on device. **Backup:** export/import JSON + optional Google Drive backup (v1.5). Cloud sync only when Android/multi-device is planned.

---

## 8. Live rates from jksons.co.in

- The site can't be called directly from the browser (CORS, and it's an HTML page, not an API).
- **Finding (8 Nov 2026):** from a cloud server, the network path to www.jksons.co.in opens, but the JK Sons server drops the connection during the HTTPS handshake every time. It probably blocks non-Indian or datacenter IPs. A cloud scraper (Cloudflare Worker etc.) could hit the same wall, so this needs testing from an Indian host before we commit to it.
- Plan: a tiny serverless function fetches the page every ~15 min, parses gold/silver rates and returns JSON. The app shows the fetched value as a *suggestion*, and the shopkeeper taps "Use". **The shop's own rate always wins** (most shops charge a little above or below the board rate).
- **Decision (8 Nov 2026): automatic rate fetch is a core v1 feature.** It runs on the shopkeeper's phone, which can reach these sites. Shop rate = fetched rate + the shop's own adjustment (₹ or %), applied automatically. Manual entry is only the fallback when the feed is down.
- Fallback if scraping breaks: manual entry (always available).

### 8.1 vickygold.in (checked 8 Nov 2026)
- The page itself is an empty shell. The rates come from a **live Socket.IO feed** at `vickygold.co.in:10001`, room `vickygold`, events `mainProduct` / `refProduct`. Each message is raw-deflate compressed JSON, unpacked in the page with pako `inflateRaw`. The rate cards show symbol name, selling (ask) rate, low and high, with labels such as "Silver 999 (incl GST+TCS)". There's also a spot table (bid/ask/high/low for XAUUSD, XAGUSD and INR) and a futures/next section.
- This is the typical "live rate display" software that Indian bullion dealers use. Reading it is easy once connected: no HTML scraping, just JSON.
- From our cloud sandbox the feed server reset the connection, the same way JK Sons did. It has to be tested from an Indian connection or the phone itself.
- **Permission:** this is the dealer's private feed, not a public API. Before the app uses it, ask the bullion dealer (whoever the shop buys from) for permission or an official feed.


---

## 9. Tech stack (proposal)

| Layer | Choice | Why |
|---|---|---|
| UI | React + Vite + TypeScript, Tailwind | Fast, small, easy to port to Capacitor |
| Offline | PWA (service worker, manifest) | Install on home screen, no Play Store yet |
| Storage | IndexedDB via Dexie | Simple, reliable on Android Chrome |
| Share / PDF | Web Share API + html-to-image / jsPDF | WhatsApp sharing is the #1 output |
| Rates proxy | Cloudflare Worker (free tier) | Zero server maintenance |
| Android later | Capacitor wrap | Reuse 100% code, adds Bluetooth printer access |

All money math in integer paise; weights in milligrams — no floating-point rounding bugs.

---

## 10. Phases

| Phase | Scope |
|---|---|
| **v1 (MVP)** | Live rate fetch on the phone (+ shop adjustment, manual fallback), categories with making rules, Quick Price, customer list, negotiation mode, WhatsApp share of estimate, bill with PDF, settings, offline PWA |
| **v1.5** | Rate card, Indian-hosted rate relay (if needed), bill history & daily totals, Drive backup, Hindi UI |
| **v2** | Old gold/silver exchange (purity %, deduction), Bluetooth thermal print, Android app, multi-staff with PIN |

## 11. Acceptance checks (MVP)
- Silver Payal, 32.450 g @ ₹95/g, making ₹10/g, GST 3% → metal ₹3,082.75 + making ₹324.50 = ₹3,407.25 + GST ₹102.22 = **₹3,509** (rounded).
- Gold Ring 22K, 3.210 g @ ₹7,400/g, making 10% → metal ₹23,754 + making ₹2,375.40 = ₹26,129.40 + GST ₹783.88 = **₹26,913**.
- Negotiate the ring to ₹25,500 → Option A shows making ≈ ₹1,003 (4.2%); Option B shows effective rate ≈ ₹7,011/g.
- App opens and prices items with airplane mode on.

---

## 12. Open questions for the shop owner
1. **GST:** Is GST charged on every bill, or only when the customer asks for a pakka bill? Shown inside the price or added on top?
2. **Stone weight:** Do you deduct stone/bead/lac weight (net vs gross) — mainly for payal, bangles, kundan?
3. **Wastage:** Do you ever charge "wastage/touch %" separately from making, or is it all inside making?
4. **Hallmark/HUID charge:** Add ₹45–₹50 per piece separately, or absorbed?
5. **Rate unit:** Do you think in ₹/10 g for gold and ₹/kg for silver? (We'll show both.)
6. **Old gold/silver exchange:** How common? Needed in MVP?
7. **Printer:** Do you have a thermal printer, or is WhatsApp share enough for now?
8. **Rounding:** Round final price to ₹1, ₹10, or ₹50?
