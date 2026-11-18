// 云函数 importJson：批量导入标准化记录（可重入：先 clear 再分块 chunk）
// docs 由小程序导入向导按 import_preview.json 展平并打好 type 后传入。
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function canWrite(openid, babyId) {
  const b = await db.collection("babies").doc(babyId).get().catch(() => null);
  if (!b || !b.data) return false;
  if (b.data.ownerId === openid) return true;
  const m = (b.data.members || []).find(x => x.openid === openid);
  return !!(m && (m.role === "owner" || m.role === "editor"));
}

const FIELDS = ["type", "date", "time", "amountMl", "vomited", "food", "meal", "portion",
  "texture", "color", "durationMin", "valueC", "valueKg", "valueJ", "method", "note", "text", "unit"];

function cleanDoc(d, babyId, openid) {
  const o = { babyId, source: "import", createdBy: openid,
    createdAt: db.serverDate(), updatedAt: db.serverDate() };
  for (const k of FIELDS) if (d[k] !== undefined && d[k] !== null && d[k] !== "") o[k] = d[k];
  if (o.type === "feeding") o.amountMl = Number(o.amountMl || 0);
  return o;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action, babyId, docs } = event;
  if (!(await canWrite(OPENID, babyId))) return { ok: false, msg: "无权限" };

  if (action === "clear") {
    // 按本次涉及的日期集合精确删除（分批导入互不覆盖；同区间重导仍幂等）。
    // 未传 dates 时回退为「清空该宝宝所有 import 记录」的旧行为。
    const _ = db.command;
    const c = db.collection("records");
    const dates = Array.isArray(event.dates) ? event.dates.filter(Boolean) : null;
    let removed = 0;
    if (!dates || !dates.length) {
      while (true) {
        const r = await c.where({ babyId, source: "import" }).limit(100).get();
        if (!r.data.length) break;
        await Promise.all(r.data.map(d => c.doc(d._id).remove()));
        removed += r.data.length;
      }
    } else {
      for (let i = 0; i < dates.length; i += 50) {
        const chunk = dates.slice(i, i + 50);
        while (true) {
          const r = await c.where({ babyId, source: "import", date: _.in(chunk) }).limit(100).get();
          if (!r.data.length) break;
          await Promise.all(r.data.map(d => c.doc(d._id).remove()));
          removed += r.data.length;
        }
      }
    }
    return { ok: true, data: { removed } };
  }

  if (action === "chunk") {
    if (!Array.isArray(docs)) return { ok: false, msg: "docs 需为数组" };
    const cleaned = docs.map(d => cleanDoc(d, babyId, OPENID));
    const dates = Array.from(new Set(cleaned.map(d => d.date).filter(Boolean)));
    // 分批并发写入（每批 50）
    for (let i = 0; i < cleaned.length; i += 50) {
      await Promise.all(cleaned.slice(i, i + 50).map(d => db.collection("records").add({ data: d })));
    }
    return { ok: true, data: { inserted: cleaned.length, dates } };
  }

  return { ok: false, msg: "未知 action" };
};
