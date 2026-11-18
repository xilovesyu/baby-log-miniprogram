# -*- coding: utf-8 -*-
"""西柚记录.xlsx -> 标准化导入预览(import_preview.json) + 数据质量报告。
本轮为「开发前准备」的实测原型：证明 19 子表可解析，并暴露需要人工确认的边界。
解析口径待真实业务确认后再固化进小程序云函数。"""
import json, re, datetime as dt
from pathlib import Path
from python_calamine import CalamineWorkbook

SRC = Path(r"D:\Codes\health-log\data\西柚记录.xlsx")
OUT = Path(r"D:\Codes\health-log\import-preview")
OUT.mkdir(parents=True, exist_ok=True)

wb = CalamineWorkbook.from_path(str(SRC))
NAMES = wb.sheet_names
MONTH_SHEETS = [n for n in NAMES if n.startswith("吃奶时间")]

# ---------- 通用小工具 ----------
def is_date(v):   return isinstance(v, dt.date) and not isinstance(v, dt.datetime)
def is_time(v):   return isinstance(v, dt.time)
def is_num(v):    return isinstance(v, (int, float)) and not isinstance(v, bool)

ML_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*ml\s*$", re.I)
def parse_ml(v):
    if isinstance(v, str):
        m = ML_RE.match(v)
        if m: return float(m.group(1))
    return None

# 从任意文本里抽 HH:MM（半角: / 全角： / 点号 都吃，如 2.07=02:07、1.04=01:04、16：20）
TIME_IN_TEXT = re.compile(r"(\d{1,2})\s*[:：.]\s*(\d{2})")
def time_from_text(s):
    m = TIME_IN_TEXT.search(s)
    if not m: return None
    h, mi = int(m.group(1)), int(m.group(2))
    if 0 <= h < 24 and 0 <= mi < 60: return f"{h:02d}:{mi:02d}"
    return None

FOOD_PAREN = re.compile(r"[（(].+?[)）]")          # 含括号食物内容
NOTE_KW = re.compile(r"(没拉|拉屎|拉了|💩|尿|睡|泡奶|起来|没吃|吃完|剩|吐|奶量|测|黄疸|体重|体温)")

def classify_left_text(s, right_ml):
    """左列是文本时，判定 feeding(带备注) / solidfood / note"""
    has_food = bool(FOOD_PAREN.search(s))
    t = time_from_text(s)
    if right_ml is not None:
        # 右侧有 ml -> 这是一次吃奶，文本是时间/备注
        return ("feeding", t, right_ml, s if NOTE_KW.search(s) or not t else None)
    if has_food:
        return ("solidfood", t, None, s)
    if NOTE_KW.search(s):
        return ("note", t, None, s)
    return ("uncertain", t, None, s)

# ---------- 解析 17 张月度表 ----------
feedings, solidfoods, notes, uncertain = [], [], [], []
formula_rows_skipped = 0

def looks_like_formula_row(row):
    # 奇数列(ml列)出现「数值」且左偶数列为空 -> 当日总/累计公式行
    hits = 0; total = 0
    for c in range(1, len(row), 2):
        v = row[c] if c < len(row) else None
        lv = row[c-1] if c-1 < len(row) else None
        if is_num(v):
            total += 1
            if (lv in ("", None)): hits += 1
    return total >= 2 and hits >= 2

