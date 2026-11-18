const api = require("./api");

async function exportXlsx(babyId) {
  const r = await api.call("exportData", { babyId });
  const t = await wx.cloud.getTempFileURL({ fileList: [r.fileID] });
  const item = t.fileList && t.fileList[0];
  if (!item || !item.tempFileURL) throw new Error("获取下载链接失败");
  const dl = await wx.downloadFile({ url: item.tempFileURL });
  if (dl.statusCode !== 200) throw new Error("下载失败");
  await new Promise((resolve, reject) =>
    wx.openDocument({ filePath: dl.tempFilePath, fileType: "xlsx", showMenu: true, success: resolve, fail: reject })
  );
  return r;
}

module.exports = { exportXlsx };
