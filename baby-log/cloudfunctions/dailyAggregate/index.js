// 云函数 dailyAggregate：重算某宝宝指定日期的每日汇总 + 全量累计奶量
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function summarizeDay(records) {
  let totalMilkMl = 0, feedCount = 0, solidCount = 0, diaperCount = 0, sleepMin = 0;
  for (const r of records) {
    if (r.type === "feeding") {
      if (!r.vomited) { totalMilkMl += Number(r.amountMl || 0); feedCount += 1; }
    } else if (r.type === "solid") solidCount += 1;
    else if (r.type === "diaper") diaperCount += 1;
    else if (r.type === "sleep") sleepMin += Number(r.durationMin || 0);
  }
  return {
    totalMilkMl, feedCount, solidCount, diaperCount, sleepMin,
    avgPerFeed: feedCount ? Math.round(totalMilkMl / feedCount) : 0
  };
}

async function allDocs(coll, where, orderField) {
  const c = db.collection(coll).where(where);
  if (orderField) c.orderBy(orderField, "asc");
  const out = []; let off = 0;
  while (true) {
    const r = await c.skip(off).limit(100).get();
    out.push(...r.data); if (r.data.length < 100) break; off += 100;
  }
  return out;
}

exports.main = async (event) => {
  const { babyId, dates } = event;
  if (!babyId) return { ok: false, msg: "缺少 babyId" };

  const uniqDates = Array.from(new Set(dates || [])).filter(Boolean);
  const sumColl = db.collection("daily_summaries");

  async function recomputeDay(d) {
    const recs = await allDocs("records", { babyId, date: d });
    const s = summarizeDay(recs);
    const exist = await sumColl.where({ babyId, date: d }).get();
    if (exist.data.length) {
      await sumColl.doc(exist.data[0]._id).update({ data: { ...s, updatedAt: db.serverDate() } });
    } else {
      await sumColl.add({ data: { babyId, date: d, ...s, cumulativeMilkMl: 0, updatedAt: db.serverDate() } });
    }
  }

  async function rebuildCumulative() {
    const all = await allDocs("daily_summaries", { babyId }, "date");
    let cum = 0; const tasks = [];
    for (const row of all) {
      cum += Number(row.totalMilkMl || 0);
      if (row.cumulativeMilkMl !== cum) tasks.push(() => sumColl.doc(row._id).update({ data: { cumulativeMilkMl: cum } }));
    }
    for (let i = 0; i < tasks.length; i += 50) {
      await Promise.all(tasks.slice(i, i + 50).map(fn => fn()));
    }
    return { cumulative: cum, updated: tasks.length };
  }

  // 仅重算累计（导入末尾调用一次）
  if (event.rebuildCumulative) {
    const r = await rebuildCumulative();
    return { ok: true, data: { rebuild: true, ...r } };
  }

  // 1) 指定日期：并发分批重算每日汇总
  for (let i = 0; i < uniqDates.length; i += 10) {
    await Promise.all(uniqDates.slice(i, i + 10).map(recomputeDay));
  }

  // 2) 累计：导入分块时跳过（skipCumulative），单条增删改时照常全量重算
  if (event.skipCumulative) {
    return { ok: true, data: { dates: uniqDates.length, skippedCumulative: true } };
  }
  const rc = await rebuildCumulative();
  return { ok: true, data: { dates: uniqDates.length, ...rc } };
};
