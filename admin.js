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
  $('btnRefresh').addEventListener('click', () => refresh().catch(showError));

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
    const images = all.filter((g) => g.type === 'image').length;
    const videos = all.filter((g) => g.type === 'video').length;
    const guests = data.guests;
    const sentGuests = guests.filter((g) => g.sent).length;

    const stats = $('stats');
    stats.textContent = '';
    [
      [all.length + ' / ' + data.maxGreetings, 'ברכות'],
      [all.length - hidden, 'גלויות'],
      [hidden, 'מוסתרות'],
      [images, 'תמונות'],
      [videos, 'סרטונים'],
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
      guests.length ? 'כולם שלחו! 🎉' : 'רשימת המוזמנים ריקה. ממלאים אותה בלשונית "מוזמנים" בגיליון.');

    // שמות לא מזוהים
    const unmatched = [...new Set(all.filter((g) => g.inGuestList === 'לבדוק').map((g) => g.name))];
    $('unmatchedTitle').textContent = `שמות שלא נמצאו ברשימת המוזמנים (${unmatched.length})`;
    fillList($('unmatchedList'), unmatched, 'אין.');

    // ברכות
    const list = $('list');
    list.textContent = '';
    if (!all.length) list.appendChild(el('p', 'status', 'עוד אין ברכות.'));
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
        media.appendChild(el('span', 'athumb-icon', g.type === 'video' ? '🎬' : '🖼️'));
      }
      if (g.type === 'video') media.appendChild(el('span', 'play-badge', '▶'));
      c.appendChild(media);
    }

    const body = el('div', 'abody');
    const head = el('div', 'ahead');
    head.appendChild(el('strong', '', g.name));
    head.appendChild(el('span', 'tag', TYPE_LABEL[g.type] || g.type));
    if (g.hidden) head.appendChild(el('span', 'tag warn', 'מוסתרת'));
    if (g.inGuestList === 'לבדוק') head.appendChild(el('span', 'tag', 'לא ברשימה'));
    body.appendChild(head);

    const meta = formatTimestamp(g.timestamp) + (g.size ? ` · ${(g.size / 1048576).toFixed(1)}MB` : '');
    body.appendChild(el('p', 'ameta', meta));
    if (g.message) body.appendChild(el('p', 'amessage', g.message));

    const actions = el('div', 'actions');
    const toggle = el('button', 'btn ghost small', g.hidden ? 'הצגה' : 'הסתרה');
    toggle.type = 'button';
    toggle.addEventListener('click', () => act(toggle, 'admin_hide', { id: g.id, hidden: !g.hidden }));
    const del = el('button', 'btn danger small', 'מחיקה');
    del.type = 'button';
    del.addEventListener('click', () => {
      const what = g.fileId ? 'הברכה והקובץ שלה יימחקו' : 'הברכה תימחק';
      if (confirm(`למחוק את הברכה של ${g.name}?\n${what} לצמיתות.`)) act(del, 'admin_delete', { id: g.id });
    });
    actions.appendChild(toggle);
    actions.appendChild(del);
    body.appendChild(actions);

    c.appendChild(body);
    return c;
  }

  async function act(button, action, payload) {
    button.disabled = true;
    try {
      await callApi(action, Object.assign({ password }, payload));
      await refresh();
    } catch (err) {
      button.disabled = false;
      showError(err);
    }
  }

  // כניסה אוטומטית אם הסיסמה כבר נשמרה בלשונית הזו
  password = load();
  if (password) refresh().catch((err) => { logout(); $('loginError').textContent = err.message; });
})();
