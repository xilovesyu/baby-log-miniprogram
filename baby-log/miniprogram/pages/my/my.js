const app = getApp();
const babySvc = require("../../services/baby");
const shareSvc = require("../../services/share");
const exporter = require("../../services/export");
const api = require("../../services/api");
const date = require("../../utils/date");

Page({
  data: { cloudReady: false, babies: [], current: {}, currentInitial: "宝", ageText: "", avatarUrl: "" },

  onShow() { this.setData({ cloudReady: app.globalData.cloudReady }); this.load(); },

  async load() {
    if (!this.data.cloudReady) return;
    try {
      const list = await babySvc.list();
      if (!list.length) { wx.navigateTo({ url: "/pages/onboarding/onboarding" }); return; }
      const cur = list.find(b => b._id === app.globalData.currentBabyId) || list[0];
      babySvc.setCurrent(app, cur);
      this.setData({
        babies: list, current: cur,
        currentInitial: (cur.name || "宝").slice(0, 1),
        ageText: date.ageText(cur.birthDate)
      });
      this.setData({ avatarUrl: "" });
      if (cur.avatarFileId) {
        wx.cloud.getTempFileURL({ fileList: [cur.avatarFileId] }).then(r => {
          const it = r.fileList && r.fileList[0];
          if (it && it.tempFileURL) this.setData({ avatarUrl: it.tempFileURL });
        }).catch(() => {});
      }
    } catch (e) {}
  },

  switchBaby(e) {
    const id = e.currentTarget.dataset.id;
    const b = this.data.babies.find(x => x._id === id);
    if (b) { babySvc.setCurrent(app, b); this.setData({ current: b, currentInitial: (b.name || "宝").slice(0, 1), ageText: date.ageText(b.birthDate) }); }
  },

  editProfile() { wx.navigateTo({ url: "/pages/baby-profile/baby-profile?id=" + this.data.current._id }); },
  goFamily() { wx.navigateTo({ url: "/pages/family/family" }); },
  goShareView() { wx.navigateTo({ url: "/pages/share-view/share-view" }); },
  goMilkOptions() { wx.navigateTo({ url: "/pages/milk-options/milk-options?babyId=" + this.data.current._id }); },
  createNew() { wx.navigateTo({ url: "/pages/onboarding/onboarding" }); },
  doImport() { wx.navigateTo({ url: "/pages/import/import?babyId=" + this.data.current._id }); },
  async exportData() {
    if (!this.data.babyId && !this.data.current._id) return wx.showToast({ title: "先选择宝宝", icon: "none" });
    wx.showLoading({ title: "生成 xlsx…", mask: true });
    try {
      const r = await exporter.exportXlsx(this.data.current._id);
      wx.hideLoading();
      wx.showToast({ title: `已导出 ${r.months} 个月`, icon: "success" });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: "导出失败：" + (e.message || e), icon: "none" });
    }
  },

  async createShare() {
    try {
      const r = await shareSvc.create(this.data.current._id, 30);
      const url = "小程序「宝宝喂养成长记」只读查看 · 链接页：" + r.url + "\n口令：" + r.token;
      wx.showModal({
        title: "只读分享已生成", content: "有效期 30 天。对方在本小程序「只读查看」页输入口令 " + r.token + " 即可查看（无法编辑）。\n\n" + url,
        showCancel: false, confirmText: "复制口令",
        success: () => wx.setClipboardData({ data: r.token })
      });
    } catch (e) {}
  },

  delBaby() {
    wx.showModal({
      title: "确认删除？", content: "将删除该宝宝的全部记录，不可恢复。", confirmColor: "#E5645A",
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: "删除中" });
        try {
          await babySvc.remove(this.data.current._id);
          wx.setStorageSync("currentBabyId", ""); app.globalData.currentBabyId = ""; app.globalData.currentBaby = null;
          wx.hideLoading();
          wx.reLaunch({ url: "/pages/onboarding/onboarding" });
        } catch (e) { wx.hideLoading(); }
      }
    });
  }
});
