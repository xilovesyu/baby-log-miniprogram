// 云函数 initDb：幂等创建集合。索引与安全规则请在云开发控制台手动配置（见 README）。
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTIONS = ["babies", "caregivers", "records", "daily_summaries",
  "milk_options", "share_tokens", "invites"];

exports.main = async () => {
  const results = [];
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
      results.push({ name, status: "created" });
    } catch (e) {
      // -501001 / 已存在
      results.push({ name, status: "exists" });
    }
  }
  return { ok: true, data: { results,
    suggestIndexes: [
      "records: babyId+date, babyId+type+date",
      "daily_summaries: babyId+date(唯一)",
      "babies: ownerId, members.openid",
      "share_tokens: token(唯一)"
    ] } };
};
