# -*- coding: utf-8 -*-
"""把 import_preview.json 还原成「19 子表」结构的 .xlsx。
布局对齐源表：每个「吃奶时间<月>」按周分块(每块≤7天)，每天两列(时间|奶量)，
块尾两行=当日总量(SUM公式)+累计量(数值)；辅食/备注写在时间列；
另含「黄疸体重」「奶量选项」。累计口径与 App 一致：吐奶不计。
"""
import json, datetime as dt
from collections import defaultdict
from pathlib import Path
from openpyxl import Workbook
from openpyxl.utils import get_column_letter

SRC = Path(r"D:\Codes\health-log\import-preview\import_preview.json")
OUT = Path(r"D:\Codes\health-log\import-preview\西柚导出.xlsx")
d = json.loads(SRC.read_text(encoding="utf-8"))

def sheet_name_for(ym):
    y, m = ym.split("-"); m = int(m)
    return f"吃奶时间{m}月" if y == "2025" else f"吃奶时间{y[2:]}年{m}月"

def to_time(hm):
    if not hm: return None
    h, mi = hm.split(":"); return dt.time(int(h), int(mi))

# 分组
feeds = defaultdict(list); solids = defaultdict(list); notes = defaultdict(list)
for f in d["feeding_records"]:
    feeds[f["date"]].append(f)
for s in d["solid_food_records"]:
    solids[s["date"]].append(s)
for n in d["notes"]:
    notes[n["date"]].append(n)

# 每日净奶量(剔吐) + 全局累计；并记录每日吐奶量用于总量公式回退
day_net = {}; day_vomit = {}
for date, lst in feeds.items():
    day_net[date] = sum(0 if x.get("vomited") else x["amountMl"] for x in lst)
    day_vomit[date] = sum(x["amountMl"] for x in lst if x.get("vomited"))
cum = 0; cum_by_date = {}
for date in sorted(day_net):
    cum += day_net[date]; cum_by_date[date] = cum

wb = Workbook(); wb.remove(wb.active)
all_dates = sorted(set(list(feeds) + list(solids) + list(notes)))
months = sorted({x[:7] for x in all_dates})

for ym in months:
    ws = wb.create_sheet(sheet_name_for(ym))
    y, m = map(int, ym.split("-"))
    import calendar as _cal
    ndays = _cal.monthrange(y, m)[1]
    days = [f"{y}-{m:02d}-{dd:02d}" for dd in range(1, ndays + 1)]
    days = [x for x in days]  # 保留空日(未记录显示空)
    row = 1
    for blk_start in range(0, ndays, 7):
        wk = days[blk_start:blk_start + 7]
        # 块头日期行
        for i, ds in enumerate(wk):
            yy, mm, dd = map(int, ds.split("-"))
            ws.cell(row=row, column=1 + i * 2).value = dt.date(yy, mm, dd)
        header_row = row
        # 每天条目：吃奶(按时间,无时间置后) -> 辅食 -> 备注
        col_entries = {}
        for i, ds in enumerate(wk):
            ent = []
            fs = sorted(feeds.get(ds, []), key=lambda x: (x["time"] is None, x["time"] or ""))
            for x in fs:
                note = x.get("note")
                if note:
                    a = ((x["time"] + " ") if x.get("time") else "") + note  # 时间列写文本(含备注/吐了)，仍可被再导入识别
                else:
                    a = to_time(x["time"])
                ent.append(("feed", a, f'{int(x["amountMl"])}ml', None))
            for s in solids.get(ds, []):
                t = to_time(s["time"]); txt = (s["time"] + " " if s["time"] else "") + "（" + (s.get("food") or s.get("raw") or "") + "）"
                ent.append(("text", txt, None, None))
            for n in notes.get(ds, []):
                ent.append(("text", n.get("raw") or n.get("text"), None, None))
            col_entries[i] = ent
        maxh = max([len(v) for v in col_entries.values()] + [0])
        first_data_row = header_row + 1
        for r_i in range(maxh):
            rr = first_data_row + r_i
            for i in range(len(wk)):
                ent = col_entries[i]
                if r_i < len(ent):
                    kind, a, b, note = ent[r_i]
                    if kind == "feed":
                        if a is not None: ws.cell(row=rr, column=1 + i * 2).value = a
                        ws.cell(row=rr, column=2 + i * 2).value = b
                    else:
                        ws.cell(row=rr, column=1 + i * 2).value = a
        # 当日总量行(SUM) + 累计量行
        total_row = first_data_row + maxh
        cum_row = total_row + 1
        for i, ds in enumerate(wk):
            col = 1 + i * 2 + 1  # ml 列(第2列起每对)
            ml_letter = get_column_letter(col)
            t_start = first_data_row; t_end = total_row - 1
            if t_end >= t_start:
                v = day_vomit.get(ds, 0)
                fml = f"=SUM({ml_letter}{t_start}:{ml_letter}{t_end})"
                if v: fml += f"-{int(v)}"  # 吐奶不计入当日总奶量(与 App 口径一致)
                ws.cell(row=total_row, column=col).value = fml
            if ds in cum_by_date:
                ws.cell(row=cum_row, column=col).value = cum_by_date[ds]
        row = cum_row + 2  # 块间空行

# 黄疸体重
w2 = wb.create_sheet("黄疸体重")
w2["A1"] = "黄疸值"; r = 2
for h in d["health_metrics"]:
    if h["type"] == "jaundice":
        y, m, dd = map(int, h["date"].split("-")); w2.cell(row=r, column=1).value = dt.date(y, m, dd); w2.cell(row=r, column=2).value = h["value"]; r += 1
r += 1; w2.cell(row=r, column=1).value = "体重"; r += 1
for h in d["health_metrics"]:
    if h["type"] == "weight":
        y, m, dd = map(int, h["date"].split("-"))
        w2.cell(row=r, column=1).value = dt.date(y, m, dd)
        w2.cell(row=r, column=2).value = round(h["valueKg"], 3)
        w2.cell(row=r, column=3).value = f"{round(h['valueKg']*2,2)}斤"; r += 1

# 奶量选项
w3 = wb.create_sheet("奶量选项"); w3["A1"] = "奶量"
for i, v in enumerate(d.get("milk_options", [])):
    w3.cell(row=2 + i, column=1).value = f"{int(v)}ml"

wb.save(OUT)
print("导出完成 ->", OUT)
print("子表数:", len(wb.sheetnames))
print("月度表:", [n for n in wb.sheetnames if n.startswith('吃奶时间')])
print("其余:", [n for n in wb.sheetnames if not n.startswith('吃奶时间')])
