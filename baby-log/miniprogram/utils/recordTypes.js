// 记录类型「单一事实源」。新增/调整记录类型，优先只改这里。
// 说明：
//  - quickAdd=true 的类型会自动出现在「首页快捷记录」+「日历补录」
//  - dot=true 的类型会自动出现在「日历图例」（前提：daily_summaries 里有该类型每日计数，见 read/calendar）
//  - 表单字段逻辑（record.js buildData/validate、addRecord FIELDS）仍需按类型补，因为各类型字段差异大、WXML 无法廉价全数据驱动
const TYPES = [
  { key: "feeding",  label: "奶量", title: "记一次吃奶", icon: "🍼", color: "#2BB3A3", dot: false, quickAdd: true },
  { key: "solid",    label: "辅食", title: "记辅食",     icon: "🥣", color: "#F59E0B", dot: true,  quickAdd: true },
  { key: "diaper",   label: "便便", title: "记便便",     icon: "💩", color: "#8D6E63", dot: true,  quickAdd: true },
  { key: "sleep",    label: "睡眠", title: "记睡眠",     icon: "😴", color: "#7C9CE0", dot: false, quickAdd: true },
  { key: "temp",     label: "体温", title: "记体温",     icon: "🌡️", color: "#E8A0A0", dot: false, quickAdd: true },
  { key: "weight",   label: "体重", title: "记体重",     icon: "⚖️", color: "#6FB79A", dot: false, quickAdd: true },
  { key: "jaundice", label: "黄疸", title: "记黄疸",     icon: "🧪", color: "#D9A441", dot: false, quickAdd: true },
  { key: "note",     label: "备注", title: "备注",       icon: "📝", color: "#9AA4B2", dot: false, quickAdd: false }
];

const MAP = {};
TYPES.forEach(t => { MAP[t.key] = t; });

// 首页/日历快捷入口（带 记 前缀的 label 在模板里拼）
const QUICK = TYPES.filter(t => t.quickAdd).map(t => ({ type: t.key, icon: t.icon, label: t.label }));
// 统计「分项次数」展示顺序与配色
const STATS = TYPES.map(t => ({ k: t.key, label: t.label, color: t.color }));
// 日历图例（仅 dot 类型）
const DOTS = TYPES.filter(t => t.dot).map(t => ({ key: t.key, label: t.label }));

function title(k) { return (MAP[k] || {}).title || "记录"; }
function meta(k) { return MAP[k] || null; }

module.exports = { TYPES, QUICK, STATS, DOTS, title, meta };
