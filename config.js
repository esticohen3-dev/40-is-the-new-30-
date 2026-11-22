/* הגדרות האתר – זה הקובץ היחיד שצריך לערוך */
window.APP_CONFIG = {
  // כתובת ה-Web App של Apps Script (מסתיימת ב-/exec). להדביק בין הגרשיים:
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycby4tBenexCF80S-OsHHO4uEqg98wzi6HxgBN-Npl7Al7npftI1M9b4jaGoPyR54JZVD/exec',

  // יום ההולדת: חצות, שעון ישראל (בפברואר ישראל ב-UTC+2)
  BIRTHDAY_DATE: '2027-02-05T00:00:00+02:00',
  BIRTHDAY_LABEL: '5 בפברואר 2027',

  // מגבלות (השרת אוכף את אותן מגבלות גם אצלו)
  MAX_IMAGE_MB: 10,
  MAX_VIDEO_MB: 30,
  MAX_VIDEO_SECONDS: 30,
  MAX_FILES: 5,      // תמונות בשדה אחד (סרטון: רק אחד, בלי תמונות)
  MAX_TOTAL_MB: 35,  // כל הקבצים בשליחה אחת
  MAX_NAME: 40,
  MAX_MESSAGE: 500,

  // שלב 2 (תוספות) – אותן מגבלות כמו ב-CONFIG ב-Code.gs
  MAX_LOVE: 150,     // השרת מקבל עד 150; "טלאור במילה אחת" מוגבל באתר ל-MAX_WORD
  MAX_WORD: 20,
  MAX_WORD_COUNT: 2,
  MAX_CAPTION: 100,
  MAX_QUESTION: 150,
  MAX_ANSWER: 60,
  ERAS: ['ילדות', 'תיכון', 'צבא', 'לימודים', 'שנות ה-20', 'שנות ה-30'],

  // תמונה של טלאור בדף הבית (קובץ בתיקייה img/)
  HERO_IMAGE: 'img/talor.jpg'
};
