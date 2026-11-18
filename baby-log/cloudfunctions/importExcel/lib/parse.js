// lib/parse.js — 脏表（西柚记录.xlsx 19 子表）解析器，ExcelJS 版。
// 逻辑严格镜像 tools/parse_excel.py（已用真实数据校验：逐日总奶量 485/486 对齐）。
// 纯函数：输入 ExcelJS Workbook → 输出 { preview, report }。不写库、不依赖 wx/cloud，可本地跑对账。

const MONTH_PREFIX = "吃奶时间";
const pad = n => String(n).padStart(2, "0");

// ---- 值归一化：把 ExcelJS 各种 cell.value 形态收敛成 primitive / Date ----
function normalize(cell) {
  let v = cell;
  if (v == null) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v;
    if (v.result !== undefined) return normalize(v.result);      // 公式缓存值
    if (v.text !== undefined) return v.text;                      // {text}
    if (v.richText) return (v.richText || []).map(t => t.text).join("");
    if (v.formula !== undefined && v.result === undefined) return ""; // 无缓存结果的公式
    if (v.error !== undefined) return "";
    return String(v);
  }
  return v; // number | string | boolean
}

function isNum(v) { return typeof v === "number" && !isNaN(v); }
function isDateCell(v) { return v instanceof Date && v.getFullYear() > 1904; }
function isTimeCell(v) { return v instanceof Date && v.getFullYear() <= 1904; }
// 兼容：少数时间以「日的小数」0~1 数值出现
function isTimeLike(v) { return isTimeCell(v) || (isNum(v) && v >= 0 && v < 1); }

function dateStr(v) { return v.getFullYear() + "-" + pad(v.getMonth() + 1) + "-" + pad(v.getDate()); }
function timeStr(v) {
  if (v instanceof Date) return pad(v.getHours()) + ":" + pad(v.getMinutes());
  if (isNum(v)) { const mins = Math.round(v * 1440); return pad(Math.floor(mins / 60) % 24) + ":" + pad(mins % 60); }
  return null;
}

const ML_RE = /^\s*(\d+(?:\.\d+)?)\s*ml\s*$/i;
function parseML(v) { if (typeof v === "string") { const m = ML_RE.exec(v); if (m) return parseFloat(m[1]); } return null; }

// 半角: / 全角： / 点号 都吃
const TIME_IN_TEXT = /(\d{1,2})\s*[:：.]\s*(\d{2})/;
function timeFromText(s) {
  const m = TIME_IN_TEXT.exec(String(s)); if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h >= 0 && h < 24 && mi >= 0 && mi < 60) return pad(h) + ":" + pad(mi);
  return null;
}
const FOOD_PAREN = /[（(].+?[)）]/;
const NOTE_KW = /(没拉|拉屎|拉了|💩|尿|睡|泡奶|起来|没吃|吃完|剩|吐|奶量|测|黄疸|体重|体温)/;

// 把 worksheet 读成 0-based 二维数组（列按绝对列号对齐，等价 calamine skip_empty_area=False）
function sheetToGrid(ws) {
  const grid = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const arr = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      arr[colNumber - 1] = normalize(cell.value);
    });
    for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) arr[i] = "";
    grid[rowNumber - 1] = arr;
  });
  return grid;
}

function looksLikeFormulaRow(row) {
  let hits = 0, total = 0;
  for (let c = 1; c < row.length; c += 2) {
    const v = row[c], lv = row[c - 1];
    if (isNum(v)) { total++; if (lv === "" || lv == null) hits++; }
  }
  return total >= 2 && hits >= 2;
}

function parseMonthSheet(name, grid, out) {
  const headerRows = [];
  for (let ri = 0; ri < grid.length; ri++) {
    const r = grid[ri] || [];
    const dcols = [];
    for (let ci = 0; ci < r.length; ci++) if (isDateCell(r[ci])) dcols.push(ci);
    if (dcols.length >= 2) headerRows.push([ri, dcols]);
  }
  headerRows.push([grid.length, []]);
  for (let bi = 0; bi < headerRows.length - 1; bi++) {
    const hri = headerRows[bi][0], dcols = headerRows[bi][1];
    const nextHri = headerRows[bi + 1][0];
    const colDate = {};
    for (const c of dcols) colDate[c] = dateStr(grid[hri][c]);
    for (let ri = hri + 1; ri < nextHri; ri++) {
      const r = grid[ri] || [];
      if (looksLikeFormulaRow(r)) { out.formulaRowsSkipped++; continue; }
      for (const c of Object.keys(colDate).map(Number).sort((a, b) => a - b)) {
        const dstr = colDate[c];
        const vTime = r[c] !== undefined ? r[c] : "";
        const vMl = r[c + 1] !== undefined ? r[c + 1] : "";
        const ml = parseML(vMl);
        if (ml !== null) {
          let t = null, note = null;
          if (isTimeLike(vTime)) t = timeStr(vTime);
          else if (typeof vTime === "string" && vTime.trim()) { t = timeFromText(vTime); note = vTime.trim(); }
          const vomited = typeof vTime === "string" && vTime.indexOf("吐") >= 0;
          const rec = { baby: "西柚", date: dstr, time: t, amountMl: ml, _row: ri, _col: c };
          if (vomited) rec.vomited = true;
          if (note) rec.note = note;
          out.feedings.push(rec);
        } else if (isTimeLike(vTime)) {
          out.uncertain.push({ sheet: name, date: dstr, row: ri, col: c, raw: timeStr(vTime), why: "有时间无奶量" });
        } else if (typeof vTime === "string" && vTime.trim()) {
          const stray = parseML(vTime);
          if (stray !== null) { out.feedings.push({ baby: "西柚", date: dstr, time: null, amountMl: stray, _row: ri, _col: c }); continue; }
          const hasFood = FOOD_PAREN.test(vTime);
          const t = timeFromText(vTime);
          const rec = { baby: "西柚", date: dstr, time: t, row: ri, col: c, sheet: name, raw: vTime };
          if (hasFood) {
            const m = FOOD_PAREN.exec(vTime);
            rec.food = m ? m[0].replace(/[（）()]/g, "") : vTime;
            rec.note = vTime.trim();
            out.solidfoods.push(rec);
          } else {
            rec.note = vTime.trim();
            out.notes.push(rec);
          }
        }
      }
    }
  }
}