for name in MONTH_SHEETS:
    rows = wb.get_sheet_by_name(name).to_python(skip_empty_area=False)
    # 找到「日期表头行」：>=2 个偶数列是 date
    header_rows = []
    for ri, r in enumerate(rows):
        dcols = [ci for ci, v in enumerate(r) if is_date(v)]
        if len(dcols) >= 2:
            header_rows.append((ri, dcols))
    header_rows.append((len(rows), []))  # 哨兵收尾
    for bi in range(len(header_rows) - 1):
        hri, dcols = header_rows[bi]
        next_hri = header_rows[bi + 1][0]
        # 建立 列->日期 映射（col, col+1 一组）
        col_date = {}
        for c in dcols:
            col_date[c] = rows[hri][c]
        for ri in range(hri + 1, next_hri):
            r = rows[ri]
            if looks_like_formula_row(r):
                formula_rows_skipped += 1
                continue
            # 列->当日：ml 驱动。只要右列是 'NNml' 就是一次吃奶(时间可空)。
            for c in sorted(col_date):
                date = col_date[c]
                v_time = r[c] if c < len(r) else ""
                v_ml = r[c+1] if c + 1 < len(r) else ""
                dstr = date.isoformat()
                ml = parse_ml(v_ml)
                # 1) 右列是奶量 -> 吃奶记录（时间来自左列，可为空）
                if ml is not None:
                    t = None; note = None
                    if is_time(v_time):
                        t = v_time.strftime("%H:%M")
                    elif isinstance(v_time, str) and v_time.strip():
                        t = time_from_text(v_time)
                        # 始终保留原始文本为备注(吐了/拉屎/换奶粉/2.07起来泡奶 等不丢失)
                        note = v_time.strip()
                    # 业务规则：左列文本含「吐」-> 吐奶，不计入当日总奶量(记录保留并打标记)
                    vomited = isinstance(v_time, str) and ("吐" in v_time)
                    feedings.append({"baby":"西柚","date":dstr,"time":t,
                                     "amountMl":ml,"_row":ri,"_col":c,
                                     **({"vomited":True} if vomited else {}),
                                     **({"note":note} if note else {})})
                # 2) 无奶量、左列是 datetime.time -> 有时间没量，交人工
                elif is_time(v_time):
                    uncertain.append({"sheet":name,"date":dstr,"row":ri,"col":c,
                                      "raw":v_time.strftime("%H:%M"),"why":"有时间无奶量"})
                # 3) 无奶量、左列是文本 -> 误置奶量 / 辅食 / 备注
                elif isinstance(v_time, str) and v_time.strip():
                    # 3a) 左列本身就是纯 'NNml'(整列写错位置) -> 当作吃奶记录(时间未知)
                    stray_ml = parse_ml(v_time)
                    if stray_ml is not None:
                        feedings.append({"baby":"西柚","date":dstr,"time":None,
                                         "amountMl":stray_ml,"_row":ri,"_col":c})
                        continue
                    kind, t, _, txt = classify_left_text(v_time, None)
                    rec = {"baby":"西柚","date":dstr,"time":t,"row":ri,"col":c,
                           "sheet":name,"raw":v_time}
                    if kind == "solidfood":
                        m = FOOD_PAREN.search(v_time)
                        rec["food"] = m.group(0).strip("（）()") if m else v_time
                        rec["note"] = v_time.strip()
                        solidfoods.append(rec)
                    else:
                        # 备注/其它文本一律保留为 note
                        rec["note"] = v_time.strip()
                        notes.append(rec)

# ---------- 解析 黄疸体重 ----------
jaundice, weights, temps = [], [], []
temps_dropped, jaundice_dropped = [], []
jr = wb.get_sheet_by_name("黄疸体重").to_python(skip_empty_area=False)
section = None
for ri, r in enumerate(jr):
    c0 = r[0] if len(r) > 0 else ""
    c1 = r[1] if len(r) > 1 else ""
    c2 = r[2] if len(r) > 2 else ""
    if isinstance(c0, str) and c0.strip() == "黄疸值": section = "jaundice"; continue
    if isinstance(c0, str) and c0.strip() == "体重":   section = "weight";   continue
    if is_date(c0) and is_num(c1) and section == "jaundice":
        # 决策#2：1.16 为录入笔误(其余为 8~11 mg/dL)，<3 视为笔误剔除
        if c1 < 3:
            jaundice_dropped.append({"date":c0.isoformat(),"value":c1,"reason":"笔误，按你2026-11-18决策剔除"})
        else:
            jaundice.append({"date":c0.isoformat(),"value":c1})
    elif is_date(c0) and section == "weight":
        kg = None; unit = "kg"; raw = c1
        if is_num(c1):
            if c1 >= 100: kg = c1/1000.0; unit="g"      # 3060 -> 3.06kg
            else: kg = c1
        elif isinstance(c1,str):
            m = re.search(r"(\d+(?:\.\d+)?)\s*kg", c1, re.I)
            if m: kg = float(m.group(1))
        jin = None
        if isinstance(c2,str):
            m = re.search(r"(\d+(?:\.\d+)?)\s*斤", c2)
            if m: jin = float(m.group(1))
        if kg is None and jin is not None: kg = jin/2.0
        weights.append({"date":c0.isoformat(),"kg":kg,"jin":jin,
                        "raw":str(raw) if raw not in ("",None) else None,
                        "derived": kg is None})  # 只有斤、kg是换算来的
    elif is_time(c0) and is_num(c1) and section == "weight" and 30 < c1 < 45:
        # 决策#1：体温段无日期，属过期数据 -> 不入库，单独留档备查
        temps_dropped.append({"time":c0.strftime("%H:%M"),"c":c1,"reason":"过期数据/无日期，按你2026-11-18决策丢弃"})

# ---------- 解析 奶量选项 ----------
mr = wb.get_sheet_by_name("奶量选项").to_python(skip_empty_area=False)
milk_options = [parse_ml(r[0]) for r in mr if isinstance(r[0],str) and parse_ml(r[0]) is not None]

