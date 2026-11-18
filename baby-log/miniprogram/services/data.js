const api = require("./api");

function home(babyId, dateStr) {
  return api.call("read", { action: "home", babyId: babyId, date: dateStr });
}
function calendarMonth(babyId, ym) {
  return api.call("read", { action: "calendar", babyId: babyId, ym: ym });
}
function stats(babyId, range) {
  return api.call("read", { action: "stats", babyId: babyId, range: range || "30" });
}

module.exports = { home, calendarMonth, stats };
