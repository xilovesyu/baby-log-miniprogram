const app = getApp();
const babySvc = require("../../services/baby");
const data = require("../../services/data");
const recordSvc = require("../../services/record");
const U = require("../../utils/date");

const WEEKS = ["日", "一", "二", "三", "四", "五", "六"];

Page({
  data: {
    babyId: "", ym: U.monthKey(U.todayStr()), monthLabel: U.monthLabel(U.todayStr()),
    weeks: WEEKS, cells: [], monthTotal: 0, cumulative: 0, avgDaily: 0,
    selectedDate: "", selectedSummary: {}, selectedEvents: []
  },

  onShow() { this.ensureBaby().then(() => this.load()); },

  async ensureBaby() {
    if (this.data.babyId) return;
    try {
      const list = await babySvc.list();
      if (list && list.length) {
        const cur = list.find(b => b._id === app.globalData.currentBabyId) || list[0];
        babySvc.setCurrent(app, cur);
        this.setData({ babyId: cur._id });
      }
    } catch (e) {}
  },

  async load() {
    if (!this.data.babyId) return;
    wx.showLoading({ title: "加载中" });
    try {
      const r = await data.calendarMonth(this.data.babyId, this.data.ym);
      this._days = r.days || {};
      const avgDaily = r.recordDayCount ? Math.round((r.monthTotal || 0) / r.recordDayCount) : 0;
      this.setData({
        cells: this.buildCells(this.data.ym, this._days),
        monthTotal: r.monthTotal, cumulative: r.cumulative, avgDaily,
        monthLabel: U.monthLabel(this.data.ym + "-01")
      });
    } catch (e) {}
    wx.hideLoading();
  },

  buildCells(ym, days, selected) {
    const sel = selected !== undefined ? selected : this.data.selectedDate;
    const [y, m] = ym.split("-").map(Number);
    const firstWd = new Date(y, m - 1, 1).getDay();
    const n = U.daysInMonth(y, m);
    const today = U.todayStr();
    const cells = [];
    for (let i = 0; i < firstWd; i++) cells.push({ key: "b" + i, blank: true, date: "" });
    for (let d = 1; d <= n; d++) {
      const ds = y + "-" + U.pad(m) + "-" + U.pad(d);
      const s = days[ds];
      const recorded = !!(s && (s.feedCount > 0 || s.solidCount > 0 || s.diaperCount > 0 || s.sleepMin > 0));
      cells.push({
        key: ds, day: d, date: ds, recorded,
        total: s ? s.totalMilkMl : 0,
        hasSolid: s ? s.solidCount > 0 : false,
        hasTemp: false, hasWeight: false,
        isFuture: ds > today,
        selected: ds === sel
      });
    }
    return cells;
  },

  prevMonth() {
    const [y, m] = this.data.ym.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    this.setData({ ym: d.getFullYear() + "-" + U.pad(d.getMonth() + 1), selectedDate: "" }, () => this.load());
  },
  nextMonth() {
    const [y, m] = this.data.ym.split("-").map(Number);
    const d = new Date(y, m, 1);
    this.setData({ ym: d.getFullYear() + "-" + U.pad(d.getMonth() + 1), selectedDate: "" }, () => this.load());
  },

  async openDay(e) {
    const ds = e.currentTarget.dataset.date;
    if (!ds || ds > U.todayStr()) return;
    wx.showLoading({ title: "加载" });
    try {
      const r = await data.home(this.data.babyId, ds);
      this.setData({
        selectedDate: ds, selectedSummary: r.summary, selectedEvents: r.events,
        cells: this.buildCells(this.data.ym, this._days || {}, ds)
      });
    } catch (err) {}
    wx.hideLoading();
  },
  closeDay() { this.setData({ selectedDate: "", cells: this.buildCells(this.data.ym, this._days || {}, "") }); },

  editEvent(e) {
    const it = e.currentTarget.dataset.item;
    wx.navigateTo({ url: "/pages/record/record?type=" + it.type + "&id=" + it.id + "&babyId=" + this.data.babyId });
  },
  addOnDay() {
    wx.navigateTo({ url: "/pages/record/record?type=feeding&babyId=" + this.data.babyId + "&date=" + this.data.selectedDate });
  }
});
