const api = require("./api");

function createInvite(babyId, role, days) { return api.call("family", { action: "createInvite", babyId, role, days }); }
function list(babyId) { return api.call("family", { action: "list", babyId }); }
function accept(code, nickname) { return api.call("family", { action: "accept", code, nickname }); }
function updateRole(babyId, memberOpenid, role) { return api.call("family", { action: "updateRole", babyId, memberOpenid, role }); }
function removeMember(babyId, memberOpenid) { return api.call("family", { action: "remove", babyId, memberOpenid }); }
function revokeInvite(babyId, code) { return api.call("family", { action: "revokeInvite", babyId, code }); }

module.exports = { createInvite, list, accept, updateRole, removeMember, revokeInvite };
