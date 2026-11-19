const app = getApp();
const babySvc = require("../../services/baby");
const recordSvc = require("../../services/record");
const data = require("../../services/data");
const date = require("../../utils/date");
const rt = require("../../utils/recordTypes");

function fmtSleep(min) {
  if (!min) return "0h0m";
  return Math.floor(min / 60) + "h" + (min % 60) + "m";
}

Page({
  data: {
    cloudReady: false, loading: true, babyId: "", baby: {}, ageText: "", date: "", dateLabel: "",
    summary: { totalMilkMl: 0, feedCount: 0, avgPerFeed: 0, solidCount: 0, diaperCount: 0, sleepMin: 0, cumulativeMilkMl: 0 },
    cumulative: 0, sleepText: "0h0m", events: [], canEdit: true, quickTypes: rt.QUICK
  },

  onLoad() {
    const ready = app.globalData.cloudReady;
    this.setData({ cloudReady: ready, loading: !!ready });
  },

  onShow() {
    if (!this._loaded) { this.load(false); return; }
    const cur = app.globalData.currentBaby;
    if (!cur || cur._id !== this.data.babyId) { this.load(false); return; } // 无宝宝 / 切换宝宝：完整重载
    if (this._rev !== app.globalData.rev) this.load(true);                 // 记录变化：静默单次刷新
  },
  onPullDownRefresh() { this.load(true).then(() => wx.stopPullDownRefresh()); },

  async load(silent) {
    if (!this.data.cloudReady) { this.setData({ loading: false }); return; }
    if (!silent) this.setData({ loading: true });
    try {
      let cur;
      if (silent && this.data.babyId) {
        cur = this.data.baby;
      } else {
        let babies = await babySvc.list();
        if (!babies || !babies.length) {
          this.setData({ loading: false });
          wx.navigateTo({ url: "/pages/onboarding/onboarding" });
          return;
        }
        cur = babies.find(b => b._id === app.globalData.currentBabyId) || babies[0];
        if (cur._id !== app.globalData.currentBabyId) babySvc.setCurrent(app, cur);
        this.setData({ babyId: cur._id, baby: cur, ageText: date.ageText(cur.birthDate) });
      }

      const today = date.todayStr();
      const res = await data.home(cur._id, today);
      this.setData({
        date: today,
        dateLabel: new Date().getMonth() + 1 + "月" + new Date().getDate() + "日 今天",
        summary: res.summary,
        cumulative: res.summary.cumulativeMilkMl || 0,
        sleepText: fmtSleep(res.summary.sleepMin),
        events: res.events,
        canEdit: res.canEdit
      });
      app.globalData.lastFeedAmount = res.lastAmount || null;
      this._loaded = true;
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) this.setData({ loading: false });
      this._rev = app.globalData.rev;
    }
  },

  goMy() { wx.switchTab({ url: "/pages/my/my" }); },

  goRecord(e) {
    if (!this.data.canEdit) return wx.showToast({ title: "只读分享，无法记录", icon: "none" });
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({ url: "/pages/record/record?type=" + type + "&babyId=" + this.data.babyId });
  },

  editEvent(e) {
    if (!this.data.canEdit) return;
    const it = e.currentTarget.dataset.item;
    wx.navigateTo({ url: "/pages/record/record?type=" + it.type + "&id=" + it.id + "&babyId=" + this.data.babyId });
  },

  delEvent(e) {
    if (!this.data.canEdit) return;
    const it = e.currentTarget.dataset.item;
    wx.showModal({
      title: "删除该记录？", content: it.main, confirmColor: "#E5645A",
      success: async (r) => {
        if (!r.confirm) return;
        await recordSvc.remove(this.data.babyId, it.type, it.id);
        wx.showToast({ title: "已删除", icon: "success" });
        this.load(true);
      }
    });
  }
});
