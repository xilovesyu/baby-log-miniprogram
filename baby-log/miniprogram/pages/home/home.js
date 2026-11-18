const app = getApp();
const babySvc = require("../../services/baby");
const recordSvc = require("../../services/record");
const data = require("../../services/data");
const date = require("../../utils/date");

function fmtSleep(min) {
  if (!min) return "0h0m";
  return Math.floor(min / 60) + "h" + (min % 60) + "m";
}

Page({
  data: {
    cloudReady: false, babyId: "", baby: {}, ageText: "", date: "", dateLabel: "",
    summary: { totalMilkMl: 0, feedCount: 0, avgPerFeed: 0, solidCount: 0, diaperCount: 0, sleepMin: 0, cumulativeMilkMl: 0 },
    cumulative: 0, sleepText: "0h0m", events: [], canEdit: true
  },

  onLoad() { this.setData({ cloudReady: app.globalData.cloudReady }); },

  onShow() { this.load(); },
  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },

  async load() {
    if (!this.data.cloudReady) return;
    try {
      let babies = await babySvc.list();
      if (!babies || !babies.length) {
        wx.navigateTo({ url: "/pages/onboarding/onboarding" });
        return;
      }
      let cur = babies.find(b => b._id === app.globalData.currentBabyId) || babies[0];
      if (cur._id !== app.globalData.currentBabyId) babySvc.setCurrent(app, cur);
      this.setData({ babyId: cur._id, baby: cur, ageText: date.ageText(cur.birthDate) });

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
    } catch (e) {
      console.error(e);
    }
  },

  goMy() { wx.navigateTo({ url: "/pages/my/my" }); },

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
        this.load();
      }
    });
  }
});
