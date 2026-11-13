(function () {
  'use strict';

  if (/[?&]admin\b/.test(location.search)) {
    location.replace('admin.html');
    return;
  }

  const CFG = window.APP_CONFIG;
  const MB = 1024 * 1024;
  const BIRTHDAY = new Date(CFG.BIRTHDAY_DATE).getTime();
  const $ = (id) => document.getElementById(id);

  const IMAGE_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
  const VIDEO_EXT = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp', m4v: 'video/x-m4v' };

  const state = {
    file: null,      // File שנבחר ועבר בדיקה
    kind: null,      // 'image' | 'video'
    mime: null,
    previewUrl: null,
    checking: false
  };

  /* ---------------- ניווט בין מסכים ---------------- */

  const views = ['home', 'wall', 'form', 'confirm', 'sending', 'done'];
  let mainView = 'home';

  function show(name) {
    views.forEach((v) => { $('view-' + v).hidden = v !== name; });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'start') openForm();
    if (btn.dataset.action === 'home') goHome();
  });

  function goHome() {
    show(mainView);
  }

  /* כניסה סודית לדף המנהל: 5 לחיצות על ה-40 תוך 3 שניות */
  (function secretAdminTap() {
    const badge = document.querySelector('.badge');
    if (!badge) return;
    let taps = [];
    badge.addEventListener('click', () => {
      const now = Date.now();
      taps = taps.filter((t) => now - t < 3000);
      taps.push(now);
      if (taps.length >= 5) location.href = 'admin.html';
    });
  })();

  /* ---------------- ספירה לאחור / קיר ---------------- */

  let timer = null;

  function tick() {
    const diff = BIRTHDAY - Date.now();
    if (diff <= 0) {
      clearInterval(timer);
      openWall();
      return;
    }
    const s = Math.floor(diff / 1000);
    $('cdDays').textContent = Math.floor(s / 86400);
    $('cdHours').textContent = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
    $('cdMinutes').textContent = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    $('cdSeconds').textContent = String(s % 60).padStart(2, '0');
  }

  function initHome() {
    $('lockNote').textContent = `הברכות ייפתחו ב-${CFG.BIRTHDAY_LABEL}.`;
    if (Date.now() >= BIRTHDAY) {
      openWall();
    } else {
      tick();
      timer = setInterval(tick, 1000);
    }
  }

  async function openWall() {
    $('heroSub').textContent = 'מזל טוב! הנה כל הברכות';
    $('wallStatus').textContent = 'טוענים את הברכות…';
    mainView = 'wall';
    if ($('view-home').hidden === false) show('wall');
    try {
      const data = await callApi('list');
      if (data.locked) {
        // השעון במכשיר מקדים – השרת הוא הקובע
        mainView = 'home';
        $('heroSub').textContent = 'אוספים ברכות לקראת היום הגדול';
        $('lockNote').textContent = data.message;
        $('countdown').hidden = true;
        if ($('view-wall').hidden === false) show('home');
        return;
      }
      renderWall(data.greetings || []);
    } catch (err) {
      $('wallStatus').textContent = err.message;
    }
  }

  function renderWall(items) {
    const wall = $('wall');
    wall.textContent = '';
    $('wallStatus').textContent = items.length ? '' : 'עוד אין ברכות.';
    items.forEach((g) => {
      const card = el('article', 'gcard');
      if (g.type === 'image' && g.fileId) card.appendChild(imageEl(g));
      if (g.type === 'video' && g.fileId) card.appendChild(videoEl(g));
      if (g.message) card.appendChild(el('p', 'gmessage', g.message));
      const foot = el('footer', 'gfoot');
      foot.appendChild(el('span', 'gname', g.name));
      foot.appendChild(el('span', 'gdate', formatTimestamp(g.timestamp)));
      card.appendChild(foot);
      wall.appendChild(card);
    });
  }

  function driveImageUrl(id, width) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}`;
  }
  function driveImageFallback(id, width) {
    return `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${width}`;
  }

  function imageEl(g) {
    const wrap = el('button', 'gmedia gimage');
    wrap.type = 'button';
    wrap.setAttribute('aria-label', 'הגדלת התמונה');
    const img = el('img');
    img.loading = 'lazy';
    img.alt = 'תמונה מ' + g.name;
    img.src = driveImageUrl(g.fileId, 1000);
    img.addEventListener('error', function onErr() {
      img.removeEventListener('error', onErr);
      img.src = driveImageFallback(g.fileId, 1000);
    });
    wrap.appendChild(img);
    wrap.addEventListener('click', () => openLightbox(g.fileId, img.alt));
    return wrap;
  }

  function videoEl(g) {
    const wrap = el('div', 'gmedia gvideo');
    const frame = el('iframe');
    frame.src = `https://drive.google.com/file/d/${encodeURIComponent(g.fileId)}/preview`;
    frame.title = 'סרטון מ' + g.name;
    frame.loading = 'lazy';
    frame.allow = 'autoplay; fullscreen';
    frame.allowFullscreen = true;
    wrap.appendChild(frame);
    return wrap;
  }

  function openLightbox(fileId, alt) {
    const img = $('lightboxImg');
    img.alt = alt;
    img.onerror = () => { img.onerror = null; img.src = driveImageFallback(fileId, 2400); };
    img.src = driveImageUrl(fileId, 2400);
    $('lightbox').hidden = false;
  }
  $('lightbox').addEventListener('click', () => { $('lightbox').hidden = true; $('lightboxImg').src = ''; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('lightbox').hidden = true; });

  /* ---------------- טופס ---------------- */

  function openForm() {
    $('formError').textContent = '';
    show('form');
    setTimeout(() => $('fName').focus(), 300);
  }

  $('fMessage').addEventListener('input', () => {
    $('msgCounter').textContent = `${$('fMessage').value.length}/${CFG.MAX_MESSAGE}`;
  });

  $('fFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    await handleFile(file);
  });

  $('btnRemoveFile').addEventListener('click', () => {
    clearFile();
    $('fileStatus').textContent = '';
  });

  function clearFile() {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.file = state.kind = state.mime = state.previewUrl = null;
    $('fFile').value = '';
    $('preview').textContent = '';
    $('btnRemoveFile').hidden = true;
  }

  function detectType(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    if (type.startsWith('image/')) return { kind: 'image', mime: type };
    if (type.startsWith('video/')) return { kind: 'video', mime: type };
    if (IMAGE_EXT[ext]) return { kind: 'image', mime: IMAGE_EXT[ext] };
    if (VIDEO_EXT[ext]) return { kind: 'video', mime: VIDEO_EXT[ext] };
    return null;
  }

  const mbText = (bytes) => (bytes / MB).toFixed(1);

  function fileError(msg) {
    clearFile();
    $('fileStatus').textContent = '';
    $('formError').textContent = msg;
  }

  async function handleFile(file) {
    clearFile();
    $('formError').textContent = '';
    $('fileStatus').textContent = '';
    if (!file) return;

    const t = detectType(file);
    if (!t) return fileError('אפשר לבחור רק תמונה או סרטון.');

    if (t.kind === 'image' && file.size > CFG.MAX_IMAGE_MB * MB) {
      return fileError(`התמונה גדולה מדי (${mbText(file.size)}MB). אפשר לשלוח תמונה של עד ${CFG.MAX_IMAGE_MB}MB.`);
    }
    if (t.kind === 'video' && file.size > CFG.MAX_VIDEO_MB * MB) {
      return fileError(`הסרטון גדול מדי (${mbText(file.size)}MB). אפשר לשלוח סרטון של עד ${CFG.MAX_VIDEO_MB}MB. כדאי לקצר אותו או לצלם באיכות נמוכה יותר.`);
    }

    if (t.kind === 'video') {
      state.checking = true;
      $('fileStatus').textContent = 'בודקים את אורך הסרטון…';
      const duration = await readVideoDuration(file);
      state.checking = false;
      if (duration == null) {
        return fileError('לא הצלחנו לקרוא את אורך הסרטון. אפשר לנסות סרטון אחר או לצלם מחדש.');
      }
      // חצי שנייה של סבולת: סרטון "של 30 שניות" יוצא לפעמים 30.2
      if (duration > CFG.MAX_VIDEO_SECONDS + 0.5) {
        return fileError(`הסרטון ארוך מדי (${Math.round(duration)} שניות). אפשר לשלוח סרטון של עד ${CFG.MAX_VIDEO_SECONDS} שניות.`);
      }
      $('fileStatus').textContent = `✓ סרטון של ${Math.round(duration)} שניות, ${mbText(file.size)}MB`;
    } else {
      $('fileStatus').textContent = `✓ תמונה, ${mbText(file.size)}MB`;
    }

    state.file = file;
    state.kind = t.kind;
    state.mime = t.mime;
    state.previewUrl = URL.createObjectURL(file);
    renderPreview($('preview'));
    $('btnRemoveFile').hidden = false;
  }

  function readVideoDuration(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      let done = false;
      const finish = (d) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        v.removeAttribute('src');
        v.load();
        URL.revokeObjectURL(url);
        resolve(d);
      };
      const timeout = setTimeout(() => finish(null), 15000);
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      v.addEventListener('loadedmetadata', () => {
        if (isFinite(v.duration) && v.duration > 0) return finish(v.duration);
        // חלק מקובצי webm מחזירים Infinity עד שקופצים לסוף
        v.addEventListener('timeupdate', () => finish(isFinite(v.duration) ? v.duration : null), { once: true });
        v.currentTime = 1e101;
      });
      v.addEventListener('error', () => finish(null));
      v.src = url;
    });
  }

  function renderPreview(container) {
    container.textContent = '';
    if (!state.file) return;
    if (state.kind === 'image') {
      const img = el('img');
      img.alt = 'תצוגה מקדימה';
      img.src = state.previewUrl;
      img.onerror = () => { container.textContent = '🖼️ ' + state.file.name; };
      container.appendChild(img);
    } else {
      const v = el('video');
      v.controls = true;
      v.playsInline = true;
      v.preload = 'metadata';
      v.src = state.previewUrl;
      container.appendChild(v);
    }
  }

  $('greetForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('fName').value.trim();
    const message = $('fMessage').value.trim();
    $('formError').textContent = '';
    if (state.checking) return;
    if (!name) {
      $('formError').textContent = 'צריך למלא שם.';
      $('fName').focus();
      return;
    }
    if (!message && !state.file) {
      $('formError').textContent = 'צריך לכתוב ברכה או לצרף תמונה או סרטון.';
      return;
    }
    $('cName').textContent = 'מאת: ' + name;
    $('cMessage').textContent = message;
    $('cMessage').hidden = !message;
    renderPreview($('cPreview'));
    $('sendError').textContent = '';
    show('confirm');
  });

  $('btnBack').addEventListener('click', () => {
    $('cPreview').textContent = '';
    show('form');
  });

  /* ---------------- שליחה ---------------- */

  $('btnSend').addEventListener('click', async () => {
    const payload = {
      name: $('fName').value.trim().slice(0, CFG.MAX_NAME),
      message: $('fMessage').value.trim().slice(0, CFG.MAX_MESSAGE),
      website: $('fWebsite').value,
      file: null
    };
    $('sendingNote').textContent = state.kind === 'video'
      ? 'מעלים את הסרטון. זה יכול לקחת דקה או שתיים – לא לסגור את הדף.'
      : state.file ? 'מעלים את התמונה… לא לסגור את הדף.' : 'רק רגע.';
    show('sending');
    $('cPreview').textContent = '';

    try {
      if (state.file) {
        const blob = state.kind === 'image' ? await shrinkImage(state.file, state.mime) : { blob: state.file, mime: state.mime };
        payload.file = {
          name: state.file.name,
          mimeType: blob.mime,
          data: await toBase64(blob.blob)
        };
      }
      await callApi('submit', payload);
      resetForm();
      show('done');
    } catch (err) {
      $('sendError').textContent = err.message + ' הברכה לא נשלחה – אפשר לנסות שוב.';
      renderPreview($('cPreview'));
      show('confirm');
    }
  });

  function resetForm() {
    $('greetForm').reset();
    $('msgCounter').textContent = `0/${CFG.MAX_MESSAGE}`;
    $('fileStatus').textContent = '';
    clearFile();
  }

  /** מקטין תמונות גדולות ל-2048px ב-JPEG כדי שההעלאה תהיה מהירה. אם לא מצליח – שולח את המקור. */
  async function shrinkImage(file, mime) {
    const original = { blob: file, mime };
    if (mime === 'image/gif') return original; // שומר על אנימציה
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = state.previewUrl;
      });
      const max = 2048;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      if (scale === 1 && file.size < 1.5 * MB) return original;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (blob && blob.size < file.size) return { blob, mime: 'image/jpeg' };
      return original;
    } catch (e) {
      return original;
    }
  }

  function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(new Error('לא הצלחנו לקרוא את הקובץ.'));
      r.readAsDataURL(blob);
    });
  }

  initHome();
})();
