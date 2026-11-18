# -*- coding: utf-8 -*-
"""把『有奶量无时间』的吃奶导成 Excel 可筛 CSV，并标出 105/9 两类 + 合并是否合理。"""
import json, csv
from pathlib import Path

base = Path(r"D:\Codes\health-log\import-preview")
prev = json.loads((base/"import_preview.json").read_text(encoding="utf-8"))

byday = {}
for f in prev["feeding_records"]:
    byday.setdefault(f["date"], []).append(f)
for lst in byday.values():
    lst.sort(key=lambda x: (x.get("_row", 0), x.get("_col", 0)))

rows = []
for d in sorted(byday):
    lst = byday[d]
    for i, f in enumerate(lst):
        if f.get("time") is not None:
            continue
        prev_r = lst[i-1] if i > 0 else None
        if prev_r is None:
            cat = "9-当日首条无上一条"
            merged = None
        else:
            cat = "105-可并入上一条"
            merged = prev_r["amountMl"] + f["amountMl"]
        # 当日完整序列(可读)
        seq = " ; ".join(
            (g["time"] or "【无时间】") + "=" + str(int(g["amountMl"]))
            for g in lst)
        rows.append({
            "日期": d,
            "本次无时间奶量ml": int(f["amountMl"]),
            "上一条时间": prev_r["time"] if prev_r else "(无上一条)",
            "上一条奶量ml": int(prev_r["amountMl"]) if prev_r else "",
            "上一条也无时间?": "是" if (prev_r and prev_r.get("time") is None) else "否",
            "类别": cat,
            "若并入上一条后单次ml": merged if merged is None else int(merged),
            "合并后是否>300ml(可疑)": "可疑" if (merged and merged > 300) else "",
            "当日完整吃奶序列": seq,
        })

out = base/"无时间奶量_待你核对_v3.csv"
with out.open("w", encoding="utf-8-sig", newline="") as fp:   # utf-8-sig -> Excel 不乱码
    w = csv.DictWriter(fp, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(rows)

# 控制台摘要
n105 = sum(1 for r in rows if r["类别"].startswith("105"))
n9   = sum(1 for r in rows if r["类别"].startswith("9-"))
nsus = sum(1 for r in rows if r["合并后是否>300ml(可疑)"] == "可疑")
print(f"导出 {len(rows)} 行 -> {out}")
print(f"可并入上一条 {n105} 条 / 当日首条无上一条 {n9} 条 / 其中并入后>300ml可疑 {nsus} 条")

# 挑最可疑(并后最大)前12条打印，供即时查看
susp = [r for r in rows if r["合并后是否>300ml(可疑)"]]
susp.sort(key=lambda r: -(r["若并入上一条后单次ml"] or 0))
print("\n最可疑(若盲目并入会产生超大单次)前12：")
for r in susp[:12]:
    print(f"  {r['日期']} 本次{r['本次无时间奶量ml']} 并入上一条{r['上一条时间']}={r['上一条奶量ml']} -> {r['若并入上一条后单次ml']}ml | 全天: {r['当日完整吃奶序列']}")
