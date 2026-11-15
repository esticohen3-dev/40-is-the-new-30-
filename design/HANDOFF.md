# Design handoff: Talor 40 redesign

Source of truth: the `.dc.html` mockups in this folder (one per screen, 390px phone width).
Open them as plain HTML to see the layout; ignore `<x-dc>`, `{{accent}}` and the `<script type="text/x-dc">` block (design-tool wrapper). `{{accent}}` = `#469F76`.
Text in `[brackets]` is placeholder for real data.

Keep every rule in `CLAUDE.md` (no framework, Hebrew RTL, `textContent` only, server-side date lock, limits in `config.js` + `Code.gs` must match, no XHR progress events).

## 1. Design tokens (put in `:root` in `styles.css`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F5F7F2` | page background (off-white) |
| `--surface` | `#FFFFFF` | cards |
| `--border` | `#E3E9E1` | card borders, 1px |
| `--input-border` | `#DCE5DD` | inputs, 1.5px |
| `--ink` | `#1E3328` | main text (soft dark green, no black anywhere) |
| `--muted` | `#5A6E62` | secondary text |
| `--accent` | `#469F76` | primary buttons, active chips, progress, step 1 badge |
| `--on-accent` | `#1E3328` | text/icons on accent (use only at 18px+ bold; for small text on accent use `--mint` background instead) |
| `--mint` | `#E3F2E7` | soft panels, inactive step badges, icon tiles |
| `--mint-2` | `#CDE8D6` | media placeholders, decorative "40" |
| `--deep` | `#2F6B3F` | green text/icons on mint |
| `--dashed` | `#B8C7BD` | dashed upload boxes |

Fonts (Google Fonts): **Rubik** 700/800 for headings, numbers and buttons; **Heebo** 400/500/700 for body. Replace the current Heebo-only setup.
Radii: cards 24-28px, inputs 16px, buttons 22px, chips 999px. Spacing: 16px page gutter, 16px gap between blocks.
Touch targets at least 44px. Primary button height 64px.
No emoji in UI (remove the 💛 in the current wall title). Icons: inline stroke SVG.

## 2. Information architecture

Before the birthday (guests): **Home → Step 1 (greeting) → Step 2 (optional extras) → Thanks.** Nothing else is reachable.
From the birthday (Talor): **Wall** with links to **40 שנה בתמונות**, **40 דברים שאוהבים**, **טריוויה**.
No slideshow. Everything is viewed on the phone.

## 3. Screens

### Home (`Main.dc.html`)
1. Top bar: `טלאור/40` + date chip `5.2.2027`.
2. Hero card: **photo of Talor** (300px tall, rounded 20px), badge `טלאור בן 40!` on the photo, H1 `בואו נפתיע את טלאור ליום הולדת 40`, one paragraph explaining it's a secret collection revealed on the birthday. Photo file goes in the repo as `img/talor.jpg` (owner supplies it; keep filename neutral).
3. One primary CTA: `כתבו ברכה לטלאור` + sub-line `לוקח בערך 2 דקות` → opens Step 1.
4. "איך זה עובד" card with 3 numbered steps (copy in mockup).
5. Countdown panel (mint), 4 white boxes: ימים / שעות / דקות / שניות.
6. Lock line: `זו הפתעה: אל תספרו לטלאור ואל תשלחו לו את הקישור.`
7. The secret 5-tap admin entry moves from the "40" badge to the `טלאור/40` logo in the top bar.

On/after the birthday, Home shows the Wall instead (same logic as today).

### Step 1: greeting (`Form.dc.html`)
- Header: back button + `שלב 1 מתוך 2` + 2-segment progress bar.
- H1 `הברכה שלכם לטלאור`, sub `רק השם חובה. כתבו מה שבא מהלב.`
- Fields: name (required, 40), message (500, live counter), photo/video (optional; existing limits and video-duration check stay).
- Button `המשך` → Step 2. Validation as today (name + message or file).
- The greeting is **not** sent yet; it is sent together with extras at the end of Step 2.

