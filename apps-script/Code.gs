/**
 * ברכות טלאור 40 – צד השרת (Google Apps Script)
 *
 * הקובץ הזה מודבק בעורך Apps Script של הגיליון "פרויקט עבודה".
 * הוראות מלאות: apps-script/README.md
 *
 * Script Properties (Project Settings → Script Properties):
 *   ADMIN_PASSWORD  – חובה. סיסמת דף המנהל.
 *   FOLDER_ID       – נוצר אוטומטית ע"י setup(). אפשר להחליף בתיקייה קיימת.
 *   BIRTHDAY_DATE   – אופציונלי, לבדיקות בלבד. למשל 2026-01-01T00:00:00+02:00
 *                     (אם לא מוגדר: 5 בפברואר 2027, חצות שעון ישראל)
 */

var CONFIG = {
  DEFAULT_BIRTHDAY: '2027-02-05T00:00:00+02:00',
  TIMEZONE: 'Asia/Jerusalem',
  FOLDER_NAME: 'פרויקט עבודה',
  SHEET_GREETINGS: 'ברכות',
  SHEET_GUESTS: 'מוזמנים',
  MAX_NAME: 40,
  MAX_MESSAGE: 500,
  MAX_IMAGE_BYTES: 10 * 1024 * 1024,
  MAX_VIDEO_BYTES: 30 * 1024 * 1024,
  MAX_LOVE: 150,
  MAX_CAPTION: 100,
  MAX_QUESTION: 150,
  MAX_ANSWER: 60,
  ERAS: ['ילדות', 'תיכון', 'צבא', 'לימודים', 'שנות ה-20', 'שנות ה-30'],
  MAX_GREETINGS: 600, // סך כל השורות (ברכות + תוספות)
  MAX_SUBMITS_PER_MINUTE: 20,
  MAX_ADMIN_FAILS: 10
};

var GREETING_HEADERS = ['id', 'timestamp', 'name', 'message', 'type', 'file_id',
  'file_name', 'size_bytes', 'hidden', 'in_guest_list',
  'kind', 'era', 'caption', 'trivia_json', 'group_id'];
var KINDS = ['greeting', 'past_photo', 'love', 'trivia'];
var GUEST_HEADERS = ['שם', 'טלפון', 'סטטוס', 'מתי נשלח'];

var IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif' };
var VIDEO_TYPES = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
  'video/3gpp': '.3gp', 'video/x-m4v': '.m4v' };

var HEBREW_MONTHS = ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני',
  'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'];

/* ------------------------------------------------------------------ */
/* נקודות כניסה                                                         */
/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ ok: true, service: 'talor40' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'בקשה לא תקינה.' });
  }
  try {
    switch (req.action) {
      case 'submit': return json_(submit_(req));
      case 'list': return json_(listPublic_());
      case 'counts': return json_(counts_());
      case 'admin_list': requireAdmin_(req); return json_(adminList_());
      case 'admin_hide': requireAdmin_(req); return json_(adminSetHidden_(req.id, req.hidden === true));
      case 'admin_delete': requireAdmin_(req); return json_(adminDelete_(req.id));
      case 'admin_file': requireAdmin_(req); return json_(adminFile_(req.id));
      default: return json_({ ok: false, error: 'פעולה לא מוכרת.' });
    }
  } catch (err) {
    if (err && err.userMessage) {
      return json_({ ok: false, error: err.userMessage, code: err.code || '' });
    }
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'אירעה שגיאה בשרת. נסו שוב בעוד רגע.' });
  }
}

/* ------------------------------------------------------------------ */
/* שליחת ברכה                                                          */
/* ------------------------------------------------------------------ */

