const api = require("./api");

function mark(r) { try { getApp().markDataChanged(); } catch (e) {} return r; }

function list() { return api.call("babyProfile", { action: "list" }); }
function create(payload) { return api.call("babyProfile", { action: "create", payload }).then(mark); }
function update(babyId, payload) { return api.call("babyProfile", { action: "update", babyId, payload }).then(mark); }
function get(babyId) { return api.call("babyProfile", { action: "get", babyId }); }
function remove(babyId) { return api.call("babyProfile", { action: "delete", babyId }).then(mark); }
function getMilkOptions(babyId) { return api.call("read", { action: "milkOptions", babyId }); }
function setMilkOptions(babyId, options) { return api.call("babyProfile", { action: "milkOptions", babyId, payload: { options } }).then(mark); }

function setCurrent(app, baby) {
  if (!baby) return;
  wx.setStorageSync("currentBabyId", baby._id);
  if (app) { app.globalData.currentBabyId = baby._id; app.globalData.currentBaby = baby; app.globalData.rev = (app.globalData.rev || 0) + 1; }
}

function getCurrent(app) {
  return (app && app.globalData.currentBaby) || null;
}

module.exports = { list, create, update, get, remove, getMilkOptions, setMilkOptions, setCurrent, getCurrent };
