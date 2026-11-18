// 单位换算：体重 kg / 斤；奶量 ml。规则见 plan §5
function kgToJin(kg) { return Math.round(kg * 2 * 100) / 100; }   // 1kg = 2斤
function jinToKg(jin) { return Math.round(jin / 2 * 1000) / 1000; }

function fmtWeight(kg, unit) {
  if (kg == null || isNaN(kg)) return "—";
  if (unit === "jin") return kgToJin(kg) + "斤";
  return (Math.round(kg * 100) / 100) + "kg";
}

// 把任意体重输入统一成 kg：数值>=100 视为克
function normalizeWeightKg(value, unit) {
  let n = typeof value === "string"
    ? parseFloat(value.replace(/[^\d.]/g, ""))
    : Number(value);
  if (isNaN(n)) return null;
  if (unit === "斤" || unit === "jin") return jinToKg(n);
  if (n >= 100) return n / 1000;        // 克
  return n;                              // kg
}

module.exports = { kgToJin, jinToKg, fmtWeight, normalizeWeightKg };
