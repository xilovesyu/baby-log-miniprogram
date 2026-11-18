// 云函数 shareToken：生成 / 校验 只读分享
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function rnd(n) {
  const cs = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = ""; for (let i = 0; i < n; i++) s += cs[Math.floor(Math.random() * cs.length)];
  return s;
}

async function hasAccess(openid, babyId) {
  const b = await db.collection("babies").doc(babyId).get().catch(() => null);
  if (!b || !b.data) return false;
  if (b.data.ownerId === openid) return true;
  return (b.data.members || []).some(m => m.openid === openid);
}

async function all(coll, where, order) {
  let c = db.collection(coll).where(where);
  if (order) c = c.orderBy(order[0], order[1]);
  const out = []; let off = 0;
  while (true) { const r = await c.skip(off).limit(100).get(); out.push(...r.data); if (r.data.length < 100) break; off += 100; }
  return out;
}

const LABEL = { feeding: "吃奶", solid: "辅食", diaper: "便便", sleep: "睡眠", temp: "体温", weight: "体重", jaundice: "黄疸", note: "备注" };
function ev(r) {
  let main = LABEL[r.type] || r.type;
  if (r.type === "feeding") main = (r.amountMl || "?") + "ml" + (r.vomited ? "（吐了）" : "");
  else if (r.type === "solid") main = "辅食 · " + (r.food || "");
  else if (r.type === "weight") main = "体重 " + (Math.round(r.valueKg * 100) / 100) + "kg";
  else if (r.type === "temp") main = "体温 " + r.valueC + "℃";
  else if (r.type === "jaundice") main = "黄疸 " + r.valueJ;
  return { time: r.time || "", main, date: r.date };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action, babyId, token, days } = event;

  if (action === "create") {
    if (!(await hasAccess(OPENID, babyId))) return { ok: false, msg: "无权限" };
    const t = rnd(10);
    const validDays = Math.min(Math.max(Number(days || 30), 1), 365);
    await db.collection("share_tokens").add({
      data: { babyId, token: t, scope: "readonly", days: validDays,
        createdBy: OPENID, createdAt: db.serverDate() }
    });
    return { ok: true, data: { token: t, url: "pages/share-view/share-view?token=" + t } };
  }

  if (action === "get") {
    if (!token) return { ok: false, msg: "缺少 token" };
    const rec = await db.collection("share_tokens").where({ token }).get();
    if (!rec.data.length) return { ok: false, msg: "分享链接无效或已撤销" };
    const s = rec.data[0];
    const b = await db.collection("babies").doc(s.babyId).get().catch(() => null);
    // 只读：隐藏头像 fileId，仅给昵称/月龄所需
    const baby = b && b.data ? { name: b.data.name, birthDate: b.data.birthDate } : {};
    const sums = await all("daily_summaries", { babyId: s.babyId }, ["date", "asc"]);
    const recent = sums.slice(-Number(s.days || 7));
    const lastDate = sums.length ? sums[sums.length - 1].date : null;
    let events = [];
    if (lastDate) events = (await all("records", { babyId: s.babyId, date: lastDate }))
      .map(ev).slice(0, 40);
    return {
      ok: true,
      data: { readonly: true, baby, lastDate,
        days: recent.map(r => ({ date: r.date, totalMilkMl: r.totalMilkMl, cumulativeMilkMl: r.cumulativeMilkMl })),
        events
      }
    };
  }

  if (action === "list") {
    if (!(await hasAccess(OPENID, babyId))) return { ok: false, msg: "无权限" };
    const r = await db.collection("share_tokens").where({ babyId }).orderBy("createdAt", "desc").get();
    return { ok: true, data: { list: r.data.map(d => ({ token: d.token, days: d.days, createdAt: d.createdAt })) } };
  }

  if (action === "revokeOne") {
    if (!(await hasAccess(OPENID, babyId))) return { ok: false, msg: "无权限" };
    const r = await db.collection("share_tokens").where({ babyId, token: event.token }).get();
    for (const d of r.data) await db.collection("share_tokens").doc(d._id).remove();
    return { ok: true, data: { revoked: r.data.length } };
  }

  if (action === "revoke") {
    if (!(await hasAccess(OPENID, babyId))) return { ok: false, msg: "无权限" };
    const r = await db.collection("share_tokens").where({ babyId }).get();
    await Promise.all(r.data.map(d => db.collection("share_tokens").doc(d._id).remove()));
    return { ok: true, data: { revoked: r.data.length } };
  }

  return { ok: false, msg: "未知 action" };
};
