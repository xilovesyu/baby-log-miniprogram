const shareSvc = require("../../services/share");

Page({
  data: { input: "", data: null },

  onLoad(q) {
    if (q.token) this.fetch(q.token);
  },

  onInput(e) { this.setData({ input: e.detail.value.trim() }); },
  loadByCode() { if (this.data.input) this.fetch(this.data.input); },

  async fetch(token) {
    wx.showLoading({ title: "加载中" });
    try {
      const d = await shareSvc.get(token);
      this.setData({ data: d });
    } catch (e) {}
    wx.hideLoading();
  }
});