function submit_(req) {
  // honeypot: בוטים ממלאים את השדה הנסתר. מחזירים "הצלחה" בלי לשמור כלום.
  if (req.website) return { ok: true };

  var name = cleanText_(req.name, CONFIG.MAX_NAME);
  var message = cleanText_(req.message, CONFIG.MAX_MESSAGE);
  var file = req.file || null;
  var extras = parseExtras_(req.extras);
  var hasGreeting = !!(message || file);
  if (!name) throw userError_('צריך למלא שם.');
  if (!hasGreeting && !extras.length) throw userError_('צריך לכתוב ברכה או לצרף תמונה או סרטון.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) throw userError_('יש עומס כרגע. נסו שוב בעוד דקה.');
  var savedFiles = [];
  function save(f) {
    var saved = saveFile_(f, name);
    savedFiles.push(saved.id);
    return saved;
  }
  try {
    checkRate_();
    var sheet = greetingsSheet_();
    ensureColumns_(sheet);
    var count = (hasGreeting ? 1 : 0) + extras.length;
    if (sheet.getLastRow() - 1 + count > CONFIG.MAX_GREETINGS) {
      throw userError_('הגענו למספר הברכות המקסימלי. תודה רבה!');
    }

    var groupId = Utilities.getUuid();
    var rows = [];
    if (hasGreeting) {
      var saved = file ? save(file) : null;
      rows.push({ kind: 'greeting', message: message, saved: saved });
    }
    extras.forEach(function (x) {
      if (x.kind === 'past_photo') {
        var photo = save(x.file);
        if (photo.type !== 'image') throw userError_('בתמונה מהעבר אפשר לשלוח רק תמונה.');
        rows.push({ kind: 'past_photo', era: x.era, caption: x.caption, saved: photo });
      } else if (x.kind === 'love') {
        rows.push({ kind: 'love', message: x.text });
      } else {
        rows.push({ kind: 'trivia', message: x.trivia.question, trivia: x.trivia });
      }
    });

    var inList = markGuestSent_(name);
    var ts = nowStr_();
    var values = rows.map(function (r) {
      return [
        Utilities.getUuid(),
        ts,
        safeCell_(name),
        safeCell_(r.message || ''),
        r.saved ? r.saved.type : 'text',
        r.saved ? r.saved.id : '',
        r.saved ? r.saved.name : '',
        r.saved ? r.saved.size : '',
        false,
        inList ? 'כן' : 'לבדוק',
        r.kind,
        r.era || '',
        safeCell_(r.caption || ''),
        r.trivia ? JSON.stringify(r.trivia) : '',
        groupId
      ];
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, GREETING_HEADERS.length).setValues(values);
  } catch (err) {
    // אם קבצים נשמרו אבל השורות לא נכתבו – לא משאירים קבצים יתומים
    savedFiles.forEach(function (id) {
      try { DriveApp.getFileById(id).setTrashed(true); } catch (ignore) {}
    });
    throw err;
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

/** בודק את התוספות (שלב 2). מחזיר רשימה של פריטים תקינים. */
function parseExtras_(extras) {
  var out = [];
  if (!extras || typeof extras !== 'object') return out;

  var p = extras.pastPhoto;
  if (p) {
    var era = String(p.era || '');
    if (CONFIG.ERAS.indexOf(era) === -1) throw userError_('צריך לבחור תקופה לתמונה מהעבר.');
    if (!p.file) throw userError_('צריך לבחור תמונה מהעבר.');
    out.push({ kind: 'past_photo', era: era, caption: cleanText_(p.caption, CONFIG.MAX_CAPTION), file: p.file });
  }

  if (extras.love != null) {
    var love = cleanText_(extras.love, CONFIG.MAX_LOVE);
    if (!love) throw userError_('צריך לכתוב משהו שאתם אוהבים בטלאור.');
    out.push({ kind: 'love', text: love });
  }

  var t = extras.trivia;
  if (t) {
    var question = cleanText_(t.question, CONFIG.MAX_QUESTION);
    var answers = Array.isArray(t.answers) ? t.answers.slice(0, 4).map(function (a) {
      return cleanText_(a, CONFIG.MAX_ANSWER);
    }) : [];
    var correct = Number(t.correct);
    if (!question) throw userError_('צריך לכתוב שאלת טריוויה.');
    if (answers.length !== 4 || answers.some(function (a) { return !a; })) {
      throw userError_('צריך למלא 4 תשובות לשאלת הטריוויה.');
    }
    if (!(correct >= 0 && correct <= 3 && Math.floor(correct) === correct)) {
      throw userError_('צריך לסמן את התשובה הנכונה.');
    }
    out.push({ kind: 'trivia', trivia: { question: question, answers: answers, correct: correct } });
  }
  return out;
}

/** מוסיף לגיליון קיים את כותרות העמודות החדשות, אם חסרות. */
function ensureColumns_(sheet) {
  var n = GREETING_HEADERS.length;
  if (sheet.getMaxColumns() < n) sheet.insertColumnsAfter(sheet.getMaxColumns(), n - sheet.getMaxColumns());
  var head = sheet.getRange(1, 1, 1, n).getValues()[0];
  if (String(head[n - 1]) !== GREETING_HEADERS[n - 1]) {
    sheet.getRange(1, 1, 1, n).setValues([GREETING_HEADERS]).setFontWeight('bold');
  }
}

function checkRate_() {
  var cache = CacheService.getScriptCache();
  var key = 'rate_' + Math.floor(Date.now() / 60000);
  var count = Number(cache.get(key) || 0);
  if (count >= CONFIG.MAX_SUBMITS_PER_MINUTE) {
    throw userError_('יש הרבה שליחות כרגע. נסו שוב בעוד דקה.');
  }
  cache.put(key, String(count + 1), 120);
}

function saveFile_(file, senderName) {
  var mime = String(file.mimeType || '').toLowerCase();
  var isImage = IMAGE_TYPES.hasOwnProperty(mime);
  var isVideo = VIDEO_TYPES.hasOwnProperty(mime);
  if (!isImage && !isVideo) throw userError_('סוג הקובץ לא נתמך. אפשר לשלוח תמונה או סרטון.');

  var bytes;
  try {
    bytes = Utilities.base64Decode(String(file.data || ''));
  } catch (err) {
    throw userError_('הקובץ לא הגיע בשלמותו. נסו שוב.');
  }
  var size = bytes.length;
  if (!size) throw userError_('הקובץ ריק.');
  if (isImage && size > CONFIG.MAX_IMAGE_BYTES) throw userError_('התמונה גדולה מ-10MB.');
  if (isVideo && size > CONFIG.MAX_VIDEO_BYTES) throw userError_('הסרטון גדול מ-30MB.');
  if (!magicMatches_(bytes, isImage ? 'image' : 'video')) {
    throw userError_('תוכן הקובץ לא תואם לתמונה או לסרטון.');
  }

  var ext = isImage ? IMAGE_TYPES[mime] : VIDEO_TYPES[mime];
  var safeName = senderName.replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 30);
  var fileName = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd-HHmmss') + '_' + safeName + ext;
  var driveFile = folder_().createFile(Utilities.newBlob(bytes, mime, fileName));

  // אחרי יום ההולדת קבצים חדשים נפתחים לצפייה מיד
  if (isOpen_()) shareFile_(driveFile);

  return { id: driveFile.getId(), name: fileName, size: size, type: isImage ? 'image' : 'video' };
}

/** בדיקת "חתימת" הקובץ – הבייטים הראשונים – כדי לוודא שזה באמת תמונה/סרטון */
function magicMatches_(bytes, kind) {
  if (bytes.length < 12) return false;
  function b(i) { return bytes[i] & 0xff; }
  function ascii(start, len) {
    var s = '';
    for (var i = start; i < start + len; i++) s += String.fromCharCode(b(i));
    return s;
  }
  if (ascii(4, 4) === 'ftyp') return true; // mp4, mov, 3gp, m4v, heic, heif
  if (kind === 'image') {
    if (b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF) return true; // jpeg
    if (ascii(1, 3) === 'PNG') return true;
    if (ascii(0, 3) === 'GIF') return true;
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return true;
    return false;
  }
  if (b(0) === 0x1A && b(1) === 0x45 && b(2) === 0xDF && b(3) === 0xA3) return true; // webm
  var atom = ascii(4, 4); // קובצי QuickTime ישנים
  return atom === 'moov' || atom === 'mdat' || atom === 'wide' || atom === 'free' || atom === 'skip';
}

/* ------------------------------------------------------------------ */
/* רשימת המוזמנים                                                      */
/* ------------------------------------------------------------------ */

function normName_(s) {
  return String(s || '').replace(/[\s\-'"׳״.,]/g, '').toLowerCase();
}

/** מסמן את המוזמן כ"שלח". מחזיר true אם השם נמצא ברשימה. */
function markGuestSent_(name) {
  var sheet = guestsSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var values = sheet.getRange(2, 1, last - 1, 4).getValues();
  var target = normName_(name);
  var found = false;
  for (var i = 0; i < values.length; i++) {
    var guest = normName_(values[i][0]);
    if (guest && guest === target) {
      found = true;
      if (String(values[i][2]).trim() !== 'שלח') {
        sheet.getRange(i + 2, 3, 1, 2).setValues([['שלח', nowStr_()]]);
      }
    }
  }
  return found;
}

function readGuests_() {
  var sheet = guestsSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 4).getValues()
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) {
      return {
        name: String(r[0]).trim(),
        phone: String(r[1] || ''),
        sent: String(r[2]).trim() === 'שלח',
        sentAt: formatTs_(r[3])
      };
    });
}

/* ------------------------------------------------------------------ */
/* צפייה בברכות (טלאור)                                                */
/* ------------------------------------------------------------------ */

function listPublic_() {
  var bd = birthday_();
  if (new Date().getTime() < bd.getTime()) {
    // לפני יום ההולדת לא נשלחת אף ברכה לדפדפן
    return { ok: true, locked: true, opensAt: bd.toISOString(), message: 'הברכות ייפתחו ' + hebrewDate_(bd) + '.' };
  }
  ensureShared_();
  var items = readGreetings_()
    .filter(function (g) { return !g.hidden; })
    .reverse() // מהחדש לישן
    .map(function (g) {
      var item = { id: g.id, timestamp: g.timestamp, name: g.name, message: g.message, type: g.type,
        fileId: g.fileId, kind: g.kind, era: g.era, caption: g.caption };
      if (g.trivia) item.trivia = g.trivia;
      return item;
    });
  return { ok: true, locked: false, greetings: items };
}

/** מותר גם לפני יום ההולדת: רק מספר, בלי תוכן. */
function counts_() {
  var loveCount = readGreetings_().filter(function (g) { return g.kind === 'love' && !g.hidden; }).length;
  return { ok: true, loveCount: loveCount };
}

/* ------------------------------------------------------------------ */
/* מנהל                                                                */
/* ------------------------------------------------------------------ */

function requireAdmin_(req) {
  var password = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!password) throw userError_('לא הוגדרה סיסמת מנהל (ADMIN_PASSWORD ב-Script Properties).', 'auth');
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('admin_fails') || 0);
  if (fails >= CONFIG.MAX_ADMIN_FAILS) {
    throw userError_('יותר מדי ניסיונות שגויים. אפשר לנסות שוב בעוד 15 דקות.', 'auth');
  }
  if (String(req.password || '') !== password) {
    cache.put('admin_fails', String(fails + 1), 900);
    throw userError_('סיסמה שגויה.', 'auth');
  }
}

