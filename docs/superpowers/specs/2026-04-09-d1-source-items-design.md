# D1 Source Items Design

## 结论

本次改动把“抓取到的原始新闻、论文、社媒内容”从 Cloudflare KV 迁移到 Cloudflare D1，并停止内容数据的 KV 读写，改为 D1-only。原始内容统一存入一张明细表 `source_items`，生成后的日报正文与 RSS 摘要继续存入现有的 `daily_reports` 表。登录 session 仍保留在 KV，不属于本次迁移范围。

本设计明确采用 `latest-view` 语义，不提供历史快照：

- `/rss` 始终反映当前最新内容
- `/getContentHtml?date=YYYY-MM-DD` 按该日期对应的发布时间窗口，从当前 `source_items` 最新内容重建页面
- `/genAIContent` 在重生成旧日期日报时，也使用当前 `source_items` 里的最新内容
- 后续补抓、回填、标题改动、正文改动，都允许影响历史 `date=` 页面和旧日报重生成结果

## 目标

- 停止使用 KV 存储内容数据，原始抓取结果全面迁移到 D1。
- 使用单表明细模型保存所有原始内容，支持去重、历史回看、精确查询与后续分页。
- 保持 `/getContentHtml`、`/getContent`、`/genAIContent` 的产品语义不变，只替换其底层存储来源。
- 保持 `daily_reports` 作为生成结果存储层，不与原始抓取内容混表。

## 非目标

- 不迁移登录 session 存储。
- 不在本次设计中把分类分页升级为服务端分页；页面分页先保持前端分类内分页思路。
- 不改动 AI 生成 prompt 的业务语义。
- 不把不同来源拆成多张明细表。
- 不提供“按抓取当天冻结”的历史内容快照或版本化回放能力。

## 设计方案

### 存储分层

- `D1.source_items`
  - 保存原始抓取后的统一内容明细
  - 覆盖 `news`、`paper`、`socialMedia`
- `D1.daily_reports`
  - 继续保存 AI 生成后的日报正文与 RSS 摘要
- `KV`
  - 仅保留登录 session 等非内容数据

### 数据模型

新增一张原始内容表：

```sql
CREATE TABLE IF NOT EXISTS source_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  guid TEXT,
  author_name TEXT,
  author_url TEXT,
  author_avatar TEXT,
  description_text TEXT,
  content_html TEXT,
  published_at TEXT NOT NULL,
  inserted_at TEXT,
  language TEXT,
  summary TEXT,
  categories_json TEXT,
  media_json TEXT,
  attachments_json TEXT,
  extra_json TEXT,
  raw_json TEXT NOT NULL,
  first_seen_date TEXT NOT NULL,
  last_seen_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_type, source_item_id)
);

CREATE INDEX IF NOT EXISTS idx_source_items_published_type
ON source_items (published_at, source_type);

CREATE INDEX IF NOT EXISTS idx_source_items_last_seen
ON source_items (last_seen_date);
```

字段说明：

- `source_type`
  - 统一分类标识，取值为 `news`、`paper`、`socialMedia`
- `source_name`
  - 用于展示的来源名，例如 `量子位` 或 `某来源 - 某作者`
- `source_item_id`
  - 上游返回的稳定条目 id
- `guid`
  - 保留上游 guid，不强制等同于 url
- `author_name` / `author_url` / `author_avatar`
  - 保留上游作者相关字段，兼容单作者场景
- `description_text`
  - 保留抓取源的原始描述或摘要文本
- `content_html`
  - 保留统一对象中的正文 HTML 或描述 HTML
- `published_at`
  - 内容发布时间，作为页面查询窗口的主时间字段
- `inserted_at`
  - 平台收录时间；和发布时间分开保存
- `categories_json` / `media_json` / `attachments_json` / `extra_json`
  - 保留结构化扩展信息，当前先以 JSON 字符串落库
- `raw_json`
  - 原始统一对象的完整备份，供未来扩展与排障
- `first_seen_date` / `last_seen_date`
  - 用于追踪内容首次/最近一次被系统抓到的日期

### 去重与更新规则

- 唯一键使用 `source_type + source_item_id`
- 首次抓到内容时：
  - 插入整条记录
  - `first_seen_date` 与 `last_seen_date` 都写当天抓取日期
- 后续再次抓到同一条内容时：
  - 更新正文、摘要、作者、媒体、分类、`published_at`、`inserted_at`、`raw_json`
  - 保留原始 `first_seen_date`
  - 把 `last_seen_date` 更新为当天抓取日期
  - 更新 `updated_at`

### 读取语义

