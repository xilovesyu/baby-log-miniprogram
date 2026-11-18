// 云函数 read：聚合读取（home/day/calendar/milkOptions/stats）
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const DEFAULT_OPTIONS = [30, 50, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170,
  180, 190, 200, 210, 220, 230, 240, 250, 260, 270, 280, 290];

async function access(openid, babyId) {
  const b = await db.collection("babies").doc(babyId).get().catch(() => null);
  if (!b || !b.data) return null;
  const own = b.data.ownerId === openid;
  const mem = (b.data.members || []).some(m => m.openid === openid && m.role !== "removed");
  if (!own && !mem) return null;
  const role = own ? "owner" : ((b.data.members.find(m => m.openid === openid) || {}).role);
  return { baby: b.data, canEdit: role === "owner" || role === "editor" };
}

function pad(n) { return String(n).padStart(2, "0"); }
function toTs(dateStr, timeStr) {
  const p = String(dateStr || "").split("-").map(Number);
  const d = new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1));
  if (timeStr) { const t = String(timeStr).split(":").map(Number); d.setUTCHours(t[0] || 0, t[1] || 0); }
  return d.getTime();
}

const LABEL = { feeding: "吃奶", solid: "辅食", diaper: "便便", sleep: "睡眠", temp: "体温", weight: "体重", jaundice: "黄疸", note: "备注" };
function toEvent(r) {
  let main = LABEL[r.type] || r.type;
  if (r.type === "feeding") main = (r.amountMl || "?") + "ml" + (r.vomited ? "（吐了·不计总量）" : "");
  else if (r.type === "solid") main = "辅食 · " + (r.food || "");
  else if (r.type === "diaper") main = "便便 · " + [r.texture, r.color].filter(Boolean).join(" ");
  else if (r.type === "sleep") main = "睡眠 " + (r.durationMin ? Math.floor(r.durationMin / 60) + "h" + (r.durationMin % 60) + "m" : "");
  else if (r.type === "temp") main = "体温 " + r.valueC + "℃";
  else if (r.type === "weight") main = "体重 " + (Math.round(r.valueKg * 100) / 100) + "kg";
  else if (r.type === "jaundice") main = "黄疸 " + r.valueJ;
  else if (r.type === "note") main = r.text || "";
  return { id: r._id, type: r.type, time: r.time || "", noTime: !r.time && r.type !== "sleep",
    main, note: r.note || "", _ts: toTs(r.date, r.time) };
}
function sortEvents(rows) {
  rows.sort((a, b) => (a.noTime !== b.noTime ? (a.noTime ? 1 : -1) : a._ts - b._ts));
  return rows;
}
function summarizeDay(recs) {
  let total = 0, feed = 0, solid = 0, diaper = 0, sleep = 0;
  for (const r of recs) {
    if (r.type === "feeding") { if (!r.vomited) { total += Number(r.amountMl || 0); feed++; } }
    else if (r.type === "solid") solid++;
    else if (r.type === "diaper") diaper++;
    else if (r.type === "sleep") sleep += Number(r.durationMin || 0);
  }
  return { totalMilkMl: total, feedCount: feed, solidCount: solid, diaperCount: diaper,
    sleepMin: sleep, avgPerFeed: feed ? Math.round(total / feed) : 0 };
}

async function all(coll, where, order) {
  let c = db.collection(coll).where(where);
  if (order) c = c.orderBy(order[0], order[1]);
  const out = []; let off = 0;
  while (true) { const r = await c.skip(off).limit(100).get(); out.push(...r.data); if (r.data.length < 100) break; off += 100; }
  return out;
}

