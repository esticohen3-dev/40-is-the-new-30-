(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const KEY = 'talor40_admin';
  let password = '';
  let lastData = null;

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
    lastData = data;
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
    toggle.addEventListener('click', () => act(toggle, 'admin_hide', { id: g.id, hidden: !g.hidden },
      g.hidden ? 'מציגים את הברכה…' : 'מסתירים את הברכה…'));
    const del = el('button', 'btn danger small', 'מחיקה');
    del.type = 'button';
    del.addEventListener('click', () => {
      const what = g.fileId ? 'הברכה והקובץ שלה יימחקו' : 'הברכה תימחק';
      if (confirm(`למחוק את הברכה של ${g.name}?\n${what} לצמיתות.`)) act(del, 'admin_delete', { id: g.id }, 'מוחקים את הברכה…');
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

  /* ---------------- תצוגה מקדימה של הקיר ---------------- */

  const fileCache = {}; // id -> Promise<blob URL>

  function fetchFile(id) {
    if (!fileCache[id]) {
      fileCache[id] = callApi('admin_file', { password, id }).then((r) => {
        const bin = atob(r.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return URL.createObjectURL(new Blob([bytes], { type: r.mimeType }));
      });
      fileCache[id].catch(() => { delete fileCache[id]; });
    }
    return fileCache[id];
  }

  $('btnPreview').addEventListener('click', openPreview);
  $('btnClosePreview').addEventListener('click', () => {
    $('preview').hidden = true;
    document.body.classList.remove('previewing');
    $('previewWall').querySelectorAll('video').forEach((v) => v.pause());
  });

  async function openPreview() {
    if (!lastData) return;
    const items = lastData.greetings.filter((g) => !g.hidden);
    const wall = $('previewWall');
    wall.textContent = '';
    $('previewStatus').textContent = items.length ? '' : 'עוד אין ברכות.';
    document.body.classList.add('previewing');
    $('preview').hidden = false;
    window.scrollTo(0, 0);

    const images = [];
    items.forEach((g) => {
      const c = el('article', 'gcard');
      if (g.type === 'image' && g.fileId) {
        const wrap = el('button', 'gmedia gimage');
        wrap.type = 'button';
        const img = el('img');
        img.alt = 'תמונה מ' + g.name;
        if (g.thumb) img.src = g.thumb; // תמונה קטנה עד שהמלאה נטענת
        wrap.appendChild(img);
        wrap.addEventListener('click', () => {
          $('lightboxImg').src = img.src;
          $('lightbox').hidden = false;
        });
        c.appendChild(wrap);
        images.push([g, img]);
      }
      if (g.type === 'video' && g.fileId) c.appendChild(previewVideo(g));
      if (g.message) c.appendChild(el('p', 'gmessage', g.message));
      const foot = el('footer', 'gfoot');
      foot.appendChild(el('span', 'gname', g.name));
      foot.appendChild(el('span', 'gdate', formatTimestamp(g.timestamp)));
      c.appendChild(foot);
      wall.appendChild(c);
    });

    // טוענים את התמונות המלאות אחת אחרי השנייה כדי לא להעמיס על השרת
    for (const [g, img] of images) {
      if ($('preview').hidden) break;
      try {
        const url = await fetchFile(g.id);
        img.onerror = () => { img.onerror = null; if (g.thumb) img.src = g.thumb; };
        img.src = url;
      } catch (e) { /* נשארת התמונה הקטנה */ }
    }
  }

  function previewVideo(g) {
    const wrap = el('div', 'gmedia gvideo preview-video');
    if (g.thumb) {
      const img = el('img');
      img.src = g.thumb;
      img.alt = '';
      wrap.appendChild(img);
    }
    const play = el('button', 'preview-play', '▶ הפעלת הסרטון');
    play.type = 'button';
    play.addEventListener('click', async () => {
      play.disabled = true;
      play.textContent = 'טוענים את הסרטון…';
      try {
        const url = await fetchFile(g.id);
        const v = el('video');
        v.controls = true;
        v.playsInline = true;
        v.src = url;
        wrap.textContent = '';
        wrap.appendChild(v);
        v.play().catch(() => {});
      } catch (err) {
        play.disabled = false;
        play.textContent = 'הטעינה נכשלה. לנסות שוב';
      }
    });
    wrap.appendChild(play);
    return wrap;
  }

  $('lightbox').addEventListener('click', () => { $('lightbox').hidden = true; });

  // כניסה אוטומטית אם הסיסמה כבר נשמרה בלשונית הזו
  password = load();
  if (password) refresh().catch((err) => { logout(); $('loginError').textContent = err.message; });
})();
