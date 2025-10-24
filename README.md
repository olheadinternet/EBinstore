# EggBot Ornament Builder

This is a small static UI to build 360×120mm SVG ornaments for the EggBot.

Features
- Lists SVG drawings stored in the `Drawings/` folder and makes them selectable.
- Loads single-stroke SVG fonts stored in the `Fonts/` folder (SVG font format with `<font>` and `<glyph unicode="">`).
- Lets you type a short message and renders it using glyph paths from the chosen SVG font.
- Centers the left drawing at x=90mm and centers the rendered text block at x=270mm.
- Preview and download single-file SVG output (360mm × 120mm).

How it finds assets
- The web UI uses the GitHub Contents API to list files in `Drawings/` and `Fonts/` for this repository (owner/repo configured in `app.js`).
- If you host this on GitHub Pages for this repo the client-side API calls will populate automatically when you add files to those folders.

Adding drawings and fonts
- Drawings: place full SVGs sized to 360×120mm (or with viewBox `0 0 360 120`) into `Drawings/` and push to `main`. The UI will show them as options.
- Fonts: provide SVG fonts that include a `<font>` element and `<glyph unicode=... d="...">` definitions inside the root SVG (many converted SVG fonts follow this format). Put them into `Fonts/`.

Notes & limitations
- The font renderer implemented here is a basic glyph-to-path assembler. It reads `unicode`, `d` and `horiz-adv-x` attributes from `<glyph>` entries to compose the string. It uses a simple scale from font units to mm. Complex kerning or diacritic placement isn't implemented yet.
- For private repos or if you prefer not to call the GitHub API from the browser, add an `assets/manifest.json` listing files and the UI will still work (future improvement).

Next steps (I can implement these for you)
- Improve vertical alignment using font ascent/descent more precisely.
- Support additional font packaging styles (single glyph-per-file, symbols, etc.).
- Add an asset manifest generation script that you can run locally to update `assets/manifest.json` automatically.
- Wire up a nicer preview with zoom and toggles for stroke color/width.
# EBinstore