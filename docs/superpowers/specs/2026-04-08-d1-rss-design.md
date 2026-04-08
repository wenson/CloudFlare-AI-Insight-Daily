# D1 RSS Recovery Design

## 结论

本次改动在不恢复 GitHub 的前提下，重新引入 RSS 输出能力。方案是在保留现有 Cloudflare KV 抓取缓存链路的基础上，新增 Cloudflare D1 作为“生成结果存储层”，由 `/genAIContent` 在生成成功后自动写入日报正文与 RSS 摘要，再由 `/rss` 直接从 D1 聚合输出。

## 目标

- 保留当前“无 GitHub 运行时依赖”的状态。
- 新增 D1 持久化层，保存生成后的日报正文和 RSS 摘要。
- 恢复 `/rss` 路由，但其数据来源改为 D1，不再依赖 GitHub 或 KV report key。
- 保持“生成即发布”的产品语义：日报生成成功后自动更新同日期 RSS 内容。

## 非目标

- 不恢复 GitHub 提交、GitHub 仓库读写或旧的 GitHub Pages 发布链路。
- 不改动 Folo 抓取逻辑和按分类写入 KV 的行为。
- 不引入新的前端发布按钮或额外的“手动发布 RSS”页面动作。
- 不将登录 session 从 KV 迁移到 D1。

## 设计方案

### 存储分层

- `KV`
  - 继续保存按日期分类的抓取结果
  - 继续保存登录 session
- `D1`
  - 保存日报生成后的最终产物
  - 保存 RSS 展示所需的摘要与 HTML

### 表结构

新增一张表：

```sql
CREATE TABLE daily_reports (
  report_date TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  daily_markdown TEXT NOT NULL,
  rss_markdown TEXT NOT NULL,
  rss_html TEXT NOT NULL,
  source_item_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT NOT NULL
);
```

字段说明：

- `report_date`
  - 使用 `YYYY-MM-DD`
  - 作为主键，确保同一天只有一条有效记录
- `title`
  - RSS item 标题
- `daily_markdown`
  - 最终 AI 日报正文
- `rss_markdown`
  - 用于 RSS 的精简版摘要
- `rss_html`
  - 由 `rss_markdown` 转换得到，供 `/rss` 直接输出
- `source_item_count`
  - 本次日报基于多少条勾选内容生成
- `created_at`
  - 首次写入时间
- `updated_at`
  - 最近一次生成覆盖时间
- `published_at`
  - RSS 使用的发布时间；首次生成时写入，后续覆盖时保持不变

### 生成与发布流程

1. 用户在 `/getContentHtml` 勾选内容并调用 `/genAIContent`
2. Worker 生成最终日报正文 `daily_markdown`
3. Worker 基于日报正文再生成一份 `rss_markdown`
4. Worker 把 `rss_markdown` 转成 `rss_html`
5. Worker 在同一请求里 upsert 到 D1
6. 页面仍然返回日报结果页

关键语义：

- 只有日报正文和 RSS 摘要都成功生成时，才写 D1
- 同一天重复生成会覆盖 `daily_markdown`、`rss_markdown`、`rss_html` 和 `updated_at`
- `created_at` 与 `published_at` 在首次插入后保留不变

### RSS 输出

恢复 `/rss` 路由，但实现改为：

- 从 D1 查询最近 `N` 天数据，默认 7 天
- 结果按 `report_date` 倒序
- `<title>` 使用 `title`
- `<guid>` 使用 `report_date`
- `<pubDate>` 使用 `published_at`
- `<content:encoded>` 使用 `rss_html`
- `<description>` 使用去标签后的前 200 字摘要

### 配置变更

需要新增 D1 绑定：

```toml
[[d1_databases]]
binding = "DB"
database_name = "ai-daily"
database_id = "replace-with-your-d1-database-id"
```

部署时新增 D1 初始化步骤：

- 创建 D1 数据库
- 执行 schema SQL
- 将 `database_id` 配入 `wrangler.toml`

## 文件影响

- 修改：`src/index.js`
- 新增：`src/d1.js`
- 新增：`src/handlers/getRss.js`
- 修改：`src/handlers/genAIContent.js`
- 修改：`wrangler.toml`
- 新增：`schema.sql`
- 修改：`docs/DEPLOYMENT.md`
- 修改：`docs/DATA_FLOW.md`
- 修改：`docs/KV_KEYS.md`
- 修改：`docs/API_ROUTES.md`
- 新增测试：覆盖 D1 持久化与 RSS 聚合

## 风险与控制

- 风险 1：日报生成成功但 RSS 摘要失败
  - 控制：只有两者都成功才写 D1
- 风险 2：同一天重复生成导致 RSS 时间混乱
  - 控制：保留首次 `published_at`，仅更新 `updated_at`
- 风险 3：D1 未绑定时 Worker 启动报错
  - 控制：把 `DB` 加入必填绑定校验
- 风险 4：RSS 输出被空内容污染
  - 控制：仅查询 `rss_html` 非空记录，并在写库前校验摘要内容

## 验收标准

- Worker 运行时不恢复任何 GitHub 依赖
- `/genAIContent` 成功后会把日报正文和 RSS 摘要写入 D1
- `/rss` 能从 D1 输出最近 N 天的 feed
- 同一 `report_date` 重复生成时只更新同一条记录
- 文档与配置改为描述 KV + D1 双存储结构
