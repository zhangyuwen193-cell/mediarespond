const CONFIG = {
  spreadsheetId: '1wBeTXSti_NO8C92nkz8_XrXp1GEtbWjxPrBd-ax0VHk',
  sheetId: 559886756
};

// GitHub Pages 透過 JSONP 讀取資料。
function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = String(params.action || '').toLowerCase();

  // 沒有 action 時顯示簡單狀態頁，方便確認部署是否正常。
  if (!action) {
    return HtmlService.createHtmlOutput(
      '<h2>小組回饋資料服務正常運作</h2><p>請從 GitHub Pages 網頁查詢回饋。</p>'
    );
  }

  let payload;

  try {
    if (action === 'groups') {
      payload = { ok: true, data: getReportGroups() };
    } else if (action === 'feedback') {
      payload = { ok: true, data: getGroupFeedback(params.group) };
    } else {
      throw new Error('不支援的查詢動作。');
    }
  } catch (error) {
    payload = {
      ok: false,
      error: error && error.message ? error.message : '讀取資料失敗。'
    };
  }

  return createJsonpOutput_(payload, params.callback);
}

function createJsonpOutput_(payload, callbackName) {
  const callback = String(callbackName || '');

  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(payload) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getReportGroups() {
  const data = readData_();

  return [...new Set(
    data.rows
      .map(row => normalizeGroup_(row[data.columns.target]))
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'zh-TW', { numeric: true }));
}

function getGroupFeedback(groupInput) {
  const group = normalizeGroup_(groupInput);

  if (!group) {
    throw new Error('請輸入組別，例如 A、B、C。');
  }

  const data = readData_();
  const columns = data.columns;
  const items = [];

  data.rows.forEach(row => {
    if (normalizeGroup_(row[columns.target]) !== group) return;

    const scoreText = String(row[columns.score] || '').trim();
    const feedback = String(row[columns.feedback] || '').trim();

    if (!scoreText && !feedback) return;

    items.push({
      scoreText,
      score: parseScore_(scoreText),
      feedback,
      topic: columns.topic >= 0 ? String(row[columns.topic] || '').trim() : '',
      time: columns.time >= 0 ? String(row[columns.time] || '').trim() : ''
    });
  });

  const scores = items
    .map(item => item.score)
    .filter(score => Number.isFinite(score));

  const average = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : null;

  items.reverse();

  return {
    group,
    count: items.length,
    scoredCount: scores.length,
    average,
    items
  };
}

function readData_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = spreadsheet.getSheets()
    .find(item => item.getSheetId() === CONFIG.sheetId);

  if (!sheet) throw new Error('找不到指定的表單回覆工作表。');

  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) throw new Error('試算表目前沒有資料。');

  const headers = values[0].map(normalizeHeader_);
  const columns = {
    target: findColumn_(headers, ['當週報告組別', '本週報告組別', '報告組別']),
    topic: findColumn_(headers, ['當週報告主題一是什麼', '當週報告主題', '報告主題']),
    score: findColumn_(headers, ['你對主題一的評價是', '你對主題一的評分是', '評價', '評分', '分數']),
    feedback: findColumn_(headers, ['當週報告主題一的回饋至少100個中文字', '當週報告主題一的回饋', '回饋', '建議']),
    time: findColumn_(headers, ['時間戳記', 'Timestamp'])
  };

  if (columns.target < 0) throw new Error('找不到「當週報告組別」欄位。');
  if (columns.score < 0) throw new Error('找不到評分欄位。');
  if (columns.feedback < 0) throw new Error('找不到回饋欄位。');

  return { columns, rows: values.slice(1) };
}

function findColumn_(headers, possibleNames) {
  const names = possibleNames.map(normalizeHeader_);

  for (const name of names) {
    const index = headers.indexOf(name);
    if (index >= 0) return index;
  }

  for (const name of names) {
    const index = headers.findIndex(header =>
      header.includes(name) || name.includes(header)
    );
    if (index >= 0) return index;
  }

  return -1;
}

function normalizeHeader_(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

function normalizeGroup_(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^第/, '')
    .replace(/組$/, '');
}

function parseScore_(value) {
  const match = String(value || '')
    .normalize('NFKC')
    .trim()
    .match(/-?\d+(?:\.\d+)?/);

  return match ? Number(match[0]) : null;
}

