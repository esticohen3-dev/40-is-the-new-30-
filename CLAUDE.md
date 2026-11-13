# CLAUDE.md

Greeting page for Talor's 40th birthday. Full spec (Hebrew): see README.md.

## Architecture
- Static frontend (plain HTML/CSS/JS, no framework, no build step) on GitHub Pages.
- Backend: `apps-script/Code.gs`, deployed as a Google Apps Script Web App, bound to a Google Sheet deliberately named `פרויקט עבודה` (it is a surprise; keep names in Drive/GitHub neutral). Files go to a private Drive folder.
- All requests are `POST` with `Content-Type: text/plain` and a JSON body `{action, ...}` (avoids CORS preflight, which Apps Script can't answer). Actions: `submit`, `list`, `admin_list`, `admin_hide`, `admin_delete`.

## Rules
- UI text is Hebrew, RTL, mobile-first. Keep wording gender-neutral (plural imperative) for guests.
- Greetings must never reach the browser before the birthday: `list` enforces the date server-side. Client-side countdown is cosmetic.
- Never put secrets in frontend files (repo is public). Admin password lives only in Script Properties and is sent in the POST body.
- Render user content with `textContent`, never `innerHTML`.
- Limits live in two places and must match: `config.js` (client) and `CONFIG` in `Code.gs` (server).
- Do not use XHR upload progress events: they force a CORS preflight that Apps Script rejects.
- `Code.gs` changes only take effect after the owner publishes a new deployment version.

## Testing
No test suite. `node --check` each JS file (copy `Code.gs` to a `.js` to check it). Browser flows can be smoke-tested with Playwright by serving the folder locally and routing the Web App URL to a mock.

## Status (Nov 2026)
Done: Sheet + Apps Script set up and deployed (URL in config.js), site live on GitHub Pages, test greeting sent, admin page works, secret 5-tap entry on the "40" badge works.
Next: fill the guests tab; phone tests (image, short video, >30s video blocked, unlock check via BIRTHDAY_DATE override); delete test greetings; send link to guests.
Changes to Code.gs need the owner to paste it into Apps Script and publish a new deployment version.
