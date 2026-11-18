// 云开发环境配置（占位版，可安全入库）
// 真实环境 ID 放在同目录 cloud.config.js（已在 .gitignore 排除，不入库）。
// 新克隆的仓库：把 cloud.config.example.js 复制为 cloud.config.js 并填入你自己的环境 ID。
let CLOUD_ENV = "";
try {
  CLOUD_ENV = require("./cloud.config").CLOUD_ENV || "";
} catch (e) {
  CLOUD_ENV = ""; // 未配置时仅可预览 UI
}

module.exports = { CLOUD_ENV };
