const api = require("./api");

async function exportXlsx(babyId) {
  const r = await api.call("exportData", { babyId });
  // 用云 SDK 直接按 fileID 下载，绕开 wx.downloadFile 的「合法域名」白名单与临时链接鉴权问题
  const dl = await wx.cloud.downloadFile({ fileID: r.fileID });
  await new Promise((resolve, reject) =>
    wx.openDocument({ filePath: dl.tempFilePath, fileType: "xlsx", showMenu: true, success: resolve, fail: reject })
  );
  // 用完即删云存储临时 xlsx（含真实健康数据，不留存）
  wx.cloud.deleteFile({ fileList: [r.fileID] }).catch(() => {});
  return r;
}

module.exports = { exportXlsx };
