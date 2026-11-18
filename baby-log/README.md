# 宝宝喂养成长记录（微信小程序 + 云开发）

P0 可运行源码：原生小程序（JavaScript，免编译）+ 微信云开发（云数据库/云函数）。
覆盖：宝宝档案、记奶量(含备注/吐奶标记)、奶量档位快选、每日总奶量/累计自动算、
日历/历史、统一记录页(吃奶/辅食/便便/睡眠/体温/体重/黄疸)、Excel 导入向导、只读分享、统计(纯 WXML 图表)。

> 说明：本源码由 AI 生成，需在「微信开发者工具」中打开、由你本人配置云环境与 AppID 后才能运行；我无法替你在 DevTools 内预览或开通云环境。

## 1. 目录结构
```
baby-log/
├─ project.config.json          # 工程配置（appid=touristappid 占位，换成你自己的）
├─ README.md
├─ miniprogram/
│  ├─ app.js / app.json / app.wxss
│  ├─ cloud.js                  # ⚠️ 填你的云开发环境 ID（CLOUD_ENV）
│  ├─ sitemap.json
│  ├─ utils/                    # date / units / aggregate
│  ├─ components/               # line-chart(零依赖 canvas 折线图)
│  ├─ services/                 # api / baby / record / data / share / family / export / importer
│  └─ pages/                    # home calendar stats my onboarding record baby-profile import family milk-options share-view
└─ cloudfunctions/              # initDb babyProfile addRecord read dailyAggregate importJson importExcel shareToken family exportData
```

## 2. 首次运行（微信开发者工具）
1. 打开「微信开发者工具」→ 导入项目 → 选 `baby-log/` 目录 → **AppID 填你自己的**（个人主体小程序 AppID）。
2. 配置云开发环境 ID：仓库里的 `miniprogram/cloud.js` 走 `require("./cloud.config")`。请把 `miniprogram/cloud.config.example.js` 复制为 `miniprogram/cloud.config.js`，在里面填**你自己的环境 ID**（`cloud.config.js` 已被 `.gitignore` 忽略，不会入库）。`app.js` 已用 `wx.cloud.init({ env: CLOUD_ENV })`。确认你的 AppID 对该环境有权限即可。
3. 逐个右键 `cloudfunctions/` 下每个函数目录 →「上传并部署：云端安装依赖」。
   建议顺序：`initDb` → `dailyAggregate` → 其它。
4. 右键 `initDb` →「云端测试」运行一次（body 留空 `{}`），创建全部集合。

## 3. 安全规则与索引（云开发控制台，一次性）
所有读写都走云函数（用管理员权限，绕过端规则），因此把以下集合的**权限设为「仅创建者可读写」或「所有用户不可读写」即可**（端上无法直接越权）：
`babies / caregivers / records / daily_summaries / milk_options / share_tokens`。

建议在控制台建索引：
- `records`: `babyId + date`，`babyId + type + date`
- `daily_summaries`: `babyId + date`（唯一）
- `babies`: `ownerId`、`members.openid`
- `share_tokens`: `token`（唯一）

## 4. 导入你的 Excel 历史数据（西柚 19 子表）
**方式 A（推荐，免电脑脚本）**：
1. 把原始脏 `西柚记录.xlsx` 发到微信（如「文件传输助手」）。
2. 小程序「我的 → 导入记录」→「选择原始 Excel (.xlsx)」→ 云函数 `importExcel` 解析出预览 + 质量报告 → 确认导入。
   入库按「本次日期区间」先清后写，分批导入互不覆盖、同区间重导幂等；完成后自动删除云存储临时 xlsx。
3. 老 `.xls` 不支持，请在 Excel 里另存为 `.xlsx` 再导。

**方式 B（离线脚本产物）**：电脑跑 `tools/parse_excel.py` 生成 `import-preview/import_preview.json` → 发到微信 → 「选择 import_preview.json」导入。

> 解析规则（时间三态/点号时间/整列写错位置/辅食备注共列/体重 g·kg·斤/吐奶不计总量/黄疸笔误/过期体温）在 `cloudfunctions/importExcel/lib/parse.js`，与 Python 版等价，可用 `node tools/verify_parse_parity.js` 对账（当前 487/487 天净奶量一致）。
> ⚠️ `importExcel` 云函数需在控制台把「超时时间」设为 **60 秒**（解析 19 子表较重）。

## 5. 关键业务规则（已落地代码）
- **当日总奶量 = Σ 吃奶 amountMl（排除 `vomited=true` 的吐奶）**；喂奶次数同样不计吐奶。
- **累计奶量** = 各「有记录日」按日期升序的当日总量之和，由 `dailyAggregate` 维护。
- **时间可空**：只写奶量没写时间的，作为 `time=null` 记录，时间轴排在当天末尾、显示「未记」；空/0 不入库。
- **辅食**：与吃奶共用录入（`solid` 类型），2026-07 起展示。
- **体重**：入库统一 kg，端上 kg/斤 切换（1kg=2斤）。
- **奶量档位**：默认 30~290 共 25 档（来自「奶量选项」表）。