`/getContentHtml?date=YYYY-MM-DD` 与 `/getContent?date=YYYY-MM-DD` 继续按“内容发布时间窗口”取数据，而不是按抓取时间取数据。

查询窗口定义：

- 上界：请求日期当天 `23:59:59.999`，按 Asia/Shanghai 理解
- 下界：`date - (FOLO_FILTER_DAYS - 1)` 当天 `00:00:00.000`，按 Asia/Shanghai 理解

这保持了当前页面“时间窗口 N 天”的语义不变。

补充说明：

- 该窗口查询基于 `source_items` 当前最新内容重算，不保证历史日期页面是不可变快照。
- 如果一条旧内容在后续被重新抓取并覆盖字段，历史 `date=` 页面和旧日报重生成都会看到最新版本。

### 链路改造

#### `/writeData`

- 保留现有抓取与统一化逻辑
- 移除按 `YYYY-MM-DD-category` 写 KV 的行为
- 改为将统一后的每条 item upsert 到 `source_items`
- 成功响应中的 item count 继续按分类统计，避免前端调用方行为变化

#### `/getContentHtml`

- 不再从 KV 读取整包数组
- 直接从 `source_items` 查询当前时间窗口内的数据
- 按 `source_type` 组装成：
  - `allData.news`
  - `allData.paper`
  - `allData.socialMedia`
- 输出给 UI 的对象结构尽量保持当前统一格式，避免页面模板和卡片 renderer 大改

#### `/getContent`

- 与 `/getContentHtml` 一样改为从 `source_items` 读取
- 继续返回按分类分组的 JSON 结果

#### `/genAIContent`

- 不再预先从 KV 读取当天全量内容
- 根据前端提交的 `selectedItems = type:id`，直接按 `source_type + source_item_id` 精确查询 `source_items`
- 查询出的结果映射回当前 AI 生成链路使用的统一对象格式
- 后续 AI prompt 生成逻辑保持不变

#### `/rss`

- 不依赖 `source_items`
- 继续只从 `daily_reports` 读取生成后的 RSS 内容

### UI 与分页

- 当前 `/getContentHtml` 页面分页采用“每个分类各自分页”的前端方案
- 本次存储迁移不强制引入服务端分页
- D1 查询层先返回当前时间窗口内的分类全量结果，再由前端按分类页码切换显示
- 如果后续窗口数据量继续增长，可在此基础上再升级为 D1 分页查询

## 文件影响

- 修改：`schema.sql`
- 修改：`src/d1.js`
- 修改：`src/handlers/writeData.js`
- 修改：`src/handlers/getContent.js`
- 修改：`src/handlers/getContentHtml.js`
- 修改：`src/handlers/genAIContent.js`
- 可能修改：`src/dataFetchers.js`
- 修改：`docs/DATA_FLOW.md`
- 修改：`docs/KV_KEYS.md`
- 修改：`docs/API_ROUTES.md`
- 修改：`docs/DEPLOYMENT.md`
- 新增测试：覆盖 D1 原始内容写入、窗口查询、选中项读取

## 风险与控制

- 风险 1：D1-only 切换后查询映射结构和原 UI 不一致
  - 控制：D1 读出后先映射回现有统一对象结构，再进入 UI 与 AI 链路
- 风险 2：同一内容多次抓取导致覆盖错误
  - 控制：使用 `UNIQUE(source_type, source_item_id)`，并显式维护 `first_seen_date` 与 `last_seen_date`
- 风险 3：内容时间窗口和当前 `FOLO_FILTER_DAYS` 语义不一致
  - 控制：统一按 `published_at` 与 Asia/Shanghai 时间窗口查询
- 风险 4：迁移后仍有隐藏的 KV 内容读写依赖
  - 控制：对 `/writeData`、`/getContent`、`/getContentHtml`、`/genAIContent` 做全文搜索和定向测试
- 风险 5：D1 表膨胀导致查询变慢
  - 控制：为 `(published_at, source_type)` 和 `last_seen_date` 建索引
- 风险 6：历史 `date=` 页面和旧日报重生成结果会随内容更新而漂移
  - 控制：这是明确接受的产品语义；若未来需要不可变历史视图，再单独设计快照层

## 验收标准

- 原始抓取内容不再写入内容类 KV key
- `/writeData` 成功后原始内容可在 `source_items` 中查询到
- `/getContentHtml` 和 `/getContent` 能从 D1 读出当前时间窗口内的分类数据
- `/genAIContent` 能不依赖 KV，直接根据勾选项从 D1 取回源数据并生成日报
- `daily_reports` 保持原职责不变，RSS 继续从该表读取
- 文档更新为“内容数据 D1-only，session 仍使用 KV”的架构说明
