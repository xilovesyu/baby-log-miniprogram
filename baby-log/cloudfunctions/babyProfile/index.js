// 云函数 babyProfile：宝宝档案 CRUD + 权限
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const DEFAULT_MILK_OPTIONS = [30, 50, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170,
  180, 190, 200, 210, 220, 230, 240, 250, 260, 270, 280, 290];

async function ensureMilkOptions(babyId) {
  const exist = await db.collection("milk_options").where({ babyId }).get();
  if (exist.data.length === 0) {
    await db.collection("milk_options").add({
      data: { babyId, options: DEFAULT_MILK_OPTIONS, updatedAt: db.serverDate() }
    });
  }
}

async function canAccess(openid, baby) {
  if (!baby) return false;
  if (baby.ownerId === openid) return true;
  return (baby.members || []).some(m => m.openid === openid && m.role !== "removed");
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action, payload, babyId } = event;
  const coll = db.collection("babies");

  if (["get", "update", "delete", "milkOptions"].includes(action) && !babyId) {
    return { ok: false, msg: "缺少 babyId" };
  }

  if (action === "list") {
    const r = await coll.where(db.command.or([
      { ownerId: OPENID },
      { "members.openid": OPENID }
    ])).orderBy("createdAt", "asc").get();
    return { ok: true, data: r.data };
  }

  if (action === "get") {
    const b = await coll.doc(babyId).get().catch(() => null);
    if (!b || !b.data || !(await canAccess(OPENID, b.data))) return { ok: false, msg: "无权访问" };
    return { ok: true, data: b.data };
  }

  if (action === "create") {
    const data = {
      name: String(payload.name || "").slice(0, 24),
      gender: payload.gender || "unknown",
      birthDate: payload.birthDate,
      birthWeightKg: Number(payload.birthWeightKg || 0),
      avatarFileId: payload.avatarFileId || "",
      ownerId: OPENID,
      members: [{ openid: OPENID, role: "owner", addedAt: db.serverDate() }],
      feedingGoal: payload.feedingGoal || "",
      tempAlertC: Number(payload.tempAlertC || 37.3),
      solidFoodStartDate: payload.solidFoodStartDate || "2026-07-01",
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    };
    const r = await coll.add({ data });
    await ensureMilkOptions(r._id);
    return { ok: true, data: Object.assign({ _id: r._id }, data) };
  }

  if (action === "update") {
    const b = await coll.doc(babyId).get().catch(() => null);
    if (!b || !b.data) return { ok: false, msg: "不存在" };
    if (b.data.ownerId !== OPENID) return { ok: false, msg: "仅创建者可修改档案" };
    const upd = {};
    ["name", "gender", "birthDate", "birthWeightKg", "avatarFileId", "feedingGoal",
      "tempAlertC", "solidFoodStartDate"].forEach(k => {
        if (payload[k] !== undefined) upd[k] = payload[k];
      });
    upd.updatedAt = db.serverDate();
    await coll.doc(babyId).update({ data: upd });
    return { ok: true, data: { _id: babyId } };
  }

  if (action === "delete") {
    const b = await coll.doc(babyId).get().catch(() => null);
    if (!b || !b.data || b.data.ownerId !== OPENID) return { ok: false, msg: "仅创建者可删除" };
    // 级联删除：records / daily_summaries / milk_options（分批）
    async function purge(name) {
      const c = db.collection(name);
      while (true) {
        const r = await c.where({ babyId }).limit(100).get();
        if (!r.data.length) break;
        await Promise.all(r.data.map(d => c.doc(d._id).remove()));
      }
    }
    await purge("records");
    await purge("daily_summaries");
    await purge("milk_options");
    await coll.doc(babyId).remove();
    return { ok: true, data: { _id: babyId } };
  }

  if (action === "milkOptions") {
    const b = await coll.doc(babyId).get().catch(() => null);
    if (!b || !b.data) return { ok: false, msg: "不存在" };
    const own = b.data.ownerId === OPENID;
    const m = (b.data.members || []).find(x => x.openid === OPENID);
    if (!own && !(m && (m.role === "owner" || m.role === "editor"))) return { ok: false, msg: "无权限" };
    let opts = Array.from(new Set((payload.options || []).map(Number).filter(n => n > 0 && n <= 2000)))
      .sort((a, c) => a - c);
    if (!opts.length) opts = DEFAULT_MILK_OPTIONS.slice();
    const cur = await db.collection("milk_options").where({ babyId }).get();
    if (cur.data.length) await db.collection("milk_options").doc(cur.data[0]._id).update({ data: { options: opts, updatedAt: db.serverDate() } });
    else await db.collection("milk_options").add({ data: { babyId, options: opts, updatedAt: db.serverDate() } });
    return { ok: true, data: { options: opts } };
  }

  return { ok: false, msg: "未知 action" };
};
