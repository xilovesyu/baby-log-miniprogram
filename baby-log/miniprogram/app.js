const { CLOUD_ENV } = require("./cloud");

App({
  globalData: {
    cloudReady: false,
    openid: "",
    currentBabyId: "",
    currentBaby: null,
    rev: 0
  },

  markDataChanged() { this.globalData.rev = (this.globalData.rev || 0) + 1; },

  onLaunch() {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 以上基础库以使用云能力");
      return;
    }
    wx.cloud.init({ env: CLOUD_ENV || undefined, traceUser: true });
    this.globalData.cloudReady = !!CLOUD_ENV;
    if (!CLOUD_ENV) {
      console.warn("[baby-log] 未配置云开发环境 ID（miniprogram/cloud.js）。当前仅可预览界面。");
    }
    // 记住上次选择的宝宝
    this.globalData.currentBabyId = wx.getStorageSync("currentBabyId") || "";
  }
});
