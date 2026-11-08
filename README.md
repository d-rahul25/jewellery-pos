# Jewellery POS

Mobile web billing POS for small gold & silver shops. See [SPEC.md](SPEC.md).

## The app (v1)
Open https://d-rahul25.github.io/jewellery-pos/ on a phone (Chrome → "Add to Home screen").

- **Price**: tap an item, type the weight, see the final price (metal + making + GST). Add items to the customer's list.
- **List**: all quoted items, tap one to edit or negotiate (lower making, or lower rate, to hit the customer's price). Share on WhatsApp.
- **Rates**: live rates from the Vicky Gold feed, fetched on the phone. Pick which feed line drives gold/silver, set your own ₹/g or % adjustment, or a manual rate.
- **Settings**: shop name, GST, rounding, purity factors, items and making charges.

No build step: plain `index.html`, `style.css`, `app.js`, libraries in `lib/`. Data stays on the phone (localStorage).

`rate-test.html` is the original feed test page (rebuild with `rate-test/build.py <node_modules>`).
