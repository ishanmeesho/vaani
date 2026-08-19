# Vaani Dashboards

Static HTML analysis dashboards for Vaani, hosted via GitHub Pages at
https://ishanmeesho.github.io/vaani/

## Structure

- `index.html` — the landing page. Two tabs: **Dashboards** (a "Combined
  Views" block — synthesis reports that read across multiple dashboards —
  followed by four numbered sections: usage & outcomes, where/when Vaani is
  used, alternate discovery & revisits, understanding users) and **Product &
  Strategy Docs** (KRDs, notes and BHAGs imported from the team's planning
  doc, plus product notes written here). Tab state lives in the URL hash
  (`#dashboards` / `#docs`) and the search box filters only the active tab.
- `01-vaani-usage-and-outcomes/`, `02-where-and-when-vaani-is-used/`,
  `03-alternate-discovery-and-revisits/`, `04-understanding-vaani-users/` —
  one folder per numbered section, holding that section's dashboard files.
- `combined-views/` — cross-dashboard synthesis reports.
- `product-notes/` — product notes written here: what we could build,
  described so a developer gets a feel for the turn shape, the pieces, and the
  app capabilities each piece needs. These are proposals, not specs, and they
  lean on the dashboards for the problem rather than re-arguing it. They're
  listed in the shared `product-docs/` sidebar under "Product Notes" (as an
  external link) and on the landing page's "Product & Strategy Docs" tab, but
  kept in their own folder so the planning-doc import can't overwrite them.
- `product-docs/` — KRDs, product notes and BHAG docs imported from the
  team's shared planning doc, each with its own browse sidebar.

## Adding a new dashboard

(Same steps for a product note — drop it in `product-notes/` and add its card
to the `<ul class="grid">` list in the "Product & Strategy Docs" group.)

1. Drop the dashboard's HTML file into the folder for the section it belongs
   to (or create a new numbered folder if it's a new section).
2. Give the file a clean, descriptive, lowercase-hyphenated name — it becomes
   part of the public URL.
3. Add a `<link>` card for it in `index.html`, inside the right section's
   `<ul class="grid">`, following the existing `doc-name` / `doc-desc` /
   `doc-date` pattern. `doc-date` is optional — use it for the data window or
   compile date if the report states one.
4. Every dashboard page gets a fixed "← Vaani Dashboards" banner injected at
   the top, linking back to `../index.html`. If the file doesn't already have
   one, add right after the opening `<body>` tag:

   ```html
   <body style="padding-top:38px;"><div style="position:fixed;top:0;left:0;right:0;height:38px;z-index:2147483647;display:flex;align-items:center;padding:0 16px;background:#111827;box-shadow:0 1px 3px rgba(0,0,0,0.2);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><a href="../index.html" style="display:inline-flex;align-items:center;gap:6px;color:#fff;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.01em;"><span style="font-size:14px;line-height:1;">&larr;</span>Vaani Dashboards</a></div>
   ```

   (Adjust the `../` prefix if the file sits more than one folder deep.)
5. Commit and push to `main` — GitHub Pages rebuilds automatically within a
   minute or two.

## Notes

- Dashboards are independent, self-contained HTML files — each may bring its
  own theme, fonts, and charting approach. The landing page and the injected
  back-link banner are the only shared/consistent layer across all of them.
- Keep dashboards self-contained (inline CSS/JS or CDN `<script>`/`<link>`
  tags are fine on GitHub Pages — this is not the same environment as a
  Claude Artifact, which blocks external requests).
