const app = getApp();
const babySvc = require("../../services/baby");
const date = require("../../utils/date");
const units = require("../../utils/units");

const GENDERS = [{ label: "女", value: "female" }, { label: "男", value: "male" }, { label: "不便填写", value: "unknown" }];

Page({
  data: {
    id: "", genders: GENDERS, genderIndex: 0, today: date.todayStr(), weightUnit: "斤",
    avatarUrl: "", avatarFileId: "",
    form: { name: "", gender: "female", birthDate: "", birthWeight: "", tempAlertC: 37.3, solidFoodStartDate: "2026-07-01" }
  },

  onLoad(q) { this.setData({ id: q.id }); this.fetch(q.id); },

  resolveAvatar(fileId) {
    if (!fileId) return;
    wx.cloud.getTempFileURL({ fileList: [fileId] }).then(r => {
      const it = r.fileList && r.fileList[0];
      if (it && it.tempFileURL) this.setData({ avatarUrl: it.tempFileURL });
    }).catch(() => {});
  },

  chooseAvatar() {
    if (!this.data.id) return;
    wx.chooseMedia({
      count: 1, mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["compressed"],
      success: (res) => {
        const fp = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: "上传中" });
        wx.cloud.uploadFile({
          cloudPath: `avatars/${this.data.id}-${Date.now()}.jpg`, filePath: fp,
          success: (up) => {
            babySvc.update(this.data.id, { avatarFileId: up.fileID }).then(() => {
              this.setData({ avatarFileId: up.fileID }); this.resolveAvatar(up.fileID);
              wx.hideLoading(); wx.showToast({ title: "头像已更新", icon: "success" });
            }).catch(() => wx.hideLoading());
          },
          fail: () => { wx.hideLoading(); wx.showToast({ title: "上传失败", icon: "none" }); }
        });
      }
    });
  },

  async fetch(id) {
    try {
      const b = await babySvc.get(id);
      const gi = Math.max(0, GENDERS.findIndex(g => g.value === b.gender));
      this.setData({
        genderIndex: gi,
        avatarFileId: b.avatarFileId || "",
        form: {
          name: b.name || "", gender: b.gender || "female",
          birthDate: b.birthDate || "", birthWeight: b.birthWeightKg ? String(units.kgToJin(b.birthWeightKg)) : "",
          tempAlertC: b.tempAlertC || 37.3, solidFoodStartDate: b.solidFoodStartDate || "2026-07-01"
        }
      });
      this.resolveAvatar(b.avatarFileId);
    } catch (e) {}
  },

  onInput(e) { this.setData({ ["form." + e.currentTarget.dataset.k]: e.detail.value }); },
  onGender(e) { const i = Number(e.detail.value); this.setData({ genderIndex: i, "form.gender": GENDERS[i].value }); },
  onBirth(e) { this.setData({ "form.birthDate": e.detail.value }); },
  onSolidStart(e) { this.setData({ "form.solidFoodStartDate": e.detail.value }); },
  toggleWeightUnit() {
    const to = this.data.weightUnit === "kg" ? "斤" : "kg";
    let v = this.data.form.birthWeight;
    if (v) { const kg = units.normalizeWeightKg(v, this.data.weightUnit); v = to === "斤" ? units.kgToJin(kg) : (Math.round(kg * 100) / 100); }
    this.setData({ weightUnit: to, "form.birthWeight": v ? String(v) : "" });
  },

  async save() {
    const f = this.data.form;
    let birthWeightKg = 0;
    if (f.birthWeight) birthWeightKg = units.normalizeWeightKg(f.birthWeight, this.data.weightUnit);
    wx.showLoading({ title: "保存中" });
    try {
      await babySvc.update(this.data.id, {
        name: f.name.trim(), gender: f.gender, birthDate: f.birthDate,
        birthWeightKg, tempAlertC: Number(f.tempAlertC) || 37.3, solidFoodStartDate: f.solidFoodStartDate,
        avatarFileId: this.data.avatarFileId
      });
      wx.hideLoading(); wx.showToast({ title: "已保存", icon: "success" });
      if (app.globalData.currentBaby && app.globalData.currentBaby._id === this.data.id) {
        Object.assign(app.globalData.currentBaby, { name: f.name, birthDate: f.birthDate, tempAlertC: Number(f.tempAlertC) });
      }
      setTimeout(() => wx.navigateBack(), 400);
    } catch (e) { wx.hideLoading(); }
  }
});