### Step 2: extras (`Extras.dc.html`)
- Header `שלב 2 מתוך 2 · לא חובה`, both progress segments filled.
- H1 `רוצים לתת לטלאור עוד משהו?`, sub `כל אחד לוקח פחות מדקה. אפשר לבחור אחד, כמה, או לדלג.`
- Three expandable cards (collapsed = icon + title + subtitle + plus; expanded = accent border + fields):
  1. **תמונה מהעבר**: required era chip (single choice): `ילדות`, `תיכון`, `צבא`, `לימודים`, `שנות ה-20`, `שנות ה-30`; image picker (images only, same 10MB limit); optional caption (100 chars).
  2. **משהו שאתם אוהבים בטלאור**: one text field (150 chars). Subtitle shows `כבר נאספו N מתוך 40` (count only, from server).
  3. **שאלת טריוויה על טלאור**: question (150), 4 answers (60 each), radio to mark the correct one.
- Primary `שליחה לטלאור` sends everything; text link `דלגו ושלחו רק את הברכה` sends only the greeting.
- Show one progress state while uploading (no XHR progress events).

### Thanks (`Thanks.dc.html`)
- Check icon in accent circle, `תודה! נשמר`, `טלאור יראה את הברכה שלכם ב-5 בפברואר 2027.`
- Mint note about keeping the secret and sharing with other friends (not Talor).
- `שיתוף הקישור לחברים` uses `navigator.share` with the site URL, fallback copy-to-clipboard + toast.
- Secondary `להוסיף עוד משהו` → Step 2 again (same name prefilled, no new greeting required).

### Wall (`Wall.dc.html`), birthday only
- Mint hero `מזל טוב טלאור!` + `N ברכות ממי שאוהבים אותך`.
- 3 link tiles: 40 שנה בתמונות / 40 דברים שאוהבים / טריוויה.
- Filter chips: הכל / תמונות / סרטונים.
- 2-column masonry of greeting cards: text card (white), photo card (image on top), video card (mint, play button), every ~4th text card on accent background.

### 40 שנה בתמונות (`Timeline.dc.html`)
- Chips: הכל + the 6 eras. Vertical line with one section per era in the fixed order above; 2-column photo grid; caption + sender name on each photo. Empty era: dashed box `עוד אין תמונות מהתקופה הזו` (or hide empty eras; owner's choice).

### 40 דברים שאוהבים (`Forty.dc.html`)
- Mint header with big count `N מתוך 40` and a 40-dot progress grid (filled dots = accent).
- Numbered list `01..40` with text + sender name.
- Before the birthday, Step 2 only shows the count; the list content is birthday-only.
- If more than 40 arrive, show them all (numbering continues).

### טריוויה (`Trivia.dc.html`)
- One question per screen: progress segments, `נשאל ע״י [שם]`, question, 4 answer buttons. Tap → correct turns accent with check, wrong turns red-ish outline; then `לשאלה הבאה`.
- End screen: score `X מתוך N`.

## 4. Backend changes (`apps-script/Code.gs`)

- Add columns to the greetings sheet (append at the end, don't reorder): `kind` (`greeting` | `past_photo` | `love` | `trivia`), `era`, `caption`, `trivia_json` (question, answers[4], correct index), `group_id` (links items sent in one submit).
- `submit` accepts `{name, message, file, extras: {pastPhoto?: {era, caption, file}, love?: string, trivia?: {question, answers, correct}}}` and writes one row per item, same `group_id`. Validate era against the 6 allowed values, lengths, and `correct` in 0..3.
- New public action `counts` (allowed before the birthday) returns only `{loveCount}`. No content.
- `list` (birthday-locked, unchanged rule) returns items with `kind`, `era`, `caption`, trivia fields.
- Admin page: show `kind` and `era` columns; hide/delete works per row.
- Mirror every new limit in `config.js`.
- Remind the owner: paste `Code.gs` into Apps Script and publish a **new deployment version**.

## 5. Copy to keep exactly
Use the Hebrew strings in the mockups as-is (gender-neutral plural). Countdown, error messages and existing toasts keep their current wording.

## 6. Test checklist
- `node --check` all JS (copy `Code.gs` to `.js`).
- Playwright smoke test at 390px: Home → Step 1 → Step 2 (each extra) → Thanks, with the Web App URL routed to a mock.
- `list` returns locked before `BIRTHDAY_DATE`; `counts` returns only a number.
- Override `BIRTHDAY_DATE` to the past and check Wall, Timeline, Forty, Trivia.
