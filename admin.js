(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  // הסיסמה נשמרת רק בזיכרון של הדף: כל כניסה לדף הניהול דורשת סיסמה.
  // מנקים שארית מגרסה קודמת שזכרה את הסיסמה בלשונית.
  try { sessionStorage.removeItem('talor40_admin'); } catch (e) { /* אין גישה – לא נורא */ }
  let password = '';

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    password = $('pw').value;
    $('loginError').textContent = '';
    $('btnLogin').disabled = true;
    $('btnLogin').textContent = 'בודקים…';
    try {
      await refresh();
      $('pw').value = '';
    } catch (err) {
      password = '';
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
    const pw = password;
    const data = await callApi('admin_list', { password: pw });
    // תשובה שהגיעה באיחור, אחרי ניסיון כניסה אחר או יציאה – מתעלמים ממנה
    if (!pw || pw !== password) throw Object.assign(new Error('סיסמה שגויה.'), { code: 'auth' });
    $('login').hidden = true;
    $('dash').hidden = false;
    $('dashStatus').textContent = '';
    render(data);
  }

  function render(data) {
    const all = data.greetings;
    const hidden = all.filter((g) => g.hidden).length;
    const kindCount = (k) => all.filter((g) => (g.kind || 'greeting') === k).length;
    // ברכה עם כמה תמונות = כמה שורות עם אותו groupId. סופרים ברכות, לא שורות.
    const greetingRows = all.filter((g) => (g.kind || 'greeting') === 'greeting');
    const countGroups = (rows) => new Set(rows.map((g) => g.groupId || g.id)).size;
    const greetingCount = countGroups(greetingRows);
    const images = countGroups(greetingRows.filter((g) => g.type === 'image'));
    const videos = countGroups(greetingRows.filter((g) => g.type === 'video'));
    const guests = data.guests;
    const sentGuests = guests.filter((g) => g.sent).length;

    const stats = $('stats');
    stats.textContent = '';
    [
      [greetingCount, 'ברכות'],
      [images, 'ברכות עם תמונה'],
      [videos, 'ברכות עם סרטון'],
      [kindCount('past_photo'), 'תמונות מהעבר'],
      [kindCount('love'), 'מילים על טלאור'],
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
  const KIND_LABEL = { greeting: 'ברכה', past_photo: 'תמונה מהעבר', love: 'מילה', trivia: 'טריוויה' };

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
  // מעבירים את הסיסמה לדף התצוגה פעם אחת בלבד: הוא קורא ומוחק אותה מיד
  $('btnPreview').addEventListener('click', () => {
    try { sessionStorage.setItem('talor40_preview', password); } catch (e) { /* בלי זה התצוגה לא תיטען */ }
    location.href = 'index.html?preview';
  });

})();
