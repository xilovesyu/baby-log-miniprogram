const api = require("./api");

function add(babyId, type, data) {
  return api.call("addRecord", { op: "add", babyId: babyId, type: type, data: data || {} });
}
function update(babyId, type, id, data) {
  return api.call("addRecord", { op: "update", babyId: babyId, type: type, id: id, data: data || {} });
}
function remove(babyId, type, id) {
  return api.call("addRecord", { op: "delete", babyId: babyId, type: type, id: id });
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
