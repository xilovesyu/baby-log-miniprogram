const app = getApp();
const api = require("../../services/api");
const importer = require("../../services/importer");

Page({
  data: {
    babyId: "", stage: "pick", preview: null, sum: {}, report: null,
    progress: {}, pct: 0, result: null, xlsxFileID: ""
  },

  onLoad(q) {
    this.setData({ babyId: q.babyId || (app.globalData.currentBaby && app.globalData.currentBaby._id) || "" });
  },

  // —— 方式一：选原始脏 xlsx（推荐，省掉电脑脚本）——
  chooseExcel() {
    wx.chooseMessageFile({
      count: 1, type: "file", extension: ["xlsx", "xls"],
      success: (res) => {
        const f = res.tempFiles[0];
        if (/\.xls$/i.test(f.path) && !/\.xlsx$/i.test(f.path)) {
          return wx.showToast({ title: "老 .xls 不支持，请在 Excel 另存为 .xlsx 再导", icon: "none" });
        }
        if (!this.data.babyId) return wx.showToast({ title: "缺少宝宝ID", icon: "none" });
        wx.showLoading({ title: "解析中…", mask: true });
        const cloudPath = `imports/${this.data.babyId}-${Date.now()}.xlsx`;
        wx.cloud.uploadFile({
          cloudPath, filePath: f.path,
          success: (up) => {
            this.setData({ xlsxFileID: up.fileID });
            api.call("importExcel", { fileID: up.fileID, babyId: this.data.babyId }).then(r => {
              wx.hideLoading();
              this.setData({ preview: r.preview, report: r.report, sum: importer.summary(r.preview), stage: "preview" });
            }).catch(() => { wx.hideLoading(); this.cleanupXlsx(); });
          },
          fail: () => { wx.hideLoading(); wx.showToast({ title: "上传失败", icon: "none" }); }
        });
      }
    });
  },

  // —— 方式二：选已生成的 import_preview.json ——
  choose() {
    wx.chooseMessageFile({
      count: 1, type: "file", extension: ["json"],
      success: (res) => {
        const f = res.tempFiles[0];
        wx.getFileSystemManager().readFile({
          filePath: f.path, encoding: "utf8",
          success: (r) => {
            try {
              const preview = JSON.parse(r.data);
              if (!preview.feeding_records) throw new Error("格式不符");
              this.setData({ preview, report: null, sum: importer.summary(preview), stage: "preview", xlsxFileID: "" });
            } catch (e) { wx.showToast({ title: "文件解析失败：" + e.message, icon: "none" }); }
          },
          fail: () => wx.showToast({ title: "读取文件失败", icon: "none" })
        });
      }
    });
  },

  reset() { this.cleanupXlsx(); this.setData({ stage: "pick", preview: null, report: null, result: null, pct: 0, xlsxFileID: "" }); },

  cleanupXlsx() {
    if (this.data.xlsxFileID) { wx.cloud.deleteFile({ fileList: [this.data.xlsxFileID] }).catch(() => {}); this.setData({ xlsxFileID: "" }); }
  },

  doImport() {
    wx.showModal({
      title: "确认导入？", content: "将按本次涉及的日期区间先清除旧的导入记录再写入（分批导入互不覆盖，重复导入不翻倍）。",
      success: async (r) => {
        if (!r.confirm || !this.data.babyId) return;
        this.setData({ stage: "progress", result: null, pct: 0 });
        try {
          const result = await importer.run(this.data.preview, this.data.babyId, (p) => {
            this.setData({ progress: p, pct: p.total ? Math.min(100, Math.round(p.done / p.total * 100)) : 5 });
          });
          this.cleanupXlsx();
          this.setData({ result });
        } catch (e) {
          wx.showToast({ title: "导入中断：" + e.message, icon: "none" });
          this.setData({ stage: "preview" });
        }
      }
    });
  },

  goHome() { wx.switchTab({ url: "/pages/home/home" }); }
});