function parseHealthSheet(grid, out) {
  let section = null;
  for (const r of grid) {
    const c0 = r[0] !== undefined ? r[0] : "";
    const c1 = r[1] !== undefined ? r[1] : "";
    const c2 = r[2] !== undefined ? r[2] : "";
    if (typeof c0 === "string" && c0.trim() === "黄疸值") { section = "jaundice"; continue; }
    if (typeof c0 === "string" && c0.trim() === "体重") { section = "weight"; continue; }
    if (isDateCell(c0) && isNum(c1) && section === "jaundice") {
      if (c1 < 3) out.jaundiceDropped.push({ date: dateStr(c0), value: c1, reason: "笔误，按决策剔除" });
      else out.jaundice.push({ date: dateStr(c0), value: c1 });
    } else if (isDateCell(c0) && section === "weight") {
      let kg = null, raw = c1, jin = null;
      if (isNum(c1)) kg = c1 >= 100 ? c1 / 1000 : c1;
      else if (typeof c1 === "string") { const m = /(\d+(?:\.\d+)?)\s*kg/i.exec(c1); if (m) kg = parseFloat(m[1]); }
      if (typeof c2 === "string") { const m = /(\d+(?:\.\d+)?)\s*斤/.exec(c2); if (m) jin = parseFloat(m[1]); }
      if (kg === null && jin !== null) kg = jin / 2;
      out.weights.push({ date: dateStr(c0), kg, jin, raw: (raw !== "" && raw != null) ? String(raw) : null, derived: kg === null });
    } else if (isTimeLike(c0) && isNum(c1) && section === "weight" && c1 > 30 && c1 < 45) {
      out.tempsDropped.push({ time: timeStr(c0), c: c1, reason: "过期数据/无日期，按决策丢弃" });
    }
  }
}

function parseMilkOptions(grid) {
  const opts = [];
  for (const r of grid) { const v = r[0]; const m = parseML(v); if (m !== null) opts.push(m); }
  return opts;
}

function parseWorkbook(wb) {
  const out = {
    feedings: [], solidfoods: [], notes: [], uncertain: [],
    jaundice: [], weights: [], jaundiceDropped: [], tempsDropped: [],
    formulaRowsSkipped: 0
  };
  const names = wb.worksheets.map(w => w.name);
  for (const ws of wb.worksheets) {
    if (ws.name.indexOf(MONTH_PREFIX) === 0) parseMonthSheet(ws.name, sheetToGrid(ws), out);
  }
  const hz = wb.getWorksheet("黄疸体重"); if (hz) parseHealthSheet(sheetToGrid(hz), out);
  const mo = wb.getWorksheet("奶量选项"); const milkOptions = mo ? parseMilkOptions(sheetToGrid(mo)) : [];

  // 每日聚合（剔吐）+ 累计 + 吐奶
  const agg = {}, vomitRecs = [];
  for (const f of out.feedings) {
    const d = f.date; const a = agg[d] || (agg[d] = { total: 0, raw_total: 0, n: 0, vomit_ml: 0, vomit_n: 0 });
    a.raw_total += f.amountMl; a.n++;
    if (f.vomited) { a.vomit_ml += f.amountMl; a.vomit_n++; vomitRecs.push({ date: d, time: f.time, amountMl: f.amountMl, note: f.note }); }
    else a.total += f.amountMl;
  }

  const preview = {
    feeding_records: out.feedings,
    solid_food_records: out.solidfoods,
    notes: out.notes,
    health_metrics: [
      ...out.jaundice.map(x => Object.assign({ type: "jaundice" }, x)),
      ...out.weights.map(x => ({ type: "weight", valueKg: x.kg, jin: x.jin, date: x.date }))
    ],
    milk_options: milkOptions,
    uncertain_rows: out.uncertain,
    dropped: { temps_expired: out.tempsDropped, jaundice_typos: out.jaundiceDropped },
    vomited_excluded_from_total: vomitRecs
  };

  const report = {
    months: names.filter(n => n.indexOf(MONTH_PREFIX) === 0).length,
    feedings: out.feedings.length, solids: out.solidfoods.length, notes: out.notes.length,
    jaundice: out.jaundice.length, weights: out.weights.length, milkOptions: milkOptions.length,
    skippedFormulaRows: out.formulaRowsSkipped, uncertainRows: out.uncertain.length,
    vomitCount: vomitRecs.length, tempsDropped: out.tempsDropped.length, jaundiceDropped: out.jaundiceDropped.length,
    recordDays: Object.keys(agg).length
  };
  return { preview, report, agg };
}

module.exports = { parseWorkbook, sheetToGrid, normalize };
