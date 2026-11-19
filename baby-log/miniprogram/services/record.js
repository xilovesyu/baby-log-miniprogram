const api = require("./api");

function mark(r) { try { getApp().markDataChanged(); } catch (e) {} return r; }

function add(babyId, type, data) {
  return api.call("addRecord", { op: "add", babyId: babyId, type: type, data: data || {} }).then(mark);
}
function update(babyId, type, id, data) {
  return api.call("addRecord", { op: "update", babyId: babyId, type: type, id: id, data: data || {} }).then(mark);
}
function remove(babyId, type, id) {
  return api.call("addRecord", { op: "delete", babyId: babyId, type: type, id: id }).then(mark);
}
function day(babyId, date) {
  return api.call("read", { action: "day", babyId: babyId, date: date });
}
function milkOptions(babyId) {
  return api.call("read", { action: "milkOptions", babyId: babyId });
}
function get(babyId, id) {
  return api.call("read", { action: "record", babyId: babyId, id: id });
}

module.exports = { add, update, remove, day, milkOptions, get };
