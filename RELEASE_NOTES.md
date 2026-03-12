# FlowShield Desktop — v2.3.0 (Category Sync & Normalization)

## What's New

### Server-Synced Activity Categorization
The desktop app now fetches your category rules from the server (`GET /api/categories`) and uses them to classify every activity window — the same rules that power the web dashboard. Rules sync at login and refresh every 24 hours automatically, with SQLite cache as offline fallback.

- **45 global rules** covering Development, Work, Communication, Entertainment, Social Media, Creative, Study, and Browsing — loaded from the server on first login
- **User corrections** made on the web app (e.g. "reclassify Slack as Work") now also apply on the desktop within 24 hours
- Rules match on `processName`, `windowTitle`, or both — same fields as the web

### Expanded Category Set
Desktop now recognizes three new categories to match the web:
- **Work** — Office apps, Notion, productivity tools (previously reported as "Productivity")
- **Creative** — Figma, Photoshop, Illustrator, Canva, Sketch
- **Study** — Anki, Coursera, Udemy, Khan Academy, Duolingo

### Correct Category Names in Sync Payload
Activity logs synced to the server now use web-compatible category names:
- `"Productivity"` → `"Work"`
- `"Social"` → `"Social Media"`

This fixes a mismatch where desktop-synced activities appeared uncategorized on the web analytics page.

## Upgrade Notes
- No manual action required — category rules sync automatically on first launch after update
- Existing activity logs are not re-categorized; only new logs use the synced rules

## Download
The installer and portable zip are attached below.
