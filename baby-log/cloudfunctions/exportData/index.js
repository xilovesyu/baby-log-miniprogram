// 云函数 exportData：按「19 子表」结构导出宝宝记录为 xlsx，上传云存储，返回 fileID
// 布局与 tools/export_excel.py 一致：月度表按周分块(≤7天/块)，每天两列(时间|奶量)，
// 块尾=当日总量(SUM 公式，吐奶用 -v 回退) + 累计量；辅食/备注写在时间列；含 黄疸体重 / 奶量选项。
const cloud = require("wx-server-sdk");
const ExcelJS = require("exceljs");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function numToCol(n) { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function pad(n) { return String(n).padStart(2, "0"); }
function sheetName(ym) { const [y, m] = ym.split("-"); return y === "2025" ? `吃奶时间${+m}月` : `吃奶时间${y.slice(2)}年${+m}月`; }
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function parseHM(s) { if (!s) return null; const [h, mi] = s.split(":").map(Number); const d = new Date(1970, 0, 1, h || 0, mi || 0); return d; }

async function allRecords(babyId) {
  const out = []; let off = 0;
  while (true) {
    const r = await db.collection("records").where({ babyId }).skip(off).limit(100).get();
    out.push(...r.data); if (r.data.length < 100) break; off += 100;
  }
  return out;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const babyId = event.babyId;
  const b = await db.collection("babies").doc(babyId).get().catch(() => null);
  if (!b || !b.data) return { ok: false, msg: "宝宝不存在" };
  const baby = b.data;
  if (baby.ownerId !== OPENID && !(baby.members || []).some(m => m.openid === OPENID))
    return { ok: false, msg: "无权限" };

  const recs = await allRecords(babyId);
  const feeds = {}, solids = {}, notes = {};
  const byDate = (map, d) => (map[d] = map[d] || []);
  for (const r of recs) {
    if (r.type === "feeding") byDate(feeds, r.date).push(r);
    else if (r.type === "solid") byDate(solids, r.date).push(r);
    else if (r.type === "note") byDate(notes, r.date).push(r);
  }
  // 净奶量(剔吐) + 累计 + 每日吐量
  const dayNet = {}, dayVomit = {};
  for (const date in feeds) {
    dayNet[date] = feeds[date].reduce((a, x) => a + (x.vomited ? 0 : Number(x.amountMl || 0)), 0);
    dayVomit[date] = feeds[date].reduce((a, x) => a + (x.vomited ? Number(x.amountMl || 0) : 0), 0);
  }
  let cum = 0; const cumBy = {};
  for (const date of Object.keys(dayNet).sort()) { cum += dayNet[date]; cumBy[date] = cum; }

  const allDates = new Set([...Object.keys(feeds), ...Object.keys(solids), ...Object.keys(notes)]);
  const months = [...new Set([...allDates].map(x => x.slice(0, 7)))].sort();

  const wb = new ExcelJS.Workbook();
  for (const ym of months) {
    const ws = wb.addWorksheet(sheetName(ym));
    const [y, m] = ym.split("-").map(Number);
    const nd = daysInMonth(y, m);
    const days = []; for (let dd = 1; dd <= nd; dd++) days.push(`${y}-${pad(m)}-${pad(dd)}`);
    let row = 1;
    for (let bs = 0; bs < nd; bs += 7) {
      const wk = days.slice(bs, bs + 7);
      wk.forEach((ds, i) => { const [yy, mm, dd] = ds.split("-").map(Number); const c = ws.getCell(row, 1 + i * 2); c.value = new Date(yy, mm - 1, dd); c.numFmt = "m月d日"; });
      const headerRow = row;
      const colEntries = wk.map(ds => {
        const ent = [];
        const fs = (feeds[ds] || []).slice().sort((a, z) => (a.time ? 0 : 1) - (z.time ? 0 : 1) || String(a.time).localeCompare(String(z.time)));
        for (const x of fs) {
          if (x.note) ent.push({ text: (x.time ? x.time + " " : "") + x.note, ml: `${+x.amountMl}ml` });
          else ent.push({ t: parseHM(x.time), ml: `${+x.amountMl}ml` });
        }
        for (const s of solids[ds] || []) ent.push({ text: (s.time ? s.time + " " : "") + "（" + (s.food || "") + "）" });
        for (const n of notes[ds] || []) ent.push({ text: n.text || "" });
        return ent;
      });
      const maxh = Math.max(0, ...colEntries.map(e => e.length));
      const firstData = headerRow + 1;
      for (let ri = 0; ri < maxh; ri++) {
        for (let i = 0; i < wk.length; i++) {
          const e = colEntries[i][ri]; if (!e) continue;
          if (e.ml != null) {
            if (e.t) { const c = ws.getCell(firstData + ri, 1 + i * 2); c.value = e.t; c.numFmt = "h:mm"; }
            else if (e.text) ws.getCell(firstData + ri, 1 + i * 2).value = e.text;
            ws.getCell(firstData + ri, 2 + i * 2).value = e.ml;
          } else if (e.text != null) {
            ws.getCell(firstData + ri, 1 + i * 2).value = e.text;
          }
        }
      }
      const totalRow = firstData + maxh, cumRow = totalRow + 1;
      wk.forEach((ds, i) => {
        const col = 2 + i * 2, L = numToCol(col), last = totalRow - 1;
        if (last >= firstData) {
          const v = dayVomit[ds] || 0;
          ws.getCell(totalRow, col).value = { formula: `SUM(${L}${firstData}:${L}${last})` + (v ? `-${v}` : ""), result: dayNet[ds] || 0 };
        }
        if (cumBy[ds] != null) ws.getCell(cumRow, col).value = cumBy[ds];
      });
      row = cumRow + 2;
    }
  }

  // 黄疸体重
  const w2 = wb.addWorksheet("黄疸体重");
  w2.getCell("A1").value = "黄疸值"; let r2 = 2;
  for (const x of recs.filter(x => x.type === "jaundice").sort((a, b) => a.date.localeCompare(b.date))) {
    const [y, m, dd] = x.date.split("-").map(Number); w2.getCell(r2, 1).value = new Date(y, m - 1, dd); w2.getCell(r2, 2).value = x.valueJ; r2++;
  }
  r2++; w2.getCell(r2, 1).value = "体重"; r2++;
  for (const x of recs.filter(x => x.type === "weight").sort((a, b) => a.date.localeCompare(b.date))) {
    const [y, m, dd] = x.date.split("-").map(Number);
    w2.getCell(r2, 1).value = new Date(y, m - 1, dd); w2.getCell(r2, 2).value = Math.round(x.valueKg * 1000) / 1000; w2.getCell(r2, 3).value = `${Math.round(x.valueKg * 200) / 100}斤`; r2++;
  }

  // 奶量选项
  const w3 = wb.addWorksheet("奶量选项"); w3.getCell("A1").value = "奶量";
  const mo = await db.collection("milk_options").where({ babyId }).get();
  const opts = (mo.data[0] && mo.data[0].options) || [];
  opts.forEach((v, i) => { w3.getCell(2 + i, 1).value = `${v}ml`; });

  const buf = await wb.xlsx.writeBuffer();
  const cloudPath = `exports/${babyId}-${Date.now()}.xlsx`;
  const up = await cloud.uploadFile({ cloudPath, fileContent: Buffer.from(buf) });
  return { ok: true, data: { fileID: up.fileID, name: `${baby.name || "宝宝"}喂养记录.xlsx`, months: months.length } };
};
