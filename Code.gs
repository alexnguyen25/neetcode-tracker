/**
 * THE NEETCODE LEDGER — Google Sheets backend
 * ------------------------------------------------------------------
 * Bridge between the app and your Google Sheet. Reads your progress on
 * load and writes it back when you change something. Your data lives
 * entirely in your own Sheet.
 *
 * SETUP (about 6 minutes, once):
 *   1. New Google Sheet  →  sheets.new
 *   2. Extensions ▸ Apps Script. Delete the sample, paste THIS file, Save.
 *   3. Deploy ▸ New deployment ▸ gear ▸ "Web app".
 *         Execute as:      Me
 *         Who has access:  Anyone        ← required so the app can reach it
 *      Deploy, then Authorize access.
 *   4. Copy the Web app URL (ends in /exec) into CONFIG.SCRIPT_URL at the
 *      top of index.html, then re-host the file.
 *
 * Three tabs ("Problems", "Reviews", "Settings") are created automatically.
 * Read them anytime; let the app do the writing.
 * ------------------------------------------------------------------
 */

var P_HEADERS = ["id","name","cat","diff","blind","num","url","status","comfort","dateSolved","notes","retired"];
var R_HEADERS = ["id","problemId","num","due","status","result","doneOn"];

function doGet(e) {
  return jsonOut(loadAll());
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return jsonOut({ ok: false, error: "bad json" }); }

  if (body.action === "save") {
    saveAll(body.problems || [], body.reviews || [], body.settings || null);
    return jsonOut({ ok: true, saved: { problems: (body.problems||[]).length, reviews: (body.reviews||[]).length } });
  }
  if (body.action === "load") return jsonOut(loadAll());
  return jsonOut({ ok: false, error: "unknown action" });
}

/* ---------- read ---------- */
function loadAll() {
  return {
    problems: readSheet("Problems", P_HEADERS),
    reviews:  readSheet("Reviews",  R_HEADERS),
    settings: readSettings()
  };
}

function readSheet(name, headers) {
  var s = ss().getSheetByName(name);
  if (!s || s.getLastRow() < 2) return [];
  var values = s.getRange(2, 1, s.getLastRow() - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row[0] === "" || row[0] === null) continue;
    var o = {};
    for (var c = 0; c < headers.length; c++) o[headers[c]] = row[c];
    out.push(coerce(name, o));
  }
  return out;
}

function readSettings() {
  var s = ss().getSheetByName("Settings");
  if (!s || s.getLastRow() < 2) return null;
  var raw = s.getRange(2, 1).getValue();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

/* ---------- write ---------- */
function saveAll(problems, reviews, settings) {
  writeSheet("Problems", P_HEADERS, problems);
  writeSheet("Reviews",  R_HEADERS, reviews);
  if (settings) writeSettings(settings);
}

function writeSheet(name, headers, rows) {
  var s = sheetFor(name, headers);
  if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, headers.length).clearContent();
  if (!rows.length) return;
  var data = rows.map(function (r) {
    return headers.map(function (h) {
      var v = r[h];
      if (v === null || v === undefined) return "";
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      return v;
    });
  });
  var range = s.getRange(2, 1, data.length, headers.length);
  range.setNumberFormat("@");      // plain text — keeps dates as exact strings
  range.setValues(data);
}

function writeSettings(settings) {
  var s = ss().getSheetByName("Settings");
  if (!s) { s = ss().insertSheet("Settings"); s.getRange(1,1).setValue("json").setFontWeight("bold"); }
  s.getRange(2, 1).setNumberFormat("@").setValue(JSON.stringify(settings));
}

/* ---------- helpers ---------- */
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheetFor(name, headers) {
  var s = ss().getSheetByName(name);
  if (!s) s = ss().insertSheet(name);
  if (s.getLastRow() === 0) {
    s.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    s.setFrozenRows(1);
  }
  return s;
}

function asISO(v) {
  if (v === "" || v === null || v === undefined) return null;
  if (Object.prototype.toString.call(v) === "[object Date]")
    return Utilities.formatDate(v, ss().getSpreadsheetTimeZone(), "yyyy-MM-dd");
  return String(v).slice(0, 10);
}

function coerce(name, o) {
  if (name === "Problems") {
    return {
      id: Number(o.id), name: String(o.name), cat: String(o.cat), diff: String(o.diff),
      blind: (o.blind === true || String(o.blind).toLowerCase() === "true"),
      num: o.num === "" ? 0 : Number(o.num), url: o.url ? String(o.url) : "",
      status: o.status ? String(o.status) : "Todo",
      comfort: (o.comfort === "" || o.comfort === null) ? 0 : Number(o.comfort),
      dateSolved: asISO(o.dateSolved),
      notes: o.notes ? String(o.notes) : "",
      retired: (o.retired === true || String(o.retired).toLowerCase() === "true")
    };
  }
  return {
    id: Number(o.id), problemId: Number(o.problemId), num: Number(o.num),
    due: asISO(o.due), status: o.status ? String(o.status) : "due",
    result: o.result ? String(o.result) : null, doneOn: asISO(o.doneOn)
  };
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
