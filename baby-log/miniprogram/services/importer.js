const api = require("./api");

// 把 import_preview.json 展平成带 type 的记录数组（吐奶/过期/笔误已在离线阶段剔除）
function flatten(preview) {
  const docs = [];
  (preview.feeding_records || []).forEach(f => docs.push({
    type: "feeding", date: f.date, time: f.time || null, amountMl: Number(f.amountMl),
    vomited: !!f.vomited, note: f.note || ""
  }));
  (preview.solid_food_records || []).forEach(s => docs.push({
    type: "solid", date: s.date, time: s.time || null, food: s.food || s.raw || "", note: s.note || s.raw || ""
  }));
  (preview.notes || []).forEach(n => docs.push({
    type: "note", date: n.date, text: n.raw || n.text || ""
  }));
  (preview.health_metrics || []).forEach(h => {
    if (h.type === "weight") docs.push({ type: "weight", date: h.date, valueKg: Number(h.valueKg) });
    else if (h.type === "temp" && h.valueC != null) docs.push({ type: "temp", date: h.date, time: h.time || null, valueC: Number(h.valueC) });
    else if (h.type === "jaundice") docs.push({ type: "jaundice", date: h.date, valueJ: Number(h.value) });
  });
  return docs.filter(d => d.date);
}

function summary(preview) {
  return {
    feeding: (preview.feeding_records || []).length,
    solid: (preview.solid_food_records || []).length,
    note: (preview.notes || []).length,
    health: (preview.health_metrics || []).length,
    milkOptions: (preview.milk_options || []).length
  };
}

async function run(preview, babyId, onProgress) {
  const docs = flatten(preview);
  const s = summary(preview);
  const datesAll = Array.from(new Set(docs.map(d => d.date).filter(Boolean)));
  if (onProgress) onProgress({ step: "清理本次区间旧数据" });
  await api.call("importJson", { action: "clear", babyId, dates: datesAll });

  const CH = 120;
  let inserted = 0; const dateSet = new Set();
  for (let i = 0; i < docs.length; i += CH) {
    const r = await api.call("importJson", { action: "chunk", babyId, docs: docs.slice(i, i + CH) });
    inserted += r.inserted; (r.dates || []).forEach(d => dateSet.add(d));
    if (onProgress) onProgress({ step: "写入记录", done: Math.min(i + CH, docs.length), total: docs.length });
  }

  const dates = Array.from(dateSet).sort();
  const AC = 25;
  for (let i = 0; i < dates.length; i += AC) {
    await api.call("dailyAggregate", { babyId, dates: dates.slice(i, i + AC), skipCumulative: true });
    if (onProgress) onProgress({ step: "计算每日总量", done: Math.min(i + AC, dates.length), total: dates.length });
  }
  if (onProgress) onProgress({ step: "计算累计奶量", done: 1, total: 1 });
  await api.call("dailyAggregate", { babyId, rebuildCumulative: true });
  try { getApp().markDataChanged(); } catch (e) {}
  return { inserted, days: dates.length, summary: s };
}

module.exports = { flatten, summary, run };
