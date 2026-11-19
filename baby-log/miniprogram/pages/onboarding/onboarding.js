const app = getApp();
const babySvc = require("../../services/baby");
const date = require("../../utils/date");
const units = require("../../utils/units");

Page({
  data: {
    cloudReady: false,
    genders: [{ label: "女", value: "female" }, { label: "男", value: "male" }, { label: "不便填写", value: "unknown" }],
    genderIndex: 0,
    minDate: "2023-01-01",
    today: "",
    weightUnit: "kg",
    form: { name: "", gender: "female", birthDate: "", birthWeight: "" }
  },

  onLoad() {
    this.setData({ cloudReady: app.globalData.cloudReady, today: date.todayStr() });
  },

  onInput(e) {
    const k = e.currentTarget.dataset.k;
    this.setData({ ["form." + k]: e.detail.value });
  },
  onGender(e) {
    const i = Number(e.detail.value);
    this.setData({ genderIndex: i, "form.gender": this.data.genders[i].value });
  },
  onBirth(e) { this.setData({ "form.birthDate": e.detail.value }); },
  toggleWeightUnit() { this.setData({ weightUnit: this.data.weightUnit === "kg" ? "斤" : "kg" }); },

  async submit() {
    const f = this.data.form;
    if (!f.name.trim()) return wx.showToast({ title: "请填写昵称", icon: "none" });
    if (!f.birthDate) return wx.showToast({ title: "请选择出生日期", icon: "none" });
    if (!this.data.cloudReady) return wx.showToast({ title: "未配置云环境", icon: "none" });

    let birthWeightKg = 0;
    if (f.birthWeight) birthWeightKg = units.normalizeWeightKg(f.birthWeight, this.data.weightUnit);

    wx.showLoading({ title: "保存中" });
    try {
      const baby = await babySvc.create({
        name: f.name.trim(), gender: f.gender, birthDate: f.birthDate, birthWeightKg
      });
      babySvc.setCurrent(app, baby);
      wx.hideLoading();
      wx.switchTab({ url: "/pages/home/home" });
    } catch (e) { wx.hideLoading(); }
  },

  goImport() { wx.navigateTo({ url: "/pages/import/import" }); },
  goShareView() { wx.navigateTo({ url: "/pages/share-view/share-view" }); }
});
