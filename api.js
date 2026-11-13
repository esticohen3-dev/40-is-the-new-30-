/* קריאה לשרת (Apps Script). Content-Type text/plain כדי למנוע בקשת preflight של CORS. */
async function callApi(action, payload) {
  const url = window.APP_CONFIG.WEB_APP_URL;
  if (!url || !/^https:\/\//.test(url)) {
    throw new Error('האתר עוד לא מחובר לשרת (חסרה כתובת ב-config.js).');
  }
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action }, payload || {})),
      redirect: 'follow'
    });
  } catch (e) {
    throw new Error('אין חיבור לשרת. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.');
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('התקבלה תשובה לא צפויה מהשרת. נסו שוב בעוד רגע.');
  }
  if (!data || !data.ok) {
    const err = new Error((data && data.error) || 'אירעה שגיאה. נסו שוב.');
    err.code = data && data.code;
    throw err;
  }
  return data;
}

function formatTimestamp(ts) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(ts || '');
  if (!m) return ts || '';
  return `${Number(m[3])}.${Number(m[2])}.${m[1]} · ${m[4]}:${m[5]}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