function adminList_() {
  var greetings = readGreetings_().reverse().map(function (g) {
    var item = {
      id: g.id, timestamp: g.timestamp, name: g.name, message: g.message, type: g.type,
      fileId: g.fileId, fileName: g.fileName, size: g.size, hidden: g.hidden,
      inGuestList: g.inGuestList, thumb: '',
      kind: g.kind, era: g.era, caption: g.caption, trivia: g.trivia
    };
    if (g.fileId) item.thumb = thumbDataUrl_(g.fileId);
    return item;
  });
  var bd = birthday_();
  return {
    ok: true,
    greetings: greetings,
    guests: readGuests_(),
    opensAt: bd.toISOString(),
    opensAtLabel: hebrewDate_(bd),
    isOpen: isOpen_(),
    maxGreetings: CONFIG.MAX_GREETINGS
  };
}

function thumbDataUrl_(fileId) {
  try {
    var blob = DriveApp.getFileById(fileId).getThumbnail();
    if (!blob) return '';
    return 'data:' + (blob.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (err) {
    return '';
  }
}

function adminSetHidden_(id, hidden) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var row = findRow_(id);
    if (!row) throw userError_('הברכה לא נמצאה (אולי נמחקה).');
    greetingsSheet_().getRange(row, 9).setValue(hidden);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function adminDelete_(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var row = findRow_(id);
    if (!row) throw userError_('הברכה לא נמצאה (אולי כבר נמחקה).');
    var sheet = greetingsSheet_();
    var fileId = String(sheet.getRange(row, 6).getValue() || '');
    if (fileId) {
      try { DriveApp.getFileById(fileId).setTrashed(true); } catch (ignore) {}
    }
    sheet.deleteRow(row);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

/** תוכן קובץ של ברכה, לתצוגה המקדימה בדף המנהל (הקבצים פרטיים עד יום ההולדת). */
function adminFile_(id) {
  var g = readGreetings_().filter(function (x) { return x.id === id; })[0];
  if (!g || !g.fileId) throw userError_('הקובץ לא נמצא.');
  var blob = DriveApp.getFileById(g.fileId).getBlob();
  return { ok: true, mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

function findRow_(id) {
  if (!id) return 0;
  var sheet = greetingsSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* פתיחת הקבצים ביום ההולדת                                            */
/* ------------------------------------------------------------------ */

/**
 * רץ אוטומטית בחצות של יום ההולדת (טריגר שנוצר ב-setup).
 * אפשר גם להריץ ידנית מהעורך.
 */
function openFiles() {
  var shared = 0;
  readGreetings_().forEach(function (g) {
    if (!g.fileId) return;
    try {
      shareFile_(DriveApp.getFileById(g.fileId));
      shared++;
    } catch (err) {
      console.error('Could not share ' + g.fileId + ': ' + err);
    }
  });
  PropertiesService.getScriptProperties().setProperty('FILES_SHARED', birthday_().toISOString());
  console.log('Shared ' + shared + ' files.');
}

/** גיבוי: אם הטריגר לא רץ מסיבה כלשהי, הצפייה הראשונה בברכות פותחת את הקבצים. */
function ensureShared_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('FILES_SHARED') === birthday_().toISOString()) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    if (props.getProperty('FILES_SHARED') !== birthday_().toISOString()) openFiles();
  } finally {
    lock.releaseLock();
  }
}

function shareFile_(driveFile) {
  driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
}

/* ------------------------------------------------------------------ */
/* הקמה – להריץ פעם אחת מהעורך                                         */
/* ------------------------------------------------------------------ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);

  // לשונית ברכות (אם יש רק לשונית ריקה אחת – משנים את השם שלה)
  var g = ss.getSheetByName(CONFIG.SHEET_GREETINGS);
  if (!g) {
    var sheets = ss.getSheets();
    if (sheets.length === 1 && sheets[0].getLastRow() === 0 && sheets[0].getName() !== CONFIG.SHEET_GUESTS) {
      g = sheets[0].setName(CONFIG.SHEET_GREETINGS);
    } else {
      g = ss.insertSheet(CONFIG.SHEET_GREETINGS);
    }
  }
  if (g.getLastRow() === 0) {
    g.appendRow(GREETING_HEADERS);
    g.setFrozenRows(1);
    g.getRange(1, 1, 1, GREETING_HEADERS.length).setFontWeight('bold');
  }
  g.getRange('B:B').setNumberFormat('@'); // תאריך נשמר כטקסט, בלי המרות
  g.setRightToLeft(true);

  // לשונית מוזמנים
  var u = ss.getSheetByName(CONFIG.SHEET_GUESTS) || ss.insertSheet(CONFIG.SHEET_GUESTS);
  if (u.getLastRow() === 0) {
    u.appendRow(GUEST_HEADERS);
    u.setFrozenRows(1);
    u.getRange(1, 1, 1, GUEST_HEADERS.length).setFontWeight('bold');
  }
  u.getRange('B:B').setNumberFormat('@'); // שמירה על 0 בתחילת מספר טלפון
  u.getRange('D:D').setNumberFormat('@');
  u.setRightToLeft(true);

  // תיקיית Drive
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('FOLDER_ID');
  if (!folderId) {
    folderId = DriveApp.createFolder(CONFIG.FOLDER_NAME).getId();
    props.setProperty('FOLDER_ID', folderId);
  }
  DriveApp.getFolderById(folderId); // מוודא שהתיקייה קיימת

  // טריגר חד-פעמי לחצות של יום ההולדת
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'openFiles') ScriptApp.deleteTrigger(t);
  });
  var bd = birthday_();
  var triggerMsg;
  if (bd.getTime() > Date.now()) {
    ScriptApp.newTrigger('openFiles').timeBased().at(bd).create();
    triggerMsg = 'נוצר טריגר שיפתח את הקבצים ' + hebrewDate_(bd) + ' בחצות.';
  } else {
    triggerMsg = 'התאריך כבר עבר, ולכן לא נוצר טריגר.';
  }

  var pwMsg = props.getProperty('ADMIN_PASSWORD')
    ? 'סיסמת מנהל: מוגדרת.'
    : 'שימו לב: עוד לא הוגדרה ADMIN_PASSWORD ב-Script Properties!';

  console.log('✔ ההקמה הושלמה.\n' +
    'תיקייה: https://drive.google.com/drive/folders/' + folderId + '\n' +
    triggerMsg + '\n' + pwMsg);
}

/* ------------------------------------------------------------------ */
/* עזרים                                                               */
/* ------------------------------------------------------------------ */

function birthday_() {
  var override = PropertiesService.getScriptProperties().getProperty('BIRTHDAY_DATE');
  var d = new Date(override || CONFIG.DEFAULT_BIRTHDAY);
  if (isNaN(d.getTime())) d = new Date(CONFIG.DEFAULT_BIRTHDAY);
  return d;
}

function isOpen_() {
  return Date.now() >= birthday_().getTime();
}

function hebrewDate_(d) {
  var day = Number(Utilities.formatDate(d, CONFIG.TIMEZONE, 'd'));
  var month = Number(Utilities.formatDate(d, CONFIG.TIMEZONE, 'M'));
  var year = Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy');
  return 'ב-' + day + ' ' + HEBREW_MONTHS[month - 1] + ' ' + year;
}

function readGreetings_() {
  var sheet = greetingsSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var cols = Math.min(GREETING_HEADERS.length, sheet.getMaxColumns());
  return sheet.getRange(2, 1, last - 1, cols).getValues()
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) {
      return {
        id: String(r[0]),
        timestamp: formatTs_(r[1]),
        name: String(r[2]),
        message: String(r[3]),
        type: String(r[4] || 'text'),
        fileId: String(r[5] || ''),
        fileName: String(r[6] || ''),
        size: Number(r[7]) || 0,
        hidden: r[8] === true || String(r[8]).toUpperCase() === 'TRUE',
        inGuestList: String(r[9] || ''),
        kind: KINDS.indexOf(String(r[10] || '')) >= 0 ? String(r[10]) : 'greeting',
        era: String(r[11] || ''),
        caption: String(r[12] || ''),
        trivia: parseTrivia_(r[13])
      };
    });
}

function parseTrivia_(v) {
  if (!v) return null;
  try {
    var t = JSON.parse(String(v));
    return t && t.question && Array.isArray(t.answers) ? t : null;
  } catch (err) {
    return null;
  }
}

function greetingsSheet_() {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_GREETINGS);
  if (!s) throw userError_('חסרה הלשונית "ברכות" בגיליון. יש להריץ setup.');
  return s;
}

function guestsSheet_() {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_GUESTS);
  if (!s) throw userError_('חסרה הלשונית "מוזמנים" בגיליון. יש להריץ setup.');
  return s;
}

function folder_() {
  var id = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!id) throw userError_('לא הוגדרה תיקיית קבצים. יש להריץ setup.');
  return DriveApp.getFolderById(id);
}

function cleanText_(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

/** מונע מטקסט שמתחיל ב-= להפוך לנוסחה בגיליון */
function safeCell_(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function nowStr_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function formatTs_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  return String(v || '');
}

function userError_(message, code) {
  var err = new Error(message);
  err.userMessage = message;
  err.code = code || '';
  return err;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
