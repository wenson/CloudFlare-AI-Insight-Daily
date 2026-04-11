# Source-Items RSS Design

## 背景

当前 `/rss` 路由读取的是 D1 `daily_reports` 表中的 `rss_html`，因此它依赖 `/genAIContent` 先生成日报与摘要后才能输出 RSS。

这导致两个直接问题：

1. 只要本地或线上没有执行过 `/genAIContent`，即使 `source_items` 已经有最近几天抓取到的内容，`/rss` 仍然会返回一个空 channel。
2. 当前 `/rss?days=7` 的“最近 7 天”语义并不准确。现有实现只是按 `report_date DESC LIMIT 7` 取最近 7 条日报记录，而不是按最近 7 个自然日过滤。

本次改动要把 `/rss` 的产品语义从“AI 日报摘要 feed”改为“最近 N 天抓取内容 feed”，并且不再依赖 `/genAIContent`。

## 目标

- `/rss` 直接从 D1 `source_items` 生成 RSS feed。
- 默认输出最近 7 天抓取到的内容，`days` query 参数仍然保留。
- 每条 `source_item` 生成一个 RSS `<item>`。
- 不修改 `/rss` 路径，不增加新路由。
- 不删除 `daily_reports` 表，也不影响 `/genAIContent` 现有写入逻辑。

## 非目标

- 不再为 `daily_reports` 提供 RSS 输出兼容模式。
- 不新增“按 source_type 分类”的 RSS 路由。
- 不新增全文搜索、分页或增量同步能力。
- 不重做现有页面型路由。

## 用户可见语义

### 变更前

- `/rss` 输出最近 N 条 AI 日报摘要。
- 只有执行过 `/genAIContent` 后才会出现 `<item>`。

### 变更后

- `/rss` 输出最近 N 天抓取到的原始内容流。
- 只要 `source_items` 有数据，即使没执行 `/genAIContent`，`/rss` 也能返回 `<item>`。
- 同一天会出现多条 `<item>`，因为粒度改成了单条 `source_item`。

## 数据来源

新的 `/rss` 只依赖 D1 `source_items` 表，过滤条件如下：

- `published_at IS NOT NULL`
- `published_at != ''`
- 落在最近 `days` 天对应的自然日窗口内

窗口语义与当前 `source_items` 浏览链路保持一致，按 Asia/Shanghai 的自然日理解。

## 字段映射

每条 `source_items` 记录映射成一个 RSS item：

- `<title>`：`title`
- `<link>`：`url`
- `<guid>`：优先 `guid`，否则回退到 `${source_type}:${source_item_id}`
- `<pubDate>`：`published_at`
- `<description>`：
  - 优先 `description_text`
  - 若为空，则从 `content_html` 提取纯文本并截断
- `<content:encoded>`：
  - 优先 `content_html`
  - 若为空，则退回到转义后的 `description_text`

额外约束：

- `title` 为空时回退为 `source_name || source_type || 'Untitled'`
- `link` 为空时回退为 Worker 内部详情页链接：`/getContentHtml?date=YYYY-MM-DD`
- `description` 保持纯文本，避免 RSS 阅读器因为原始 HTML 片段而展示混乱
- `content:encoded` 保持 HTML，尽量保留正文结构

## 模块职责

### `src/d1.js`

新增一个面向 RSS 的 D1 查询函数，职责是：

- 计算最近 `days` 天对应的窗口
- 查询 `source_items`
- 只返回 RSS 所需字段
- 按 `published_at DESC` 排序

该函数不负责 XML 拼接，不负责 HTML/text 回退策略。

### `src/sourceItems.js`

新增一层 row -> RSS payload 的映射逻辑，职责是：

- 统一 title/link/guid/pubDate/description/content 的回退规则
- 让 RSS handler 不直接依赖数据库字段细节

### `src/handlers/getRss.js`

保留现有路由入口，职责变成：

- 解析 `days`
- 调用 D1 查询
- 调用 row -> RSS payload 映射
- 拼接 XML

handler 不直接实现数据库窗口计算逻辑，也不直接实现字段回退细节。

## 兼容性与风险

### 兼容点

- 订阅地址不变：仍然是 `/rss`
- `days` 参数保留
- `Content-Type` 和 XML 结构保持合法 RSS 2.0

### 行为变化

- Feed 内容从“日报摘要”变为“抓取内容流”
- `<item>` 数量通常会显著增加
- 不再依赖 `daily_reports`

### 风险

1. **订阅者语义变化。**
   已有订阅者会从“日报摘要”切换到“原始抓取流”。这是有意设计变化，不做兼容双轨。

2. **空链接或空标题。**
   个别 `source_items` 可能字段缺失，因此必须在映射层提供稳定回退值。

3. **正文体积过大。**
   某些 `content_html` 可能很长。当前设计先保留全文，若后续发现阅读器兼容问题，再单独增加裁剪策略。

4. **日期窗口理解不一致。**
   必须复用现有 Asia/Shanghai 自然日语义，避免 `/rss` 与内容浏览页对“最近 N 天”的理解不一致。

## 测试策略

新增和调整测试集中在 `tests/rss-d1.test.mjs`：

- `/rss` 从 `source_items` 生成 `<item>`
- `days=7` 使用真实日期窗口，而不是 `LIMIT 7`
- `guid` 回退逻辑正确
- `description_text` / `content_html` 回退逻辑正确
- 空结果时 XML 结构仍合法

回归要求：

- 现有 `source_items`、`writeData`、`scheduled ingestion`、`content page` 测试必须继续通过
- 全量测试 `tests/*.test.mjs` 通过

## 文档更新

以下文档需要同步调整：

- `docs/DATA_FLOW.md`
- `docs/API_ROUTES.md`
- `docs/DEPLOYMENT.md`

重点改动：

- 明确 `/rss` 现在读取 `source_items`
- 删除“`/genAIContent` 成功后才有 RSS 内容”的说法
- 保留 `daily_reports` 用途说明，但不再把它写成 RSS 唯一来源

## 结论

本次改动将把 `/rss` 从“生成后发布物”切换为“抓取内容流”。它解决了“抓到内容但 RSS 为空”的直接问题，同时让 `/rss?days=7` 的语义真正符合“最近 7 天”。
