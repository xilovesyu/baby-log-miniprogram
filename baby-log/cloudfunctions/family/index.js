// 云函数 family：共同照护者邀请与权限管理
// 成员存于 babies.members 数组：[{openid, role:'owner'|'editor'|'viewer', nickname, addedAt}]
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function code(n) {
  const cs = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i = 0; i < n; i++) s += cs[Math.floor(Math.random() * cs.length)];
  return s;
}

async function getBaby(babyId) {
  const r = await db.collection("babies").doc(babyId).get().catch(() => null);
  return r && r.data;
}
const isOwner = (openid, baby) => baby && baby.ownerId === openid;
const inFamily = (openid, baby) =>
  isOwner(openid, baby) || (baby.members || []).some(m => m.openid === openid);

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action, babyId } = event;
  const baby = await getBaby(babyId);
  if (!baby) return { ok: false, msg: "宝宝不存在" };

  // 生成邀请码（仅 owner / editor）
  if (action === "createInvite") {
    if (!inFamily(OPENID, baby)) return { ok: false, msg: "无权限" };
    const role = ["editor", "viewer"].includes(event.role) ? event.role : "editor";
    const days = Math.min(Math.max(Number(event.days || 7), 1), 90);
    const c = code(6);
    await db.collection("invites").add({
      data: { babyId, code: c, role, createdBy: OPENID, used: 0,
        createdAt: db.serverDate(), expireAt: Date.now() + days * 86400000, days }
    });
    return { ok: true, data: { code: c, role, days } };
  }

  // 成员列表 + 有效邀请（可读：任何家人）
  if (action === "list") {
    if (!inFamily(OPENID, baby)) return { ok: false, msg: "无权限" };
    const members = (baby.members || []).map(m => ({
      openid: m.openid, role: m.openid === baby.ownerId ? "owner" : m.role,
      nickname: m.nickname || (m.openid === baby.ownerId ? "我(创建者)" : "家人"),
      isSelf: m.openid === OPENID
    }));
    let invites = [];
    if (isOwner(OPENID, baby)) {
      const r = await db.collection("invites")
        .where({ babyId, expireAt: _.gt(Date.now()) }).orderBy("createdAt", "desc").get();
      invites = (r.data || []).map(i => ({ code: i.code, role: i.role, days: i.days, expireAt: i.expireAt, used: i.used }));
    }
    return { ok: true, data: { members, canManage: isOwner(OPENID, baby), invites } };
  }

  // 接受邀请（任何人凭码加入）
  if (action === "accept") {
    const c = String(event.code || "").trim().toUpperCase();
    if (!c) return { ok: false, msg: "请输入邀请码" };
    const r = await db.collection("invites").where({ code: c }).get();
    const inv = r.data[0];
    if (!inv) return { ok: false, msg: "邀请码不存在" };
    if (inv.expireAt && inv.expireAt < Date.now()) return { ok: false, msg: "邀请码已过期" };
    const b = await getBaby(inv.babyId);
    if (!b) return { ok: false, msg: "宝宝不存在" };
    const members = b.members || [];
    if (!members.some(m => m.openid === OPENID)) {
      members.push({ openid: OPENID, role: inv.role, nickname: event.nickname || "家人", addedAt: Date.now() });
      await db.collection("babies").doc(inv.babyId).update({ data: { members } });
    }
    await db.collection("invites").doc(inv._id).update({ data: { used: (inv.used || 0) + 1 } });
    return { ok: true, data: { babyId: inv.babyId, name: b.name, role: inv.role } };
  }

  // 改角色 / 移除（仅 owner，整数组重写）
  if (action === "updateRole" || action === "remove") {
    if (!isOwner(OPENID, baby)) return { ok: false, msg: "仅创建者可管理成员" };
    const target = event.memberOpenid;
    if (!target || target === baby.ownerId) return { ok: false, msg: "不能修改创建者" };
    let members = (baby.members || []).slice();
    if (action === "updateRole") {
      if (!["editor", "viewer"].includes(event.role)) return { ok: false, msg: "角色非法" };
      const m = members.find(x => x.openid === target);
      if (!m) return { ok: false, msg: "成员不存在" };
      m.role = event.role;
    } else {
      const before = members.length;
      members = members.filter(x => x.openid !== target);
      if (members.length === before) return { ok: false, msg: "成员不存在" };
    }
    await db.collection("babies").doc(babyId).update({ data: { members, updatedAt: db.serverDate() } });
    return { ok: true, data: { members } };
  }

  // 撤销邀请（owner）
  if (action === "revokeInvite") {
    if (!isOwner(OPENID, baby)) return { ok: false, msg: "仅创建者可撤销" };
    const c = String(event.code || "").toUpperCase();
    await db.collection("invites").where({ babyId, code: c }).remove();
    return { ok: true, data: {} };
  }

  return { ok: false, msg: "未知 action" };
};
