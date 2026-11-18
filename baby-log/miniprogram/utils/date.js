// 日期与时间工具（全部基于 'YYYY-MM-DD' 与 'HH:mm' 字符串，避免时区坑）
function pad(n) { return String(n).padStart(2, "0"); }

function fmtDate(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function fmtTime(d) {
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function todayStr() { return fmtDate(new Date()); }

function nowHM() { return fmtTime(new Date()); }

// 解析 'YYYY-MM-DD'（手动拆分，规避 iOS new Date 兼容问题）
function parseDate(s) {
  const p = String(s).split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

// 把 'YYYY-MM-DD' + 'HH:mm' 组合成可排序的时间戳
function toTs(dateStr, timeStr) {
  if (!dateStr) return 0;
  const d = parseDate(dateStr);
  if (timeStr) {
    const t = String(timeStr).split(":").map(Number);
    d.setHours(t[0] || 0, t[1] || 0, 0, 0);
  }
  return d.getTime();
}

function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

function monthKey(dateStr) {
  const p = String(dateStr).split("-");
  return p[0] + "-" + p[1]; // YYYY-MM
}

function ymLabel(dateStr) {
  const p = String(dateStr).split("-");
  return Number(p[1]) + "月";
}

function monthLabel(dateStr) {
  const p = String(dateStr).split("-");
  return p[0] + "年" + Number(p[1]) + "月";
}

// 该月天数
function daysInMonth(year, month1) {
  return new Date(year, month1, 0).getDate();
}

// 月龄：出生到 dateStr 的 几月几天
function ageText(birthDate, onStr) {
  if (!birthDate) return "";
  const b = parseDate(birthDate);
  const n = parseDate(onStr || todayStr());
  let months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
  if (n.getDate() < b.getDate()) months -= 1;
  months = Math.max(0, months);
  // 天：从 (出生日 + months 月) 到 n
  const anchor = new Date(b.getFullYear(), b.getMonth() + months, b.getDate());
  let days = Math.floor((n - anchor) / 86400000);
  if (days < 0) {
    // 退一个月
    const anchorPrev = new Date(b.getFullYear(), b.getMonth() + months - 1, b.getDate());
    days = Math.floor((n - anchorPrev) / 86400000);
  }
  if (months <= 0) {
    const totalDays = Math.floor((n - new Date(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
    return totalDays + "天";
  }
  return months + "个月" + (days > 0 ? days + "天" : "");
}

module.exports = {
  pad, fmtDate, fmtTime, todayStr, nowHM, parseDate, toTs,
  addDays, monthKey, ymLabel, monthLabel, daysInMonth, ageText
};
