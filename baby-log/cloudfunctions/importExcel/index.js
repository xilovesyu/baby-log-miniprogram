// 云函数 importExcel：下载云存储里的脏 xlsx → exceljs 解析 → 回预览+质量报告（不写库）
// 前端拿到 preview 后复用 importer.run 走 importJson/dailyAggregate 入库。
// 注意：需在云开发控制台把本函数「超时时间」设为 60 秒（解析 19 子表较重）。
const cloud = require("wx-server-sdk");
const https = require("https");
const ExcelJS = require("exceljs");
const path = require("path");
const { parseWorkbook } = require(path.join(__dirname, "lib", "parse"));
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function httpsGetBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function downloadBuffer(fileID) {
  // 先试 SDK 直下；失败退回 临时链接 + https
  try {
    const dl = await cloud.downloadFile({ fileID });
    if (dl && dl.fileContent && dl.fileContent.length) return dl.fileContent;
    throw new Error("downloadFile 返回空");
  } catch (e1) {
    const tmp = await cloud.getTempFileURL({ fileList: [fileID] });
    const it = tmp.fileList && tmp.fileList[0];
    if (!it || !it.tempFileURL) throw new Error("取临时链接失败: " + JSON.stringify(tmp.fileList) + " | 原因1: " + (e1.message || e1));
    return await httpsGetBuffer(it.tempFileURL);
  }
}

async function canWrite(openid, babyId) {
  const b = await db.collection("babies").doc(babyId).get().catch(() => null);
  if (!b || !b.data) return false;
  if (b.data.ownerId === openid) return true;
  const m = (b.data.members || []).find(x => x.openid === openid);
  return !!(m && (m.role === "owner" || m.role === "editor"));
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { fileID, babyId } = event;
  if (!fileID || !babyId) return { ok: false, msg: "缺少 fileID 或 babyId" };
  if (!(await canWrite(OPENID, babyId))) return { ok: false, msg: "无权限" };

  let buffer;
  try {
    buffer = await downloadBuffer(fileID);
  } catch (e) {
    return { ok: false, msg: "下载文件失败：" + (e.message || e) };
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (e) {
    return { ok: false, msg: "无法读取 xlsx（若是老 .xls 请在 Excel 另存为 .xlsx 再导）：" + (e.message || e) };
  }

  // 结构校验：至少有一张「吃奶时间」月度表
  const hasMonth = wb.worksheets.some(w => w.name.indexOf("吃奶时间") === 0);
  if (!hasMonth) return { ok: false, msg: "未识别到「吃奶时间」月度表，请确认是记录表文件" };

  const { preview, report } = parseWorkbook(wb);
  return { ok: true, data: { preview, report } };
};
