// 记录聚合（纯函数，客户端与云函数 dailyAggregate 共用同一口径）
const date = require("./date");

function isVomited(r) { return !!r.vomited; }

// 一次记录集合 -> 当天汇总。吐奶不计入总奶量/次数。
function summarizeDay(records) {
  let totalMilkMl = 0, feedCount = 0, solidCount = 0, diaperCount = 0, sleepMin = 0;
  for (const r of records) {
    switch (r.type) {
      case "feeding":
        if (!isVomited(r)) { totalMilkMl += Number(r.amountMl || 0); feedCount += 1; }
        break;
      case "solid": solidCount += 1; break;
      case "diaper": diaperCount += 1; break;
      case "sleep": sleepMin += Number(r.durationMin || 0); break;
    }
  }
  return {
    totalMilkMl, feedCount, solidCount, diaperCount, sleepMin,
    avgPerFeed: feedCount ? Math.round(totalMilkMl / feedCount) : 0
  };
}

// 时间线：记录 -> 事件列表，按时间升序；time 为空的排在当天末尾
function buildEvents(records) {
  const LABEL = {
    feeding: "吃奶", solid: "辅食", diaper: "便便",
    sleep: "睡眠", temp: "体温", weight: "体重", jaundice: "黄疸", note: "备注"
  };
  const rows = records.map(function (r) {
    let main = LABEL[r.type] || r.type;
    if (r.type === "feeding") main = (r.amountMl || "?") + "ml" + (isVomited(r) ? "（吐了·不计总量）" : "");
    else if (r.type === "solid") main = "辅食 · " + (r.food || "");
    else if (r.type === "diaper") main = "便便 · " + [r.texture, r.color].filter(Boolean).join(" ");
    else if (r.type === "sleep") main = "睡眠 " + (r.durationMin ? Math.floor(r.durationMin / 60) + "h" + (r.durationMin % 60) + "m" : "");
    else if (r.type === "temp") main = "体温 " + r.valueC + "℃";
    else if (r.type === "weight") main = "体重 " + r.valueKg + "kg";
    else if (r.type === "jaundice") main = "黄疸 " + r.valueJ;
    else if (r.type === "note") main = r.text || "";
    return {
      id: r._id,
      type: r.type,
      time: r.time || "",
      noTime: !r.time && r.type !== "sleep",
      main: main,
      note: r.note || "",
      _ts: date.toTs(r.date, r.time)
    };
  });
  rows.sort(function (a, b) {
    if (a.noTime !== b.noTime) return a.noTime ? 1 : -1; // 无时间的排后面
    return a._ts - b._ts;
  });
  return rows;
}

// 由「有记录的日期」升序数组计算累计奶量。
// days: [{date, totalMilkMl}] 升序
function withCumulative(days) {
  let cum = 0;
  return days.map(function (d) {
    cum += Number(d.totalMilkMl || 0);
    return Object.assign({}, d, { cumulativeMilkMl: cum });
  });
}

module.exports = { summarizeDay, buildEvents, withCumulative, isVomited };
