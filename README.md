# Jewellery POS

Mobile web billing POS for small gold & silver shops. See [SPEC.md](SPEC.md).

## Live rate test
`index.html` (published via GitHub Pages) connects from the visitor's phone to the Vicky Gold live rate feed and shows gold/silver rates. It proves rates can be fetched on the phone.

Rebuild after editing `rate-test/template.html`:
```
npm i socket.io-client@4.7.5 pako@2.1.0   # then run rate-test/build.py
```
