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
  const LETTERS = ['א', 'ב', 'ג', 'ד'];

  /* תצוגה מקדימה למנהל: index.html?preview, עם הסיסמה שנשמרה בלשונית בדף הניהול */
  const ADMIN_PW = (() => {
    try {
      const pw = sessionStorage.getItem('talor40_preview') || '';
      sessionStorage.removeItem('talor40_preview'); // שימוש חד-פעמי
      return pw;
    } catch (e) { return ''; }
  })();
  const PREVIEW = /[?&]preview\b/.test(location.search) && !!ADMIN_PW;

  /* ---------------- ניווט בין מסכים ---------------- */

  const views = ['home', 'form', 'extras', 'sending', 'done', 'wall', 'timeline', 'forty', 'trivia'];
  let mainView = 'home';

  function show(name) {
    views.forEach((v) => { $('view-' + v).hidden = v !== name; });
    document.body.classList.toggle('on-trivia', name === 'trivia');
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (action) {
      if (action.dataset.action === 'start') openForm();
      if (action.dataset.action === 'home') show(mainView);
    }
    const go = e.target.closest('[data-go]');
    if (go && wallItems) openSection(go.dataset.go);
  });

  /* כניסה סודית לדף המנהל: 5 לחיצות על הלוגו תוך 3 שניות */
  (function secretAdminTap() {
    const logo = $('logo');
    let taps = [];
    logo.addEventListener('click', () => {
      const now = Date.now();
      taps = taps.filter((t) => now - t < 3000);
      taps.push(now);
      if (taps.length >= 5) location.href = 'admin.html';
    });
  })();

  /* ---------------- דף הבית ---------------- */

  function initHome() {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(CFG.BIRTHDAY_DATE);
    if (m) $('dateChip').textContent = `${Number(m[3])}.${Number(m[2])}.${m[1]}`;
    $('thanksLine').textContent = `טלאור יראה את הברכה שלכם ${CFG.BIRTHDAY_LABEL.replace(/^(\d)/, 'ב-$1')}.`;

    const img = new Image();
    img.alt = 'טלאור';
    img.onload = () => { $('heroPhoto').prepend(img); $('heroPhoto').classList.add('has-photo'); };
    img.src = CFG.HERO_IMAGE + '?v=4';

    if (PREVIEW) {
      openPreview();
    } else if (Date.now() >= BIRTHDAY) {
      openWall();
    } else {
      showSecret();
      tick();
      timer = setInterval(tick, 1000);
    }
  }

  /* פופ-אפ "זה סוד": בכל כניסה, עד יום ההולדת */
  function showSecret() {
    $('secretDate').textContent = `הברכות ייחשפו לו ${CFG.BIRTHDAY_LABEL.replace(/^(\d)/, 'ב-$1')}.`;
    $('secretPopup').hidden = false;
    document.body.classList.add('locked-scroll');
    $('btnSecretOk').focus();
  }
  function hideSecret() {
    $('secretPopup').hidden = true;
    document.body.classList.remove('locked-scroll');
  }
  $('btnSecretOk').addEventListener('click', hideSecret);
  $('secretPopup').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideSecret();
    if (e.key === 'Tab') { e.preventDefault(); $('btnSecretOk').focus(); } // הכפתור היחיד בחלון
  });

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

  /* ---------------- שלב 1: הברכה ---------------- */

  const flow = {
    addMore: false, // "להוסיף עוד משהו" אחרי שליחה: בלי ברכה חדשה
    name: ''
  };

  function openForm() {
    flow.addMore = false;
    $('formError').textContent = '';
    show('form');
  }

  $('fMessage').addEventListener('input', () => {
    $('msgCounter').textContent = `${$('fMessage').value.length}/${CFG.MAX_MESSAGE}`;
  });

  $('greetForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('fName').value.trim();
    const message = $('fMessage').value.trim();
    $('formError').textContent = '';
    if (mainSlot.checking) return;
    if (!name) {
      $('formError').textContent = 'צריך למלא שם.';
      $('fName').focus();
      return;
    }
    if (!message && !mainSlot.items.length) {
      $('formError').textContent = 'צריך לכתוב ברכה או לצרף תמונה או סרטון.';
      return;
    }
    flow.name = name;
    openExtras();
  });

  /* ---------------- בחירת קבצים ---------------- */

  function makeSlot(ids, allowVideo) {
    return Object.assign({ items: [], checking: false, allowVideo }, ids);
  }
  const mainSlot = makeSlot({ input: 'fFile', status: 'fileStatus', preview: 'preview', remove: 'btnRemoveFile', error: 'formError' }, true);
  const pastSlot = makeSlot({ input: 'pFile', status: 'pFileStatus', preview: 'pPreview', remove: null, error: 'extrasError' }, false);

  $('fFile').addEventListener('change', (e) => handleFiles(mainSlot, e.target.files));
  $('pFile').addEventListener('change', (e) => handleFiles(pastSlot, e.target.files));
  $('btnRemoveFile').addEventListener('click', () => clearFiles(mainSlot));

  function clearFiles(slot) {
    slot.items.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    slot.items = [];
    $(slot.input).value = '';
    renderPreview(slot);
  }

  function removeItem(slot, item) {
    URL.revokeObjectURL(item.previewUrl);
    slot.items = slot.items.filter((it) => it !== item);
    $(slot.error).textContent = '';
    renderPreview(slot);
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

  /** מוסיף את הקבצים שנבחרו לקבצים שכבר יש. קובץ לא תקין לא נכנס, והשגיאה מוצגת. */
  async function handleFiles(slot, fileList) {
    const picked = [...(fileList || [])];
    $(slot.input).value = ''; // כדי שאפשר יהיה לבחור שוב את אותו קובץ
    $(slot.error).textContent = '';
    if (!picked.length || slot.checking) return;
    let error = '';
    slot.checking = true;
    for (const file of picked) {
      const t = detectType(file);
      if (!t || (!slot.allowVideo && t.kind !== 'image')) {
        error = slot.allowVideo ? 'אפשר לבחור רק תמונות או סרטון.' : 'אפשר לבחור כאן רק תמונות.';
        continue;
      }
      const hasVideo = slot.items.some((it) => it.kind === 'video');
      if (t.kind === 'video' ? slot.items.length > 0 : hasVideo) {
        error = 'אפשר לשלוח סרטון אחד בלבד, בלי תמונות נוספות.';
        continue;
      }
      if (slot.items.length >= CFG.MAX_FILES) {
        error = `אפשר לבחור עד ${CFG.MAX_FILES} תמונות.`;
        break;
      }
      if (t.kind === 'image' && file.size > CFG.MAX_IMAGE_MB * MB) {
        error = `התמונה גדולה מדי (${mbText(file.size)}MB). אפשר לשלוח תמונה של עד ${CFG.MAX_IMAGE_MB}MB.`;
        continue;
      }
      if (t.kind === 'video' && file.size > CFG.MAX_VIDEO_MB * MB) {
        error = `הסרטון גדול מדי (${mbText(file.size)}MB). אפשר לשלוח סרטון של עד ${CFG.MAX_VIDEO_MB}MB. כדאי לקצר אותו או לצלם באיכות נמוכה יותר.`;
        continue;
      }
      let duration = null;
      if (t.kind === 'video') {
        $(slot.status).textContent = 'בודקים את אורך הסרטון…';
        duration = await readVideoDuration(file);
        if (duration == null) {
          error = 'לא הצלחנו לקרוא את אורך הסרטון. אפשר לנסות סרטון אחר או לצלם מחדש.';
          continue;
        }
        // חצי שנייה של סבולת: סרטון "של 30 שניות" יוצא לפעמים 30.2
        if (duration > CFG.MAX_VIDEO_SECONDS + 0.5) {
          error = `הסרטון ארוך מדי (${Math.round(duration)} שניות). אפשר לשלוח סרטון של עד ${CFG.MAX_VIDEO_SECONDS} שניות.`;
          continue;
        }
      }
      slot.items.push({ file, kind: t.kind, mime: t.mime, duration, previewUrl: URL.createObjectURL(file) });
    }
    slot.checking = false;
    renderPreview(slot);
    $(slot.error).textContent = error;
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

  function renderPreview(slot) {
    const container = $(slot.preview);
    container.textContent = '';
    const items = slot.items;
    if (slot.remove) $(slot.remove).hidden = items.length < 2;
    const size = items.reduce((sum, it) => sum + it.file.size, 0);
    if (!items.length) {
      $(slot.status).textContent = '';
    } else if (items[0].kind === 'video') {
      $(slot.status).textContent = `✓ סרטון של ${Math.round(items[0].duration)} שניות, ${mbText(size)}MB`;
    } else {
      const left = CFG.MAX_FILES - items.length;
      $(slot.status).textContent = (items.length === 1 ? '✓ תמונה אחת' : `✓ ${items.length} תמונות`) +
        `, ${mbText(size)}MB` + (left > 0 ? ` · אפשר להוסיף עוד ${left}` : '');
    }
    container.classList.toggle('grid', items.length > 1);
    items.forEach((it, i) => {
      const box = el('div', 'pitem');
      if (it.kind === 'image') {
        const img = el('img');
        img.alt = `תמונה ${i + 1}`;
        img.src = it.previewUrl;
        img.onerror = () => { img.replaceWith(el('span', 'pname', it.file.name)); };
        box.appendChild(img);
      } else {
        const v = el('video');
        v.controls = true;
        v.playsInline = true;
        v.preload = 'metadata';
        v.src = it.previewUrl;
        box.appendChild(v);
      }
      const x = el('button', 'pitem-remove', '✕');
      x.type = 'button';
      x.setAttribute('aria-label', it.kind === 'video' ? 'הסרת הסרטון' : `הסרת תמונה ${i + 1}`);
      x.addEventListener('click', () => removeItem(slot, it));
      box.appendChild(x);
      container.appendChild(box);
    });
  }

  /* ---------------- שלב 2: תוספות ---------------- */

  // צ'יפים של תקופות
  let selectedEra = '';
  CFG.ERAS.forEach((era) => {
    const chip = el('button', 'chip', era);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      selectedEra = era;
      $('eraChips').querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    });
    $('eraChips').appendChild(chip);
  });

  document.querySelectorAll('.extra-head').forEach((head) => {
    head.addEventListener('click', () => setExtraOpen(head.parentElement, !head.parentElement.classList.contains('open')));
  });

  function setExtraOpen(section, open) {
    section.classList.toggle('open', open);
    section.querySelector('.extra-head').setAttribute('aria-expanded', String(open));
    section.querySelector('.extra-body').hidden = !open;
  }

  function openExtras() {
    $('extrasError').textContent = '';
    $('btnSkip').hidden = flow.addMore;
    show('extras');
  }

  $('lText').addEventListener('input', () => {
    $('lCounter').textContent = `${$('lText').value.length}/${CFG.MAX_WORD}`;
  });

  $('btnExtrasBack').addEventListener('click', () => show(flow.addMore ? 'done' : 'form'));

  function resetExtras() {
    ['exPhoto', 'exLove', 'exTrivia'].forEach((id) => setExtraOpen($(id), false));
    selectedEra = '';
    $('eraChips').querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    clearFiles(pastSlot);
    $('pCaption').value = '';
    $('lText').value = '';
    $('lCounter').textContent = `0/${CFG.MAX_WORD}`;
    $('tQuestion').value = '';
    document.querySelectorAll('.tAnswer').forEach((i) => { i.value = ''; });
    document.querySelectorAll('input[name="tCorrect"]').forEach((r) => { r.checked = false; });
  }

  /** אוסף את התוספות הפתוחות. זורק שגיאה עם הודעה אם משהו חסר. */
  function collectExtras() {
    const extras = {};
    if ($('exPhoto').classList.contains('open')) {
      if (!selectedEra) throw new Error('צריך לבחור מאיזו תקופה התמונה.');
      if (!pastSlot.items.length) throw new Error('צריך לבחור תמונה מהעבר.');
      extras.pastPhoto = { era: selectedEra, caption: $('pCaption').value.trim().slice(0, CFG.MAX_CAPTION) };
    }
    if ($('exLove').classList.contains('open')) {
      const word = $('lText').value.trim().replace(/\s+/g, ' ');
      if (!word) throw new Error('צריך לכתוב מילה שמתארת את טלאור.');
      if (word.split(' ').length > CFG.MAX_WORD_COUNT) throw new Error('אפשר לכתוב עד 2 מילים.');
      extras.love = word.slice(0, CFG.MAX_WORD);
    }
    if ($('exTrivia').classList.contains('open')) {
      const question = $('tQuestion').value.trim();
      // 2 עד 4 תשובות: שולחים רק את המלאות, והתשובה הנכונה לפי המיקום ברשימה המקוצרת
      const filled = [...document.querySelectorAll('.tAnswer')]
        .map((input, i) => ({ i, text: input.value.trim().slice(0, CFG.MAX_ANSWER) }))
        .filter((a) => a.text);
      const checked = document.querySelector('input[name="tCorrect"]:checked');
      if (!question) throw new Error('צריך לכתוב שאלת טריוויה.');
      if (filled.length < 2) throw new Error('צריך למלא לפחות 2 תשובות לשאלת הטריוויה.');
      if (!checked) throw new Error('צריך לסמן את התשובה הנכונה.');
      const correct = filled.findIndex((a) => a.i === Number(checked.value));
      if (correct < 0) throw new Error('התשובה שסימנתם כנכונה ריקה. צריך לכתוב אותה או לסמן תשובה אחרת.');
      extras.trivia = { question: question.slice(0, CFG.MAX_QUESTION), answers: filled.map((a) => a.text), correct };
    }
    return extras;
  }

  $('btnSend').addEventListener('click', () => {
    let extras;
    try {
      extras = collectExtras();
    } catch (err) {
      $('extrasError').textContent = err.message;
      return;
    }
    if (flow.addMore && !Object.keys(extras).length) {
      $('extrasError').textContent = 'צריך לבחור לפחות דבר אחד.';
      return;
    }
    send(extras);
  });

  $('btnSkip').addEventListener('click', () => send({}));

  /* ---------------- שליחה ---------------- */

  async function send(extras) {
    if (pastSlot.checking || mainSlot.checking) return;
    $('extrasError').textContent = '';
    const withGreeting = !flow.addMore;
    const payload = {
      name: flow.name.slice(0, CFG.MAX_NAME),
      message: withGreeting ? $('fMessage').value.trim().slice(0, CFG.MAX_MESSAGE) : '',
      website: $('fWebsite').value,
      files: [],
      extras
    };
    const mainItems = withGreeting ? mainSlot.items : [];
    const pastItems = extras.pastPhoto ? pastSlot.items : [];
    const fileCount = mainItems.length + pastItems.length;
    const hasVideo = mainItems.some((it) => it.kind === 'video');
    $('sendingNote').textContent = hasVideo
      ? 'מעלים את הסרטון. זה יכול לקחת דקה או שתיים – לא לסגור את הדף.'
      : fileCount > 1 ? 'מעלים את התמונות… לא לסגור את הדף.'
      : fileCount ? 'מעלים את התמונה… לא לסגור את הדף.' : 'רק רגע.';
    show('sending');

    try {
      for (const it of mainItems) payload.files.push(await filePayload(it));
      if (extras.pastPhoto) {
        extras.pastPhoto.files = [];
        for (const it of pastItems) extras.pastPhoto.files.push(await filePayload(it));
      }
      const all = payload.files.concat(extras.pastPhoto ? extras.pastPhoto.files : []);
      const total = all.reduce((sum, f) => sum + f.data.length * 3 / 4, 0);
      if (total > CFG.MAX_TOTAL_MB * MB) {
        throw new Error(`הקבצים גדולים מדי ביחד (${mbText(total)}MB, אפשר עד ${CFG.MAX_TOTAL_MB}MB). אפשר לשלוח חלק עכשיו ולהוסיף עוד אחרי השליחה.`);
      }
      await callApi('submit', payload);
      if (withGreeting) resetForm();
      resetExtras();
      flow.addMore = false;
      show('done');
    } catch (err) {
      $('extrasError').textContent = err.message + ' לא נשלח – אפשר לנסות שוב.';
      show('extras');
    }
  }

  async function filePayload(item) {
    const blob = item.kind === 'image' ? await shrinkImage(item) : { blob: item.file, mime: item.mime };
    return { name: item.file.name, mimeType: blob.mime, data: await toBase64(blob.blob) };
  }

  function resetForm() {
    $('greetForm').reset();
    $('msgCounter').textContent = `0/${CFG.MAX_MESSAGE}`;
    clearFiles(mainSlot);
  }

  /** מקטין תמונות גדולות ל-2048px ב-JPEG כדי שההעלאה תהיה מהירה. אם לא מצליח – שולח את המקור. */
  async function shrinkImage(slot) {
    const original = { blob: slot.file, mime: slot.mime };
    if (slot.mime === 'image/gif') return original; // שומר על אנימציה
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = slot.previewUrl;
      });
      const max = 2048;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      if (scale === 1 && slot.file.size < 1.5 * MB) return original;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (blob && blob.size < slot.file.size) return { blob, mime: 'image/jpeg' };
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

  /* ---------------- תודה ---------------- */

  $('btnAddMore').addEventListener('click', () => {
    flow.addMore = true;
    openExtras();
  });

  $('btnShare').addEventListener('click', async () => {
    const url = location.origin + location.pathname;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'יום הולדת 40 לטלאור', text: 'בואו נפתיע את טלאור ליום הולדת 40', url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('הקישור הועתק');
    } catch (e) {
      toast(url);
    }
  });

  let toastTimer = null;
  function toast(text) {
    $('toast').textContent = text;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2500);
  }

  /* ---------------- יום ההולדת: קיר ---------------- */

  let wallItems = null;

  async function openWall() {
    mainView = 'wall';
    if (!$('view-home').hidden) show('wall');
    $('wallStatus').textContent = 'טוענים את הברכות…';
    try {
      const data = await callApi('list');
      if (data.locked) {
        // השעון במכשיר מקדים – השרת הוא הקובע
        mainView = 'home';
        $('countdownPanel').hidden = true;
        $('lockNote').textContent = data.message;
        $('lockNote').hidden = false;
        if (!$('view-wall').hidden) show('home');
        return;
      }
      wallItems = (data.greetings || []).map((g) => Object.assign({ kind: 'greeting' }, g));
      renderWall();
    } catch (err) {
      $('wallStatus').textContent = err.message;
    }
  }

  async function openPreview() {
    $('previewBar').hidden = false;
    mainView = 'wall';
    show('wall');
    $('wallStatus').textContent = 'טוענים…';
    try {
      const data = await callApi('admin_list', { password: ADMIN_PW });
      wallItems = data.greetings
        .filter((g) => !g.hidden)
        .map((g) => Object.assign({}, g, { kind: g.kind || 'greeting' }));
      renderWall();
    } catch (err) {
      $('wallStatus').textContent = err.message;
    }
  }

  /* בתצוגה מקדימה הקבצים עוד פרטיים: טוענים אותם דרך השרת, אחד אחרי השני */
  const fileCache = {};
  let fileQueue = Promise.resolve();
  function fetchFile(id) {
    if (!fileCache[id]) {
      const job = fileQueue.then(() => callApi('admin_file', { password: ADMIN_PW, id })).then((r) => {
        const bin = atob(r.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return URL.createObjectURL(new Blob([bytes], { type: r.mimeType }));
      });
      fileQueue = job.catch(() => {});
      fileCache[id] = job;
      job.catch(() => { delete fileCache[id]; });
    }
    return fileCache[id];
  }

  const byKind = (kind) => (wallItems || []).filter((g) => g.kind === kind);
  let wallFilter = 'all';

  $('wallFilter').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    wallFilter = chip.dataset.filter;
    $('wallFilter').querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    renderWall();
  });

  /** ברכה עם כמה תמונות נשמרת כשורה לכל תמונה עם אותו groupId. כאן מאחדים אותן לכרטיס אחד. */
  function groupedGreetings() {
    const groups = new Map();
    byKind('greeting').forEach((g) => {
      const key = g.groupId || g.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(g);
    });
    return [...groups.values()].map((rows) => {
      rows = rows.slice().reverse(); // הרשימה מהחדש לישן; בתוך ברכה חוזרים לסדר המקורי
      const media = rows.filter((r) => r.fileId && (r.type === 'image' || r.type === 'video'));
      const head = rows.find((r) => r.message) || rows[0];
      return Object.assign({}, head, { message: head.message || '', type: media.length ? media[0].type : 'text', media });
    });
  }

  function renderWall() {
    const greetings = groupedGreetings();
    $('wallCount').textContent = `${greetings.length} ברכות ממי שאוהבים אותך`;
    $('greetCount').textContent = String(greetings.length);
    const items = wallFilter === 'all' ? greetings : greetings.filter((g) => g.type === wallFilter);
    const wall = $('wall');
    wall.textContent = '';
    $('wallStatus').textContent = items.length ? '' : (greetings.length ? 'אין כאן כלום בסינון הזה.' : 'עוד אין ברכות.');
    const cols = [el('div', 'masonry-col'), el('div', 'masonry-col')];
    const heights = [0, 0];
    let textCount = 0;
    items.forEach((g) => {
      let card;
      let h;
      if (g.type === 'image') {
        card = imageCard(g);
        h = 260 + (g.media.length > 1 ? 90 : 0) + (g.message ? g.message.length / 2 : 0);
      } else if (g.type === 'video') {
        card = videoCard(g.media[0], g);
        h = 260 + (g.message ? g.message.length / 2 : 0);
      } else {
        textCount++;
        card = textCard(g, textCount % 4 === 2);
        h = 80 + g.message.length / 1.2;
      }
      const i = heights[0] <= heights[1] ? 0 : 1;
      cols[i].appendChild(card);
      heights[i] += h;
    });
    cols.forEach((c) => wall.appendChild(c));
  }

  function textCard(g, accent) {
    const c = el('article', 'wcard text' + (accent ? ' accent' : ''));
    if (accent) c.appendChild(el('span', 'quote', '”'));
    c.appendChild(el('p', 'wmsg', g.message));
    c.appendChild(el('strong', 'wname', g.name));
    return c;
  }

  function imageCard(g) {
    const c = el('article', 'wcard');
    const [first, ...rest] = g.media;
    c.appendChild(driveImage(first, 'תמונה מ' + g.name, 800, 'wimg'));
    if (rest.length) {
      const thumbs = el('div', 'wthumbs');
      rest.forEach((m, i) => thumbs.appendChild(driveImage(m, `תמונה ${i + 2} מ${g.name}`, 400, 'wthumb')));
      c.appendChild(thumbs);
    }
    const body = el('div', 'wbody');
    body.appendChild(el('strong', 'wname', g.name));
    if (g.message) body.appendChild(el('p', 'wmsg small', g.message));
    c.appendChild(body);
    return c;
  }

  function videoCard(file, g) {
    const c = el('article', 'wcard video');
    const media = el('div', 'wvideo');
    const play = el('button', 'play-btn');
    play.type = 'button';
    play.setAttribute('aria-label', 'ניגון סרטון מ' + g.name);
    play.appendChild(svgPlay());
    play.addEventListener('click', async () => {
      if (PREVIEW) {
        play.disabled = true;
        try {
          const v = el('video');
          v.controls = true;
          v.playsInline = true;
          v.src = await fetchFile(file.id);
          media.textContent = '';
          media.classList.add('playing');
          media.appendChild(v);
          v.play().catch(() => {});
        } catch (err) {
          play.disabled = false;
          toast('הטעינה של הסרטון נכשלה. אפשר לנסות שוב.');
        }
        return;
      }
      const frame = el('iframe');
      frame.src = `https://drive.google.com/file/d/${encodeURIComponent(file.fileId)}/preview`;
      frame.title = 'סרטון מ' + g.name;
      frame.allow = 'autoplay; fullscreen';
      frame.allowFullscreen = true;
      media.textContent = '';
      media.classList.add('playing');
      media.appendChild(frame);
    });
    media.appendChild(play);
    c.appendChild(media);
    const body = el('div', 'wbody');
    body.appendChild(el('strong', 'wname', g.name));
    if (g.message) body.appendChild(el('p', 'wmsg small', g.message));
    c.appendChild(body);
    return c;
  }

  function svgPlay() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M8 5v14l11-7z');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
  }

  function driveImageUrl(id, width) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}`;
  }
  function driveImageFallback(id, width) {
    return `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${width}`;
  }

  function driveImage(g, alt, width, className) {
    const fileId = g.fileId;
    const wrap = el('button', className);
    wrap.type = 'button';
    wrap.setAttribute('aria-label', 'הגדלת התמונה');
    const img = el('img');
    img.alt = alt;
    if (PREVIEW) {
      if (g.thumb) img.src = g.thumb; // תמונה קטנה עד שהמלאה נטענת
      fetchFile(g.id).then((url) => { img.src = url; }).catch(() => {});
      wrap.appendChild(img);
      wrap.addEventListener('click', () => {
        $('lightboxImg').onerror = null;
        $('lightboxImg').src = img.src;
        $('lightbox').hidden = false;
      });
      return wrap;
    }
    img.loading = 'lazy';
    img.src = driveImageUrl(fileId, width);
    img.addEventListener('error', function onErr() {
      img.removeEventListener('error', onErr);
      img.src = driveImageFallback(fileId, width);
    });
    wrap.appendChild(img);
    wrap.addEventListener('click', () => openLightbox(fileId, alt));
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

  function openSection(name) {
    if (name === 'timeline') renderTimeline();
    if (name === 'forty') renderCloud();
    if (name === 'trivia') startTrivia();
    show(name);
  }

  /* ---------------- 40 שנה בתמונות ---------------- */

  let eraFilter = '';

  (function buildEraFilter() {
    const year = new Date(BIRTHDAY).getFullYear();
    $('timelineYears').textContent = `${year - 40} – ${year}`;
    ['', ...CFG.ERAS].forEach((era) => {
      const chip = el('button', 'chip', era || 'הכל');
      chip.type = 'button';
      chip.dataset.era = era;
      chip.setAttribute('aria-pressed', String(era === ''));
      $('eraFilter').appendChild(chip);
    });
    $('eraFilter').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      eraFilter = chip.dataset.era;
      $('eraFilter').querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      renderTimeline();
    });
  })();

  function renderTimeline() {
    const photos = byKind('past_photo').slice().reverse(); // מהישן לחדש
    const tl = $('timeline');
    tl.textContent = '';
    CFG.ERAS.filter((era) => !eraFilter || era === eraFilter).forEach((era, i) => {
      const items = photos.filter((p) => p.era === era);
      const sec = el('section', 'era');
      const dot = el('span', 'era-dot' + (items.length ? ' on' : ''));
      dot.setAttribute('aria-hidden', 'true');
      sec.appendChild(dot);
      sec.appendChild(el('h2', 'era-title', era));
      if (!items.length) {
        sec.appendChild(el('div', 'era-empty', 'עוד אין תמונות מהתקופה הזו'));
      } else {
        const grid = el('div', 'era-grid' + (items.length === 1 ? ' single' : ''));
        items.forEach((p) => {
          const fig = el('figure', 'era-photo');
          fig.appendChild(driveImage(p, p.caption || 'תמונה מ' + p.name, 800, 'era-img'));
          fig.appendChild(el('figcaption', '', (p.caption ? p.caption + ' · ' : '') + p.name));
          grid.appendChild(fig);
        });
        sec.appendChild(grid);
      }
      tl.appendChild(sec);
    });
  }

  /* ---------------- טלאור במילה אחת (ענן מילים) ---------------- */

  /** מאחד כתיבות שונות של אותה מילה: רווחים, פיסוק, אותיות גדולות/קטנות */
  const normWord = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

  function renderCloud() {
    const groups = new Map();
    byKind('love').slice().reverse().forEach((l) => { // מהישן לחדש
      const key = normWord(l.message);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, { text: l.message.trim(), names: [] });
      groups.get(key).names.push(l.name);
    });
    // הגדולות באמצע: מסדרים לפי כמות ומפזרים לסירוגין לשני הצדדים
    const sorted = [...groups.values()].sort((a, b) => b.names.length - a.names.length);
    const words = [];
    sorted.forEach((w, i) => { if (i % 2) words.push(w); else words.unshift(w); });
    const max = sorted.length ? sorted[0].names.length : 0;
    const level = (n) => {
      if (max === 1) return 's2';
      const r = n / max;
      return r >= 0.8 ? 's4' : r >= 0.5 ? 's3' : n >= 2 ? 's2' : 's1';
    };

    const cloud = $('cloud');
    cloud.textContent = '';
    $('cloudWho').hidden = true;
    $('cloudHint').hidden = !words.length;
    if (!words.length) {
      cloud.appendChild(el('p', 'cloud-empty', 'עוד אין כאן מילים.'));
      return;
    }
    words.forEach((w) => {
      const b = el('button', 'cloud-word ' + level(w.names.length), w.text);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        cloud.querySelectorAll('.cloud-word').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        $('cloudWord').textContent = w.text;
        $('cloudCount').textContent = w.names.length > 1 ? `${w.names.length} אנשים כתבו את זה` : '';
        const names = $('cloudNames');
        names.textContent = '';
        w.names.forEach((n) => names.appendChild(el('span', '', n)));
        $('cloudWho').hidden = false;
        $('cloudHint').hidden = true;
      });
      cloud.appendChild(b);
    });
  }

  /* ---------------- טריוויה ---------------- */

  const quiz = { list: [], index: 0, score: 0 };

  function startTrivia() {
    quiz.list = byKind('trivia').filter((t) => t.trivia).reverse();
    quiz.index = 0;
    quiz.score = 0;
    const empty = !quiz.list.length;
    $('triviaEmpty').hidden = !empty;
    $('triviaQuestion').hidden = empty;
    $('triviaEnd').hidden = true;
    $('triviaPos').textContent = '';
    $('triviaProgress').textContent = '';
    if (!empty) renderQuestion();
  }

  function renderQuestion() {
    const item = quiz.list[quiz.index];
    const total = quiz.list.length;
    $('triviaPos').textContent = `שאלה ${quiz.index + 1} מתוך ${total}`;
    const prog = $('triviaProgress');
    prog.textContent = '';
    for (let i = 0; i < total; i++) prog.appendChild(el('span', i < quiz.index ? 'on' : i === quiz.index ? 'now' : ''));
    $('triviaBy').textContent = 'נשאל ע״י ' + item.name;
    $('triviaText').textContent = item.trivia.question;
    $('btnNextQ').hidden = true;
    const box = $('triviaAnswers');
    box.textContent = '';
    item.trivia.answers.forEach((answer, i) => {
      const b = el('button', 'answer');
      b.type = 'button';
      b.appendChild(el('span', 'letter', LETTERS[i]));
      b.appendChild(el('span', 'answer-text', answer));
      b.addEventListener('click', () => choose(i));
      box.appendChild(b);
    });
  }

  function choose(i) {
    const item = quiz.list[quiz.index];
    const correct = Number(item.trivia.correct);
    const buttons = [...$('triviaAnswers').children];
    buttons.forEach((b, j) => {
      b.disabled = true;
      if (j === correct) {
        b.classList.add('correct');
        b.appendChild(svgCheck());
      } else if (j === i) {
        b.classList.add('wrong');
      }
    });
    if (i === correct) quiz.score++;
    $('btnNextQ').textContent = quiz.index + 1 < quiz.list.length ? 'לשאלה הבאה' : 'לתוצאה';
    $('btnNextQ').hidden = false;
  }

  function svgCheck() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'check');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M5 12l5 5 9-10');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  $('btnNextQ').addEventListener('click', () => {
    quiz.index++;
    if (quiz.index < quiz.list.length) {
      renderQuestion();
      window.scrollTo(0, 0);
      return;
    }
    $('triviaQuestion').hidden = true;
    $('triviaEnd').hidden = false;
    $('triviaPos').textContent = '';
    $('triviaProgress').querySelectorAll('span').forEach((s) => { s.className = 'on'; });
    $('triviaScore').textContent = `${quiz.score} מתוך ${quiz.list.length}`;
    $('triviaScoreLine').textContent = 'תשובות נכונות';
  });

  $('btnTriviaRestart').addEventListener('click', startTrivia);

  initHome();
})();
