const app = getApp();
const babySvc = require("../../services/baby");
const family = require("../../services/family");
const share = require("../../services/share");

const ROLE_TEXT = { owner: "创建者", editor: "可编辑", viewer: "只读" };
const rt = r => ROLE_TEXT[r] || r;

Page({
  data: { babyId: "", members: [], invites: [], shares: [], canManage: false },

  onShow() { this.ensureBaby().then(() => this.load()); },

  async ensureBaby() {
    if (this.data.babyId) return;
    try {
      const list = await babySvc.list();
      if (list && list.length) {
        const cur = list.find(b => b._id === app.globalData.currentBabyId) || list[0];
        babySvc.setCurrent(app, cur); this.setData({ babyId: cur._id });
      }
    } catch (e) {}
  },

  async load() {
    if (!this.data.babyId) return;
    try {
      const r = await family.list(this.data.babyId);
      this.setData({
        members: (r.members || []).map(m => Object.assign({}, m, { roleText: rt(m.role) })),
        invites: (r.invites || []).map(i => Object.assign({}, i, { roleText: rt(i.role) })),
        canManage: r.canManage
      });
      try {
        const s = await share.list(this.data.babyId);
        this.setData({ shares: s.list || [] });
      } catch (e) { this.setData({ shares: [] }); }
    } catch (e) {}
  },

  genInvite() {
    wx.showActionSheet({
      itemList: ["邀请为「可编辑」", "邀请为「只读」"],
      success: async (res) => {
        const role = res.tapIndex === 0 ? "editor" : "viewer";
        const r = await family.createInvite(this.data.babyId, role, 7);
        wx.showModal({
          title: "邀请码已生成", showCancel: false, confirmText: "复制",
          content: "把这 6 位码发给家人，对方在「我有邀请码，加入他人宝宝」输入即可加入（7 天内有效）。\n\n邀请码：" + r.code,
          success: () => wx.setClipboardData({ data: r.code })
        });
        this.load();
      }
    });
  },

  manageMember(e) {
    const m = e.currentTarget.dataset.m;
    wx.showActionSheet({
      itemList: ["设为可编辑", "设为只读", "移除成员"],
      success: async (res) => {
        try {
          if (res.tapIndex === 0) await family.updateRole(this.data.babyId, m.openid, "editor");
          else if (res.tapIndex === 1) await family.updateRole(this.data.babyId, m.openid, "viewer");
          else if (res.tapIndex === 2) {
            const ok = await new Promise(r => wx.showModal({ title: "移除该成员？", success: x => r(x.confirm) }));
            if (!ok) return;
            await family.removeMember(this.data.babyId, m.openid);
          }
          wx.showToast({ title: "已更新", icon: "success" }); this.load();
        } catch (e) {}
      }
    });
  },

  revokeInvite(e) {
    const c = e.currentTarget.dataset.code;
    wx.showModal({ title: "撤销邀请码 " + c + "？", success: async (r) => {
      if (!r.confirm) return; await family.revokeInvite(this.data.babyId, c); this.load();
    }});
  },

  genShare() {
    wx.showActionSheet({
      itemList: ["有效 7 天", "有效 30 天", "有效 90 天"],
      success: async (res) => {
        const days = [7, 30, 90][res.tapIndex];
        const r = await share.create(this.data.babyId, days);
        wx.showModal({
          title: "只读口令已生成", showCancel: false, confirmText: "复制",
          content: "对方在小程序「只读查看」页输入口令即可（" + days + " 天内有效，可随时撤销）。\n\n口令：" + r.token,
          success: () => wx.setClipboardData({ data: r.token })
        });
        this.load();
      }
    });
  },

  revokeShare(e) {
    const t = e.currentTarget.dataset.token;
    wx.showModal({ title: "撤销该只读链接？", success: async (r) => {
      if (!r.confirm) return; await share.revokeOne(this.data.babyId, t); this.load();
    }});
  },

  acceptInvite() {
    wx.showModal({
      title: "加入他人宝宝", editable: true, placeholderText: "输入 6 位邀请码",
      success: async (r) => {
        if (!r.confirm || !r.content) return;
        try {
          const res = await family.accept(r.content.trim().toUpperCase(), "");
          const list = await babySvc.list();
          const baby = list.find(b => b._id === res.babyId);
          if (baby) babySvc.setCurrent(app, baby);
          wx.showToast({ title: "已加入 " + (res.name || ""), icon: "success" });
          setTimeout(() => wx.switchTab({ url: "/pages/home/home" }), 600);
        } catch (e) {}
      }
    });
  }
});
