(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const KEY = 'talor40_admin';
  let password = '';

  function store(value) {
    try {
      if (value) sessionStorage.setItem(KEY, value);
      else sessionStorage.removeItem(KEY);
    } catch (e) { /* גלישה פרטית – פשוט לא זוכרים */ }
  }
  function load() {
    try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    password = $('pw').value;
    $('loginError').textContent = '';
    $('btnLogin').disabled = true;
    $('btnLogin').textContent = 'בודקים…';
    try {
      await refresh();
      store(password);
      $('pw').value = '';
    } catch (err) {
      $('loginError').textContent = err.message;
    } finally {
      $('btnLogin').disabled = false;
      $('btnLogin').textContent = 'כניסה';
    }
  });

  $('btnLogout').addEventListener('click', logout);
  $('btnRefresh').addEventListener('click', async () => {
    busy('מרעננים…');
    try { await refresh(); } catch (err) { showError(err); } finally { busy(''); }
  });

  /** שכבת טעינה על כל המסך. טקסט ריק = הסתרה. */
  function busy(text) {
    $('busyText').textContent = text || '';
    $('busy').hidden = !text;
  }

  function logout() {
    password = '';
    store('');
    $('dash').hidden = true;
    $('login').hidden = false;
  }

  function showError(err) {
    if (err && err.code === 'auth') {
      logout();
      $('loginError').textContent = err.message;
      return;
    }
    $('dashStatus').textContent = err.message;
  }

  async function refresh() {
    $('dashStatus').textContent = 'טוענים…';
    const data = await callApi('admin_list', { password });
    $('login').hidden = true;
    $('dash').hidden = false;
    $('dashStatus').textContent = '';
    render(data);
  }

  function render(data) {
    const all = data.greetings;
    const hidden = all.filter((g) => g.hidden).length;
    const kindCount = (k) => all.filter((g) => (g.kind || 'greeting') === k).length;
    const greetings = all.filter((g) => (g.kind || 'greeting') === 'greeting');
    const images = greetings.filter((g) => g.type === 'image').length;
    const videos = greetings.filter((g) => g.type === 'video').length;
    const guests = data.guests;
    const sentGuests = guests.filter((g) => g.sent).length;

    const stats = $('stats');
    stats.textContent = '';
    [
      [greetings.length, 'ברכות'],
      [images, 'ברכות עם תמונה'],
      [videos, 'ברכות עם סרטון'],
      [kindCount('past_photo'), 'תמונות מהעבר'],
      [kindCount('love') + ' / 40', 'דברים שאוהבים'],
      [kindCount('trivia'), 'שאלות טריוויה'],
      [hidden, 'מוסתרים'],
      [all.length + ' / ' + data.maxGreetings, 'סה"כ פריטים'],
      [guests.length ? `${sentGuests} / ${guests.length}` : '–', 'מוזמנים ששלחו']
    ].forEach(([num, label]) => {
      const box = el('div', 'stat');
      box.appendChild(el('span', 'stat-num', String(num)));
      box.appendChild(el('span', 'stat-lbl', label));
      stats.appendChild(box);
    });
    const opens = el('p', 'hint', data.isOpen
      ? 'הברכות פתוחות לצפייה.'
      : `הברכות נעולות. ייפתחו ${data.opensAtLabel}.`);
    stats.appendChild(opens);

    // מי עוד לא שלח
    const pending = guests.filter((g) => !g.sent);
    $('pendingTitle').textContent = `מי עוד לא שלח (${pending.length})`;
    fillList($('pendingList'), pending.map((g) => g.phone ? `${g.name} · ${g.phone}` : g.name),
      guests.length ? 'כולם שלחו!' : 'רשימת המוזמנים ריקה. ממלאים אותה בלשונית "מוזמנים" בגיליון.');

    // שמות לא מזוהים
    const unmatched = [...new Set(all.filter((g) => g.inGuestList === 'לבדוק').map((g) => g.name))];
    $('unmatchedTitle').textContent = `שמות שלא נמצאו ברשימת המוזמנים (${unmatched.length})`;
    fillList($('unmatchedList'), unmatched, 'אין.');

    // ברכות
    const list = $('list');
    list.textContent = '';
    if (!all.length) list.appendChild(el('p', 'status', 'עוד אין כלום.'));
    all.forEach((g) => list.appendChild(card(g)));
  }

  function fillList(ul, items, emptyText) {
    ul.textContent = '';
    if (!items.length) {
      ul.appendChild(el('li', 'muted', emptyText));
      return;
    }
    items.forEach((t) => ul.appendChild(el('li', '', t)));
  }

  const TYPE_LABEL = { text: 'טקסט', image: 'תמונה', video: 'סרטון' };
  const KIND_LABEL = { greeting: 'ברכה', past_photo: 'תמונה מהעבר', love: 'דבר שאוהבים', trivia: 'טריוויה' };

  function card(g) {
    const c = el('article', 'acard' + (g.hidden ? ' is-hidden' : ''));

    if (g.fileId) {
      const media = el('a', 'athumb');
      media.href = `https://drive.google.com/file/d/${encodeURIComponent(g.fileId)}/view`;
      media.target = '_blank';
      media.rel = 'noopener';
      media.title = 'פתיחה ב-Drive';
      if (g.thumb) {
        const img = el('img');
        img.src = g.thumb;
        img.alt = '';
        media.appendChild(img);
      } else {
        media.appendChild(el('span', 'athumb-icon', g.type === 'video' ? 'סרטון' : 'תמונה'));
      }
      if (g.type === 'video') media.appendChild(el('span', 'play-badge', '▶'));
      c.appendChild(media);
    }

    const body = el('div', 'abody');
    const head = el('div', 'ahead');
    head.appendChild(el('strong', '', g.name));
    const kind = g.kind || 'greeting';
    head.appendChild(el('span', 'tag kind', KIND_LABEL[kind] || kind));
    if (kind === 'greeting') head.appendChild(el('span', 'tag', TYPE_LABEL[g.type] || g.type));
    if (g.era) head.appendChild(el('span', 'tag', g.era));
    if (g.hidden) head.appendChild(el('span', 'tag warn', 'מוסתרת'));
    if (g.inGuestList === 'לבדוק') head.appendChild(el('span', 'tag', 'לא ברשימה'));
    body.appendChild(head);

    const meta = formatTimestamp(g.timestamp) + (g.size ? ` · ${(g.size / 1048576).toFixed(1)}MB` : '');
    body.appendChild(el('p', 'ameta', meta));
    if (g.message) body.appendChild(el('p', 'amessage', g.message));
    if (g.caption) body.appendChild(el('p', 'amessage', 'כיתוב: ' + g.caption));
    if (g.trivia && g.trivia.answers) {
      const ol = el('ol', 'atrivia');
      g.trivia.answers.forEach((a, i) => {
        const correct = i === Number(g.trivia.correct);
        ol.appendChild(el('li', correct ? 'correct' : '', a + (correct ? ' ✓' : '')));
      });
      body.appendChild(ol);
    }

    const actions = el('div', 'actions');
    const toggle = el('button', 'btn ghost small', g.hidden ? 'הצגה' : 'הסתרה');
    toggle.type = 'button';
    toggle.addEventListener('click', () => act(toggle, 'admin_hide', { id: g.id, hidden: !g.hidden },
      g.hidden ? 'מציגים…' : 'מסתירים…'));
    const del = el('button', 'btn danger small', 'מחיקה');
    del.type = 'button';
    del.addEventListener('click', () => {
      const label = KIND_LABEL[kind] || 'ברכה';
      const what = g.fileId ? 'הפריט והקובץ שלו יימחקו' : 'הפריט יימחק';
      if (confirm(`למחוק (${label}) של ${g.name}?\n${what} לצמיתות.`)) act(del, 'admin_delete', { id: g.id }, 'מוחקים…');
    });
    actions.appendChild(toggle);
    actions.appendChild(del);
    body.appendChild(actions);

    c.appendChild(body);
    return c;
  }

  async function act(button, action, payload, text) {
    button.disabled = true;
    busy(text);
    try {
      await callApi(action, Object.assign({ password }, payload));
      busy('מעדכנים את הרשימה…');
      await refresh();
    } catch (err) {
      button.disabled = false;
      showError(err);
    } finally {
      busy('');
    }
  }

  /* תצוגה מקדימה: האתר עצמו במצב מנהל (משתמש בסיסמה שנשמרה בלשונית) */
  $('btnPreview').addEventListener('click', () => { location.href = 'index.html?preview'; });

  // כניסה אוטומטית אם הסיסמה כבר נשמרה בלשונית הזו
  password = load();
  if (password) refresh().catch((err) => { logout(); $('loginError').textContent = err.message; });
})();
