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
  MAX_GREETINGS: 200,
  MAX_SUBMITS_PER_MINUTE: 20,
  MAX_ADMIN_FAILS: 10
};

var GREETING_HEADERS = ['id', 'timestamp', 'name', 'message', 'type', 'file_id',
  'file_name', 'size_bytes', 'hidden', 'in_guest_list'];
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
      case 'admin_list': requireAdmin_(req); return json_(adminList_());
      case 'admin_hide': requireAdmin_(req); return json_(adminSetHidden_(req.id, req.hidden === true));
      case 'admin_delete': requireAdmin_(req); return json_(adminDelete_(req.id));
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
  if (!name) throw userError_('צריך למלא שם.');
  if (!message && !file) throw userError_('צריך לכתוב ברכה או לצרף תמונה או סרטון.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) throw userError_('יש עומס כרגע. נסו שוב בעוד דקה.');
  var saved = null;
  try {
    checkRate_();
    var sheet = greetingsSheet_();
    if (sheet.getLastRow() - 1 >= CONFIG.MAX_GREETINGS) {
      throw userError_('הגענו למספר הברכות המקסימלי. תודה רבה!');
    }
    if (file) saved = saveFile_(file, name);

    var inList = markGuestSent_(name);
    sheet.appendRow([
      Utilities.getUuid(),
      nowStr_(),
      safeCell_(name),
      safeCell_(message),
      saved ? saved.type : 'text',
      saved ? saved.id : '',
      saved ? saved.name : '',
      saved ? saved.size : '',
      false,
      inList ? 'כן' : 'לבדוק'
    ]);
  } catch (err) {
    // אם הקובץ נשמר אבל השורה לא נכתבה – לא משאירים קובץ יתום
    if (saved) {
      try { DriveApp.getFileById(saved.id).setTrashed(true); } catch (ignore) {}
    }
    throw err;
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
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
      return { id: g.id, timestamp: g.timestamp, name: g.name, message: g.message, type: g.type, fileId: g.fileId };
    });
  return { ok: true, locked: false, greetings: items };
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
      inGuestList: g.inGuestList, thumb: ''
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
  return sheet.getRange(2, 1, last - 1, GREETING_HEADERS.length).getValues()
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
        inGuestList: String(r[9] || '')
      };
    });
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
