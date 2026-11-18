const app = getApp();
const babySvc = require("../../services/baby");

const DEFAULT_OPTIONS = [30, 50, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170,
  180, 190, 200, 210, 220, 230, 240, 250, 260, 270, 280, 290];
const uniqSorted = arr => Array.from(new Set(arr.map(Number).filter(n => n > 0 && n <= 2000))).sort((a, b) => a - b);

Page({
  data: { babyId: "", options: [], input: "", suggests: [30, 60, 90, 120, 150, 180, 210, 240] },

  onLoad(q) {
    const babyId = q.babyId || (app.globalData.currentBaby && app.globalData.currentBaby._id);
    this.setData({ babyId });
    if (babyId) this.fetch();
  },

  async fetch() {
    wx.showLoading({ title: "加载中" });
    try {
      const r = await babySvc.getMilkOptions(this.data.babyId);
      this.setData({ options: r.options || DEFAULT_OPTIONS.slice() });
    } catch (e) { this.setData({ options: DEFAULT_OPTIONS.slice() }); }
    wx.hideLoading();
  },

  onInput(e) { this.setData({ input: e.detail.value }); },

  add() {
    const v = parseInt(this.data.input, 10);
    if (!v || v <= 0 || v > 2000) return wx.showToast({ title: "请输入 1-2000", icon: "none" });
    if (this.data.options.indexOf(v) >= 0) return wx.showToast({ title: "已存在", icon: "none" });
    this.setData({ options: uniqSorted(this.data.options.concat([v])), input: "" });
  },

  quickAdd(e) {
    const v = Number(e.currentTarget.dataset.v);
    if (this.data.options.indexOf(v) >= 0) return;
    this.setData({ options: uniqSorted(this.data.options.concat([v])) });
  },

  remove(e) {
    const v = Number(e.currentTarget.dataset.v);
    this.setData({ options: this.data.options.filter(x => x !== v) });
  },

  resetDefaults() {
    wx.showModal({ title: "恢复默认 25 档？", success: r => { if (r.confirm) this.setData({ options: DEFAULT_OPTIONS.slice() }); } });
  },

  async save() {
    if (!this.data.options.length) return wx.showToast({ title: "至少保留 1 档", icon: "none" });
    wx.showLoading({ title: "保存中" });
    try {
      await babySvc.setMilkOptions(this.data.babyId, uniqSorted(this.data.options));
      wx.hideLoading(); wx.showToast({ title: "已保存", icon: "success" });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (e) { wx.hideLoading(); }
  }
});