## 6. 已实现 / 待办
- P0 ✅：档案、记奶量+备注+吐奶标记、奶量档位、日总量/累计、日历历史、导入、基础统计、云开发+权限。
- P1 ✅（本轮新增）：
  - **共同照护者邀请**：`我的 → 共同照护者/只读分享` 生成 6 位邀请码（可编辑/只读，7 天有效）；他人凭码「我有邀请码，加入他人宝宝」加入；创建者可改角色/移除/撤销邀请。云函数 `family`。
  - **只读分享管理**：创建者生成口令（7/30/90 天，可随时撤销/查看列表）；对方在「只读查看」页输口令浏览，无法编辑。云函数 `shareToken`（增 list/revokeOne）。
  - **数据导出（还原 19 子表 xlsx）**：端内 `我的 → 数据导出` 调云函数 `exportData`（exceljs 生成月度吃奶表+黄疸体重+奶量选项，当日总量用 `SUM-吐奶`、累计净值），上传云存储并 `openDocument` 打开。离线等价脚本 `tools/export_excel.py`（净奶量往返 487/487 验证通过）。
  - **统计趋势**：体重/体温/黄疸用自研 `components/line-chart`（canvas 2d 折线，零依赖、免「构建 npm」）展示，含网格/数据点/起末/最低最高。奶量仍是柱状。
  - **奶量档位编辑**：`我的 → 奶量档位` 增删/恢复默认/排序去重，写回 `milk_options`（云函数 `babyProfile` 的 `milkOptions` 动作）。
- P2 ✅（导入优化，见 `导入优化方案.md` 口径②）：
  - **手机直接选原始脏 xlsx 导入**：新云函数 `importExcel`（downloadFile→exceljs→`lib/parse.js` 解析→回预览+质量报告），前端 `chooseMessageFile` 加 `.xlsx` 分支；解析器与 Python 版等价（`node tools/verify_parse_parity.js` 对账 487/487）。
  - **分批导入幂等**：`importJson` 的 clear 改为按本次日期区间精确删除（`date in dates`），第二批不再静默清空第一批；`services/importer.js` 传 dates。
  - 导入完成后自动删除云存储临时 xlsx（`imports/`）；老 `.xls` 给「另存为 .xlsx」提示。
- 待办：提醒(受小程序离屏推送限制)、自然语言备注解析、云备份、医生报告导出。

> 超时：`importJson` / `dailyAggregate` / `read` / `importExcel` 都要在控制台把「超时时间」设为 **60 秒**（默认 3 秒会 `-504003` 超时）。`exportData` 写云存储需环境存储可写（同 env 云函数管理员权限上传，无需额外配置）。`family` 用集合 `invites`（已在 `initDb` 创建）。上传云函数时选「云端安装依赖」以装 `exceljs`。

## 7. 上线前你需要确认
- 个人主体**不能选医疗类目**：发布时类目选「工具 > 效率」，文案不得出现「诊断/治疗/医嘱/参考区间」。
- 配置《用户隐私保护指引》（采集：宝宝昵称/生日/头像/喂养与健康数据），上线需**小程序备案**。
- 婴儿健康数据属敏感个人信息：已提供「删除该宝宝及全部数据」(真删级联) 与「只读分享可撤销/带有效期」。

## 8. 设计资源与命名规范（追加 · AI 侧维护）

**两类资源，落点相反——按「谁来读」放：**
- **运行时资源（被 wxml/app.json 引用）→ 必须在 `miniprogram/images/` 下**：
  ```
  miniprogram/images/
  ├─ tabbar/   # tabBar 图标，8 张：home / calendar / stats / profile，各含 普通态 与 -active 态
  └─ empty/    # 空态插画：empty-records.png（首页无记录·奶瓶）、empty-stats.png（统计无数据）
  ```
- **后台头像 / 品牌存档（不打包）→ 仓库根 `D:\Codes\health-log\design\app-icon\`**（在 baby-log **之外**）：`baby-log头像-1024/512/144.png`，仅在 mp 后台「头像」处上传，小程序运行时不读，**切勿放进 miniprogram/（白吃主包 2MB）**。
- **用户上传 / 动态图（宝宝头像、分享卡片）→ 云存储**，走 `avatarFileId`，不进包。

**tabBar 图标规范**：命名 `<tab>.png` + `<tab>-active.png`；162×162 透明 PNG；灰 `#999999` / 选中 `#2BB3A3`（对应 app.json 的 `color`/`selectedColor`）。`app.json` 里写 **`iconPath: "images/tabbar/home.png"`（相对 miniprogramRoot，不带前导 `/`）**；官方限制：单张 ≤40KB、PNG、不支持网络地址。

**空态插画**：透明底 320×320 PNG；只画图形，**文案写进 wxml**（便于改多语言）。首页已接入：`home.wxml` 用全局 `.empty`（居中）+ 新增 `.empty-img{display:block;width:220rpx;height:220rpx;margin:0 auto 16rpx}`。

**视觉常量（取自 app.wxss CSS 变量，画任何图都对齐）**：主色 `--primary #2BB3A3`、文字 `--text #1F2733` / `--text-sub #8A94A6`、页面底 `--bg #F5F6F8`、卡片 `#FFFFFF`。风格=圆角线性（round cap/join），与 tabbar 图标同家族。

**隐私/版本控制**：若日后 `git init`，务必把 `data/西柚记录.xlsx`、`import-preview/*.json`（真实婴儿健康数据）及 `generated-image-*.png`（中间产物）写进 `.gitignore`，不要提交。