# ---------- 决策#3 分析：「有奶量无时间」是否并入上一条 ----------
# 按 (date,_row,_col) 排序还原当日录入顺序，对每条无时间的吃奶，找它上一条
byday = {}
for f in feedings:
    byday.setdefault(f["date"], []).append(f)
merge_analysis = []
no_time_count = 0
mergeable_count = 0
for d, lst in byday.items():
    lst.sort(key=lambda x: (x.get("_row", 0), x.get("_col", 0)))
    for i, f in enumerate(lst):
        if f.get("time") is None:
            no_time_count += 1
            prev = lst[i-1] if i > 0 else None
            item = {"date": d, "no_time_ml": f["amountMl"],
                    "prev_time": prev.get("time") if prev else None,
                    "prev_ml": prev["amountMl"] if prev else None,
                    "prev_also_no_time": (prev is not None and prev.get("time") is None)}
            if prev is not None:
                item["merged_into_prev_ml"] = prev["amountMl"] + f["amountMl"]
                mergeable_count += 1
            else:
                item["merged_into_prev_ml"] = None
                item["note"] = "当日首条即无时间，无法并入上一条"
            merge_analysis.append(item)

# ---------- 每日聚合：total=计入总奶量(已剔除吐奶)；raw_total=含吐奶(对齐Excel公式行用) ----------
agg = {}
vomit_recs = []
for f in feedings:
    d = f["date"]; a = agg.setdefault(d, {"total":0.0,"raw_total":0.0,"n":0,"vomit_ml":0.0,"vomit_n":0})
    a["raw_total"] += f["amountMl"]; a["n"] += 1
    if f.get("vomited"):
        a["vomit_ml"] += f["amountMl"]; a["vomit_n"] += 1
        vomit_recs.append({"date":d,"time":f.get("time"),"amountMl":f["amountMl"],"note":f.get("note")})
    else:
        a["total"] += f["amountMl"]
vomit_days = sum(1 for a in agg.values() if a["vomit_n"])

# ---------- 汇总 ----------
preview = {
    "feeding_records": feedings,
    "solid_food_records": solidfoods,
    "notes": notes,
    "health_metrics": [
        *({"type":"jaundice",**x} for x in jaundice),
        *({"type":"weight","valueKg":x["kg"],"jin":x["jin"],"date":x["date"]} for x in weights),
        # 体温(无日期)按决策#1不入库，见 report.dropped
    ],
    "milk_options": milk_options,
    "uncertain_rows": uncertain,
    "dropped": {"temps_expired": temps_dropped, "jaundice_typos": jaundice_dropped},
    "merge_analysis_no_time_feedings": merge_analysis,
    "vomited_excluded_from_total": vomit_recs,
}
(OUT/"import_preview.json").write_text(
    json.dumps(preview, ensure_ascii=False, indent=2), encoding="utf-8")
# merge_analysis 单独出一份，方便你只看这一张表讨论决策#3
(OUT/"merge_analysis.json").write_text(
    json.dumps({"无时间吃奶条数":no_time_count,"可并入上一条条数":mergeable_count,
                "说明":"每条=一次『有奶量但时间列留空』的吃奶；merged_into_prev_ml=若并入同日前一条后的单次总量",
                "明细":merge_analysis}, ensure_ascii=False, indent=2), encoding="utf-8")

report = {
    "源文件": str(SRC),
    "月度表数": len(MONTH_SHEETS),
    "吃奶记录": len(feedings),
    "辅食记录": len(solidfoods),
    "备注": len(notes),
    "黄疸点": len(jaundice),
    "体重点": len(weights),
    "体重仅由斤换算(kg缺失)": sum(1 for w in weights if w["derived"]),
    "体温点": len(temps),
    "奶量档位": len(milk_options),
    "跳过公式行": formula_rows_skipped,
    "待人工确认行": len(uncertain),
    "无时间吃奶条数(决策#3待议)": no_time_count,
    "其中可并入上一条": mergeable_count,
    "吐奶条数(已剔除总奶量)": len(vomit_recs),
    "吐奶影响天数": vomit_days,
    "吐奶奶量合计ml": int(sum(v["amountMl"] for v in vomit_recs)),
    "体温_过期丢弃(决策#1)": len(temps_dropped),
    "黄疸_笔误丢弃(决策#2)": len(jaundice_dropped),
    "有记录天数": len(agg),
    "日期跨度": [min(agg), max(agg)] if agg else None,
    "日总奶量样例(前6天,总=剔吐后)": {k:{kk:a[kk] for kk in ("total","vomit_ml")}
                            for k,a in sorted(agg.items())[:6]},
    "黄疸入库": jaundice,
    "黄疸丢弃": jaundice_dropped,
    "体温丢弃": temps_dropped,
}
(OUT/"data_quality_report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
