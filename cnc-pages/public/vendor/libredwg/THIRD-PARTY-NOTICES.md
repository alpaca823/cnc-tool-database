# LibreDWG browser conversion program

The embedded, separately running DWG-to-DXF worker uses @mlightcad/libredwg-web 0.8.8, by MLight Lee and the LibreDWG contributors, licensed under GNU GPL version 3 (or later for LibreDWG). Its interface exchanges DWG file bytes and DXF file text with the stock UI. No files are uploaded to a conversion service.

- Upstream: https://github.com/mlightcad/libredwg-web/tree/26f9929134c88d6058bd48d201efebe638e21d89 (v0.8.8).
- The complete corresponding upstream source is included as source-v0.8.8.tar.gz, with build instructions in bindings/javascript and upstream README files.
- License text: COPYING in the same directory.
- The glue and compressed WASM binary come from the pinned npm 0.8.8 distribution. The application build embeds them. To run in a classic disposable worker, the build replaces import.meta.url with a fixed label and removes the ESM export. dwg-worker.js supplies the file-to-file wrapper, licensed GPL-3.0-or-later; its source is included with this notice. No WASM binary changes were made.
- Decompressed WASM SHA256: 8f8dbfe1ba3a0ae9ceb8856ed2090c0f44decd9d7febde68016df8c1fca50f9b.

The original DWG file is never modified. The converter is provided without warranty. Malformed, newer, or unsupported DWG files may require export to ASCII DXF. Conversion is limited to 30 seconds and cancelled when another file is selected or the admin signs out.
