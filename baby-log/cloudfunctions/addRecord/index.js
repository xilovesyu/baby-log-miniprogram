// 云函数 addRecord：统一写记录 + 权限校验 + 触发聚合
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TYPES = ["feeding", "solid", "diaper", "sleep", "temp", "weight", "jaundice", "note"];
const FIELDS = {
  feeding: ["date", "time", "amountMl", "vomited", "note"],
  solid:   ["date", "time", "meal", "food", "portion", "note"],
  diaper:  ["date", "time", "texture", "color", "note"],
  sleep:   ["date", "time", "durationMin", "startHM", "endHM", "note"],
  temp:    ["date", "time", "valueC", "note"],
  weight:  ["date", "time", "valueKg", "unit", "note"],
  jaundice:["date", "time", "valueJ", "method", "note"],
  note:    ["date", "time", "text"]
};

function pick(type, data) {
  const out = {};
  for (const k of FIELDS[type]) if (data[k] !== undefined) out[k] = data[k];
  // 类型清洗
  if (type === "feeding") {
    out.amountMl = Number(out.amountMl || 0);
    if (data.vomited) out.vomited = true;            // 业务规则：吐奶不计总量
  }
  if (type === "sleep" && !out.durationMin && out.startHM && out.endHM) {
    const [h1, m1] = out.startHM.split(":").map(Number);
    const [h2, m2] = out.endHM.split(":").map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins < 0) mins += 24 * 60;                   // 跨天
    out.durationMin = mins;
    out.time = out.startHM;
  }
  if (type === "weight" && out.valueKg != null) {
    out.valueKg = Number(out.valueKg);
  }
  return out;
}

async function canWrite(openid, babyId) {
  const b = await db.collection("babies").doc(babyId).get().catch(() => null);
  if (!b || !b.data) return false;
  if (b.data.ownerId === openid) return true;
  const m = (b.data.members || []).find(x => x.openid === openid);
  return !!(m && (m.role === "owner" || m.role === "editor"));
}

async function aggregate(babyId, dates) {
  try {
    await cloud.callFunction({ name: "dailyAggregate", data: { babyId, dates: dates.filter(Boolean) } });
  } catch (e) {
    console.error("aggregate failed", e);
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { op, babyId, type, id, data } = event;
  if (!TYPES.includes(type)) return { ok: false, msg: "未知记录类型 " + type };
  if (!(await canWrite(OPENID, babyId))) return { ok: false, msg: "无权限操作该宝宝数据" };

  const coll = db.collection("records");
  const clean = pick(type, data || {});
  let touchedDate = clean.date;

  if (op === "add") {
    const doc = Object.assign({
      babyId, type, createdBy: OPENID, createdAt: db.serverDate(), updatedAt: db.serverDate()
    }, clean);
    const r = await coll.add({ data: doc });
    await aggregate(babyId, [touchedDate]);
    return { ok: true, data: { _id: r._id } };
  }
  if (op === "update") {
    const old = await coll.doc(id).get();
    if (!old.data || old.data.babyId !== babyId) return { ok: false, msg: "记录不存在" };
    await coll.doc(id).update({ data: Object.assign({}, clean, { updatedBy: OPENID, updatedAt: db.serverDate() }) });
    await aggregate(babyId, [touchedDate, old.data.date]);
    return { ok: true, data: { _id: id } };
  }
  if (op === "delete") {
    const old = await coll.doc(id).get();
    if (!old.data || old.data.babyId !== babyId) return { ok: false, msg: "记录不存在" };
    await coll.doc(id).remove();
    await aggregate(babyId, [old.data.date]);
    return { ok: true, data: { _id: id } };
  }
  return { ok: false, msg: "未知操作 " + op };
};