async function daySummaryFromDB(babyId, date) {
  const r = await db.collection("daily_summaries").where({ babyId, date }).get();
  return r.data[0] || null;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action, babyId, date, ym, range } = event;
  const ctx = await access(OPENID, babyId);
  if (!ctx) return { ok: false, msg: "无权访问该宝宝" };
  const baby = ctx.baby;

  if (action === "home" || action === "day") {
    const d = date || event.today;
    const recs = await all("records", { babyId, date: d });
    const sum = await daySummaryFromDB(babyId, d);
    // 当天无汇总（如今天还没记）则沿用最近一个有记录日的累计值
    let cumulativeMilkMl = (sum && sum.cumulativeMilkMl) || 0;
    if (!sum) {
      const last = await db.collection("daily_summaries").where({ babyId, date: _.lte(d) })
        .orderBy("date", "desc").limit(1).get().catch(() => ({ data: [] }));
      if (last.data[0]) cumulativeMilkMl = last.data[0].cumulativeMilkMl || 0;
    }
    const localSum = summarizeDay(recs);
    // 最近一次喂奶量（供“沿用上次”）
    const lastFeed = await db.collection("records").where({ babyId, type: "feeding" })
      .orderBy("createdAt", "desc").limit(1).get().catch(() => ({ data: [] }));
    return {
      ok: true,
      data: {
        canEdit: ctx.canEdit,
        baby: { _id: baby._id, name: baby.name, birthDate: baby.birthDate, tempAlertC: baby.tempAlertC, solidFoodStartDate: baby.solidFoodStartDate },
        date: d,
        summary: Object.assign(localSum, { cumulativeMilkMl }),
        events: sortEvents(recs.map(toEvent)),
        lastAmount: lastFeed.data[0] ? lastFeed.data[0].amountMl : null
      }
    };
  }

  if (action === "milkOptions") {
    const r = await db.collection("milk_options").where({ babyId }).get();
    return { ok: true, data: { options: r.data[0] ? r.data[0].options : DEFAULT_OPTIONS } };
  }

  if (action === "record") {
    const r = await db.collection("records").doc(event.id).get().catch(() => null);
    if (!r || !r.data || r.data.babyId !== babyId) return { ok: false, msg: "记录不存在" };
    return { ok: true, data: r.data };
  }

  if (action === "calendar") {
    const start = ym + "-01", end = ym + "-31";
    const sums = await all("daily_summaries", { babyId, date: _.gte(start).and(_.lte(end)) }, ["date", "asc"]);
    let monthTotal = 0, feedCount = 0;
    const days = {};
    for (const s of sums) {
      monthTotal += Number(s.totalMilkMl || 0); feedCount += Number(s.feedCount || 0);
      days[s.date] = s;
    }
    const lastCum = sums.length ? sums[sums.length - 1].cumulativeMilkMl : 0;
    return { ok: true, data: { ym, days, monthTotal, feedCount, cumulative: lastCum,
      recordDayCount: sums.filter(s => s.feedCount > 0).length } };
  }

  if (action === "stats") {
    const N = range === "all" ? 0 : Number(range || 30);
    let where = { babyId };
    if (N > 0) {
      const now = new Date(); now.setUTCDate(now.getUTCDate() - N);
      const start = now.getUTCFullYear() + "-" + pad(now.getUTCMonth() + 1) + "-" + pad(now.getUTCDate());
      where.date = _.gte(start);
    }
    const sums = (await all("daily_summaries", where, ["date", "asc"]));
    // 月度聚合
    const monthly = {};
    for (const s of sums) {
      const k = s.date.slice(0, 7);
      monthly[k] = monthly[k] || { month: k, totalMilkMl: 0, feedCount: 0 };
      monthly[k].totalMilkMl += Number(s.totalMilkMl || 0);
      monthly[k].feedCount += Number(s.feedCount || 0);
    }
    const monthlyList = Object.values(monthly).map(m => Object.assign(m, {
      avgPerFeed: m.feedCount ? Math.round(m.totalMilkMl / m.feedCount) : 0 }));
    const health = async (type) => (await all("records", { babyId, type }, ["date", "asc"]))
      .map(r => ({ date: r.date, valueKg: r.valueKg, valueC: r.valueC, valueJ: r.valueJ, unit: r.unit }));
    const weights = await health("weight");
    const temps = await health("temp");
    const jaundice = await health("jaundice");
    const valid = sums.filter(s => s.feedCount > 0);
    const avgDaily = valid.length ? Math.round(valid.reduce((a, s) => a + s.totalMilkMl, 0) / valid.length) : 0;
    let maxFeed = 0, minFeed = 0;
    const feeds = await all("records", { babyId, type: "feeding", vomited: _.neq(true) }, ["createdAt", "asc"]);
    for (const f of feeds) { const v = Number(f.amountMl || 0); if (v > maxFeed) maxFeed = v; if (!minFeed || v < minFeed) minFeed = v; }
    return { ok: true, data: {
      days: sums.map(s => ({ date: s.date, totalMilkMl: s.totalMilkMl, cumulativeMilkMl: s.cumulativeMilkMl })),
      monthly: monthlyList, avgDaily, maxFeed, minFeed, feedTimes: feeds.length,
      weights, temps, jaundice,
      recordDayCount: valid.length
    } };
  }

  return { ok: false, msg: "未知 action" };
};
