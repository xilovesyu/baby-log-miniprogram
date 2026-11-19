const app = getApp();
const recordSvc = require("../../services/record");
const date = require("../../utils/date");
const units = require("../../utils/units");
const rt = require("../../utils/recordTypes");

const MEALS = [{ label: "早餐", value: "breakfast" }, { label: "午餐", value: "lunch" }, { label: "晚餐", value: "dinner" }, { label: "加餐", value: "snack" }];
const TEXTURES = ["糊状", "稀", "干硬", "水样", "正常"];
const COLORS = ["黄色", "绿色", "棕色", "褐色", "黑色", "灰白"];
const METHODS = ["经皮", "血清"];

function durationHM(s, e) {
  if (!s || !e) return "—";
  const [h1, m1] = s.split(":").map(Number); const [h2, m2] = e.split(":").map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1); if (mins < 0) mins += 1440;
  return Math.floor(mins / 60) + "h" + (mins % 60) + "m";
}

Page({
  data: {
    type: "feeding", babyId: "", id: "", isEdit: false, title: "记录",
    today: "", milkOptions: [], amountInput: "", lastAmount: null,
    meals: MEALS, mealIndex: 0, textures: TEXTURES, textureIndex: 4, colors: COLORS, colorIndex: 0,
    methods: METHODS, methodIndex: 0,
    unit: "kg", weightUnits: ["kg", "斤"],
    tempAlertC: 37.3, tempWarn: false, durationText: "—",
    form: { date: "", time: "", amountMl: null, vomited: false, food: "", portion: "",
      startHM: "", endHM: "", valueC: "", weightInput: "", valueJ: "", note: "" }
  },

  async onLoad(q) {
    const type = q.type || "feeding";
    const d = q.date || date.todayStr(), t = date.nowHM();
    this.setData({
      type, title: rt.title(type), babyId: q.babyId || (app.globalData.currentBaby && app.globalData.currentBaby._id),
      today: d, "form.date": d, "form.time": t,
      tempAlertC: (app.globalData.currentBaby && app.globalData.currentBaby.tempAlertC) || 37.3,
      lastAmount: app.globalData.lastFeedAmount || null
    });
    wx.setNavigationBarTitle({ title: this.data.title });
    if (type === "feeding") {
      try { const r = await recordSvc.milkOptions(this.data.babyId); this.setData({ milkOptions: r.options || [] }); } catch (e) {}
    }
    if (q.id) { this.setData({ id: q.id, isEdit: true }); this.prefill(q.id); }
  },

  async prefill(id) {
    try {
      const r = await recordSvc.get(this.data.babyId, id);
      const f = Object.assign({}, this.data.form);
      ["date", "time", "amountMl", "vomited", "food", "portion", "startHM", "endHM", "valueC", "valueJ", "note"].forEach(k => {
        if (r[k] !== undefined) f[k] = r[k];
      });
      if (r.type === "feeding") f.amountMl = r.amountMl;
      if (r.type === "sleep") f.startHM = r.time || "";
      if (r.type === "weight") { f.weightInput = String(r.valueKg); f.unit = "kg"; }
      this.setData({
        form: f, amountInput: r.amountMl != null ? String(r.amountMl) : "",
        mealIndex: Math.max(0, MEALS.findIndex(m => m.value === r.meal)),
        textureIndex: Math.max(0, TEXTURES.indexOf(r.texture)),
        colorIndex: Math.max(0, COLORS.indexOf(r.color)),
        durationText: durationHM(f.startHM, f.endHM)
      });
    } catch (e) {}
  },

  // 通用输入
  onInput(e) { this.setData({ ["form." + e.currentTarget.dataset.k]: e.detail.value }); },
  onDate(e) { this.setData({ "form.date": e.detail.value }); },
  onTime(e) { this.setData({ "form.time": e.detail.value }); },
  onMeal(e) { this.setData({ mealIndex: Number(e.detail.value) }); },
  onTexture(e) { this.setData({ textureIndex: Number(e.detail.value) }); },
  onColor(e) { this.setData({ colorIndex: Number(e.detail.value) }); },
  onMethod(e) { this.setData({ methodIndex: Number(e.detail.value) }); },

  pickAmount(e) { const v = Number(e.currentTarget.dataset.v); this.setData({ "form.amountMl": v, amountInput: String(v) }); },
  onAmountInput(e) { const v = e.detail.value; this.setData({ amountInput: v, "form.amountMl": v === "" ? null : Number(v) }); },
  reuseLast() { if (this.data.lastAmount) this.setData({ "form.amountMl": Number(this.data.lastAmount), amountInput: String(this.data.lastAmount) }); },
  toggleVomited() { this.setData({ "form.vomited": !this.data.form.vomited }); },

  onStartHM(e) { this.setData({ "form.startHM": e.detail.value, durationText: durationHM(e.detail.value, this.data.form.endHM) }); },
  onEndHM(e) { this.setData({ "form.endHM": e.detail.value, durationText: durationHM(this.data.form.startHM, e.detail.value) }); },

  onTemp(e) {
    const v = Number(e.detail.value || 0);
    this.setData({ "form.valueC": e.detail.value, tempWarn: v >= this.data.tempAlertC });
  },
  toggleUnit() { this.setData({ unit: this.data.unit === "kg" ? "斤" : "kg" }); },

  buildData() {
    const f = this.data.form, t = this.data.type;
    if (t === "feeding") return { date: f.date, time: f.time || null, amountMl: Number(f.amountMl || 0), vomited: !!f.vomited, note: f.note };
    if (t === "solid") return { date: f.date, time: f.time || null, meal: MEALS[this.data.mealIndex].value, food: f.food, portion: f.portion, note: f.note };
    if (t === "diaper") return { date: f.date, time: f.time || null, texture: TEXTURES[this.data.textureIndex], color: COLORS[this.data.colorIndex], note: f.note };
    if (t === "sleep") return { date: f.date, startHM: f.startHM, endHM: f.endHM, note: f.note };
    if (t === "temp") return { date: f.date, time: f.time || null, valueC: Number(f.valueC), note: f.note };
    if (t === "weight") { const kg = units.normalizeWeightKg(f.weightInput, this.data.unit); return { date: f.date, time: f.time || null, valueKg: kg, unit: this.data.unit, note: f.note }; }
    if (t === "jaundice") return { date: f.date, time: f.time || null, valueJ: Number(f.valueJ), method: METHODS[this.data.methodIndex], note: f.note };
    return {};
  },

  validate() {
    const t = this.data.type, f = this.data.form;
    if (t === "feeding" && !(Number(f.amountMl) > 0)) return "请填写奶量";
    if (t === "solid" && !f.food.trim()) return "请填写食物内容";
    if (t === "sleep" && (!f.startHM || !f.endHM)) return "请选择开始和结束时间";
    if (t === "temp" && !f.valueC) return "请填写温度";
    if (t === "weight" && !f.weightInput) return "请填写体重";
    if (t === "jaundice" && !f.valueJ) return "请填写黄疸值";
    return null;
  },

  async save(goOn) {
    const msg = this.validate();
    if (msg) return wx.showToast({ title: msg, icon: "none" });
    if (!this.data.babyId) return wx.showToast({ title: "缺少宝宝ID", icon: "none" });
    wx.showLoading({ title: "保存中" });
    try {
      const data = this.buildData();
      if (this.data.isEdit) await recordSvc.update(this.data.babyId, this.data.type, this.data.id, data);
      else await recordSvc.add(this.data.babyId, this.data.type, data);
      wx.hideLoading();
      wx.showToast({ title: "已保存", icon: "success" });
      if (goOn) {
        this.setData({ isEdit: false, id: "", "form.amountMl": null, amountInput: "",
          "form.food": "", "form.portion": "", "form.valueC": "", "form.weightInput": "", "form.valueJ": "", "form.note": "", "form.time": date.nowHM() });
      } else {
        setTimeout(() => wx.navigateBack(), 400);
      }
    } catch (e) { wx.hideLoading(); }
  },
  onSave() { this.save(false); },
  saveAndAgain() { this.save(true); }
});
