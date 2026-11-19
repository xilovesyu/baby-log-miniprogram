const app = getApp();
const babySvc = require("../../services/baby");
const data = require("../../services/data");
const U = require("../../utils/date");
const units = require("../../utils/units");
const rt = require("../../utils/recordTypes");

function buildRecord(r) {
  const tc = r.typeCounts || {};
  const max = Math.max(1, ...rt.STATS.map(t => tc[t.k] || 0));
  const items = rt.STATS.map(t => ({
    label: t.label, color: t.color, count: tc[t.k] || 0,
    w: Math.round((tc[t.k] || 0) / max * 100)
  }));
  return {
    total: r.totalRecords || 0,
    days: r.recordDays || 0,
    avgPerDay: r.avgRecordsPerDay || 0,
    streak: r.longestStreak || 0,
    items
  };
}

Page({
  data: {
    babyId: "", tab: "milk", range: "30",
    bars: [], avgDaily: 0, maxFeed: 0, minFeed: 0, feedTimes: 0, monthly: [],
    activeBar: "", activeBarText: "",
    seriesTitle: "", series: [], seriesMeta: "", seriesUnit: "", seriesColor: "#2BB3A3",
    seriesDigits: 1, seriesMinLabel: "", seriesMaxLabel: "", raw: {},
    record: { total: 0, days: 0, avgPerDay: 0, streak: 0, items: [] }
  },

  onShow() {
    if (!this._loaded) { this.ensureBaby().then(() => this.load(false)); return; }
    if (this.data.babyId && this.data.babyId !== app.globalData.currentBabyId) {
      this.setData({ babyId: app.globalData.currentBabyId }, () => this.load(false)); return; // 切换宝宝
    }
    if (this._rev !== app.globalData.rev) this.load(true); // 记录变化：静默刷新
  },

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

  async load(silent) {
    if (!this.data.babyId) return;
    if (!silent) wx.showLoading({ title: "统计中" });
    try {
      const r = await data.stats(this.data.babyId, this.data.range);
      this.setData({ raw: r, avgDaily: r.avgDaily, maxFeed: r.maxFeed, minFeed: r.minFeed, feedTimes: r.feedTimes, monthly: r.monthly, record: buildRecord(r) });
      this.render();
      this._loaded = true;
    } catch (e) {}
    if (!silent) wx.hideLoading();
    this._rev = app.globalData.rev;
  },

  setTab(e) { this.setData({ tab: e.currentTarget.dataset.t }, () => this.render()); },
  setRange(e) { this.setData({ range: e.currentTarget.dataset.r, activeBar: "", activeBarText: "" }, () => this.load(false)); },
  onBarTap(e) {
    const ds = e.currentTarget.dataset;
    this.setData({ activeBar: ds.date || ds.label, activeBarText: ds.label + " · " + ds.total + "ml" });
  },

  render() {
    if (this.data.tab === "record") return; // 记录 tab 直接展示 load 里算好的 record 模型
    const r = this.data.raw;
    if (this.data.tab === "milk") {
      const days = r.days || [];
      const max = Math.max(1, ...days.map(d => d.totalMilkMl));
      const bars = days.map(d => ({
        date: d.date, label: Number(d.date.slice(5, 7)) + "/" + Number(d.date.slice(8, 10)),
        total: d.totalMilkMl, h: Math.round(d.totalMilkMl / max * 150)
      }));
      this.setData({ bars });
    } else {
      const key = this.data.tab; // weight/temp/jaundice
      const field = key === "weight" ? "valueKg" : key === "temp" ? "valueC" : "valueJ";
      const META = {
        weight:   { title: "体重趋势", unit: "kg", digits: 2, color: "#7C9CE0", src: "weights",  fmt: v => (Math.round(v * 100) / 100) + "kg" },
        temp:     { title: "体温趋势", unit: "℃", digits: 1, color: "#E8A0A0", src: "temps",    fmt: v => v + "℃" },
        jaundice: { title: "黄疸趋势", unit: "",   digits: 1, color: "#F0A868", src: "jaundice", fmt: v => String(v) }
      };
      const M = META[key];
      const list = (r[M.src] || []).filter(x => x.date && x[field] != null)
        .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const vals = list.map(x => Number(x[field]));
      const series = list.map(x => ({
        x: Number(x.date.slice(5, 7)) + "/" + Number(x.date.slice(8, 10)),
        y: Number(x[field]),
        yLabel: M.fmt(Number(x[field]))
      }));
      const minV = vals.length ? Math.min.apply(null, vals) : null;
      const maxV = vals.length ? Math.max.apply(null, vals) : null;
      this.setData({
        series, seriesTitle: M.title, seriesUnit: M.unit, seriesColor: M.color,
        seriesDigits: M.digits, seriesMeta: "共 " + list.length + " 个测量点",
        seriesMinLabel: minV != null ? M.fmt(minV) : "—",
        seriesMaxLabel: maxV != null ? M.fmt(maxV) : "—"
      });
    }
  }
});
