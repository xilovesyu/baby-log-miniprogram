const api = require("./api");

function create(babyId, days) { return api.call("shareToken", { action: "create", babyId, days: days || 30 }); }
function get(token) { return api.call("shareToken", { action: "get", token }); }
function list(babyId) { return api.call("shareToken", { action: "list", babyId }); }
function revokeOne(babyId, token) { return api.call("shareToken", { action: "revokeOne", babyId, token }); }
function revoke(babyId) { return api.call("shareToken", { action: "revoke", babyId }); }

module.exports = { create, get, list, revokeOne, revoke };
