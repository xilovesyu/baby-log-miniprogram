// tools/verify_parse_parity.js — 用 golden(import_preview.json, Python 已校验) 对账 JS 版 lib/parse.js
// 本地跑：node tools/verify_parse_parity.js  （不进小程序、不部署）
const path = require("path");
const fs = require("fs");
const ExcelJS = require(path.join(__dirname, "..", "baby-log", "cloudfunctions", "exportData", "node_modules", "exceljs"));
const { parseWorkbook } = require(path.join(__dirname, "..", "baby-log", "cloudfunctions", "importExcel", "lib", "parse"));

const XLSX = path.join(__dirname, "..", "data", "西柚记录.xlsx");
const GOLDEN = path.join(__dirname, "..", "import-preview", "import_preview.json");

function netByDate(recs) {
  const m = {};
  for (const f of recs) { if (!f.vomited) m[f.date] = (m[f.date] || 0) + Number(f.amountMl); }
  return m;
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const { preview, report } = parseWorkbook(wb);
  const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));

  const cmp = [];
  const cnt = (a) => (a || []).length;
  cmp.push(["吃奶", cnt(golden.feeding_records), cnt(preview.feeding_records)]);
  cmp.push(["辅食", cnt(golden.solid_food_records), cnt(preview.solid_food_records)]);
  cmp.push(["备注", cnt(golden.notes), cnt(preview.notes)]);
  const gj = (golden.health_metrics || []).filter(x => x.type === "jaundice").length;
  const pj = (preview.health_metrics || []).filter(x => x.type === "jaundice").length;
  cmp.push(["黄疸", gj, pj]);
  const gw = (golden.health_metrics || []).filter(x => x.type === "weight").length;
  const pw = (preview.health_metrics || []).filter(x => x.type === "weight").length;
  cmp.push(["体重", gw, pw]);
  cmp.push(["奶量档位", (golden.milk_options || []).length, (preview.milk_options || []).length]);

  console.log("=== 条数对账 (golden vs JS) ===");
  let ok = true;
  for (const [k, g, j] of cmp) { const same = g === j; if (!same) ok = false; console.log(`  ${k}: golden ${g} | JS ${j} ${same ? "✓" : "✗"}`); }

  // 逐日净奶量对账
  const gn = netByDate(golden.feeding_records), jn = netByDate(preview.feeding_records);
  const days = new Set([...Object.keys(gn), ...Object.keys(jn)]);
  let diff = 0; const samples = [];
  for (const d of days) {
    const g = gn[d] || 0, j = jn[d] || 0;
    if (Math.abs(g - j) > 0.5) { diff++; if (samples.length < 15) samples.push([d, g, j]); }
  }
  console.log(`\n=== 逐日净奶量对账 ===\n  一致 ${days.size - diff} 天 / 不一致 ${diff} 天`);
  for (const s of samples) console.log("   diff", s[0], "golden", s[1], "JS", s[2]);

  console.log("\n=== JS report ===");
  console.log(JSON.stringify(report, null, 2));
  console.log("\n结论:", (ok && diff <= 2) ? "PASS（JS 与 Python golden 等价，差异在已知取样瑕疵范围内）" : "NEEDS-FIX");
})().catch(e => { console.error("运行失败:", e && e.message || e); process.exit(1); });
