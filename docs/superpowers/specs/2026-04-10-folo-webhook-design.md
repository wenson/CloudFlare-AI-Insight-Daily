# Folo Webhook 定向抓取设计

本文定义“接收 Folo webhook 并按命中的 feed 定向抓取 `source_items`”的最终设计，目标读者是维护当前 Cloudflare Worker 的开发者。默认读者已经了解现有 `/writeData`、`scheduled()`、D1 `source_items`、Folo entries API 与登录态工作台；本文不覆盖自动生成日报、自动发布 RSS、任务队列或全量抓取重构。

## 一句话结论

本次设计新增一个公开的 Folo webhook 接收路由 `/webhooks/folo`。该路由不走登录态，而是通过 `query token` 做校验；收到事件后按 `entry.feedId -> feed.id -> feed.url -> feed.siteUrl` 的优先级匹配项目里已配置的数据源，命中后只触发该来源所属分类的一次抓取，并在 Worker 内进一步过滤出目标 feed 的条目，再 upsert 到 D1 `source_items`。若未命中任何已配置来源，则返回 `202` 并记录结构化日志。

## 目标与边界

### 目标

- 让 Folo 在有新 RSS 条目时，可以主动通知 Worker。
- 让 Worker 只更新 webhook 对应的来源，而不是重新抓取全部来源。
- 复用现有 Folo 抓取、标准化与 D1 upsert 逻辑，尽量减少改动面。
- 让未匹配来源、无新条目和临时抓取失败在返回码与日志上可区分、可排查。

### 不在范围内

- 不自动触发 `/genAIContent`、`/genAIPodcastScript` 或 `/genAIDailyAnalysis`。
- 不新增消息队列、延迟重试器或幂等事件表。
- 不把 webhook 事件原文持久化到 D1 或 KV。
- 不在第一版中重构所有数据源为“直接按单个 feedId 请求 Folo”。

## 设计决策

### 决策 1：webhook 路由公开，但必须通过 query token 校验

新增公开 POST 路由 `/webhooks/folo`，例如：

```text
/webhooks/folo?token=<FOLO_WEBHOOK_TOKEN>
```

原因：

- Folo 需要一个无需登录态的可公开访问 URL。
- 本项目当前登录态基于浏览器 session，不适合机器调用。
- `query token` 配置简单，和你在 Folo 后台填写 webhook URL 的方式天然兼容。

### 决策 2：未匹配来源时返回 `202 Accepted`

当 webhook 事件里的 feed 没有命中项目里任何已配置来源时，接口返回 `202`，不返回 `404` 或 `400`。

原因：

- 事件“送达成功”和“当前项目未订阅该来源”是两件不同的事。
- `202` 更适合表达“请求已接收，但没有需要执行的工作”。
- 可以减少 Folo 端因为业务未命中而产生的误报或反复重试。

### 决策 3：第一版采用“分类抓取 + feed 级过滤”，不直接重构所有数据源

webhook 命中某个来源后，只触发其所属分类的一次抓取，例如 `news` 或 `socialMedia`，再在标准化结果里筛出属于目标 feed 的条目进行入库。

原因：

- 当前抓取层主要按分类工作，直接复用能把实现风险压到最低。
- 只改 Worker 聚合层和少量数据源元信息，就能满足“定向抓取对应来源”的产品目标。
- 后续如果分类流量过大，再把命中的数据源下沉为 `targetFeedId` 直拉即可，不会推翻当前接口设计。

### 决策 4：feed 匹配优先使用稳定 ID，再回退到 URL

匹配优先级固定为：

1. `entry.feedId`
2. `feed.id`
3. `feed.url`
4. `feed.siteUrl`

原因：

- `feedId` 最稳定，最适合作为主键。
- URL 适合作为兼容字段，帮助处理部分 webhook 负载缺少 ID 的情况。
- 固定优先级可以让日志和测试具备确定性。

## 总体方案

### 1. 新增公开 webhook 入口

在 [src/index.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/index.js) 中新增：

- POST `/webhooks/folo`

该路由具备以下行为：

- 只接受 `POST`
- 先读取 `token` query 参数
- 与环境变量 `FOLO_WEBHOOK_TOKEN` 比较
- token 不匹配时返回 `401`
- JSON 解析失败时返回 `400`
- 认证成功后进入 webhook 处理逻辑

该路由不经过 `isAuthenticated(...)` 登录态校验。

### 2. 新增 feed 注册表与匹配逻辑

项目当前已通过多个 `*_FEED_ID` 环境变量声明 Folo 来源，例如：

- `AIBASE_FEED_ID`
- `XIAOHU_FEED_ID`
- `QBIT_FEED_ID`
- `XINZHIYUAN_FEED_ID`
- `JIQIZHIXIN_FEED_ID`

第一版新增一层共享注册表，例如 `src/foloFeedRegistry.js`，输出以下信息：

- `sourceKey`
- `sourceType`
- `feedId`
- 可选的 `feedUrl`
- 可选的 `siteUrl`

这层注册表有两个用途：

- 用于把 webhook payload 里的 feed 标识映射到本地来源
- 用于在抓取结果中判定某条标准化 item 是否属于目标 feed

注册表优先由已存在的环境变量推导，避免再引入一套新的手工维护配置。

### 3. 新增 webhook 处理服务

新增服务文件，例如 `src/services/foloWebhookIngestion.js`，负责：

- 解析 webhook payload
- 提取候选标识
- 查询本地 feed 注册表
- 找到命中的 `sourceType` 与 `sourceKey`
- 调用分类级抓取
- 在抓取结果中过滤命中 feed 的条目
- 将过滤后的条目转换为 `buildSourceItemRecord(...)`
- upsert 到 D1 `source_items`
- 返回统一结构化结果

该服务不负责登录态和 HTTP 细节，只处理 webhook 事件到 `source_items` 的单次推进。

### 4. 分类抓取后做 feed 级过滤

命中来源后，不调用全量 `fetchAllData(...)`，而是只执行一次 `fetchDataByCategory(env, sourceType, foloCookie)`。

随后按以下方式过滤：

- 从标准化 item 的 `source_meta` 中读取原始 feed 信息
- 或在数据源 transform 阶段补充 `source_meta.feed_id`、`source_meta.feed_url`、`source_meta.site_url`
- 只有匹配目标 feed 的条目才允许写入 D1

这样做的结果是：

- webhook 命中的 `news` 来源只会抓 `news`
- webhook 命中的 `paper` 来源只会抓 `paper`
- 不会因为一个 feed 的新条目而触发整个项目三大分类的全量刷新

### 5. 无匹配和空结果都接受事件，但语义不同

第一版区分三类“没有新增入库”的情况：

- webhook 未命中任何本地来源：返回 `202`
- 命中来源，但本次分类抓取里没有筛出目标 feed 条目：返回 `202`
- 命中来源，但目标 feed 条目都已存在、upsert 后无变化：仍返回 `200`

这里的核心原则是：

- “未命中”表示事件已接收，但项目无需处理
- “筛不出条目”表示事件已接收，但当前抓取窗口中没有可入库数据
- “upsert 命中旧数据”表示处理成功，只是没有新增效果

## 请求与响应设计

### 请求

Folo webhook 以 `POST application/json` 调用：

```text
POST /webhooks/folo?token=<FOLO_WEBHOOK_TOKEN>
Content-Type: application/json
```

Worker 只依赖 payload 中的以下字段：

- `entry.feedId`
- `feed.id`
- `feed.url`
- `feed.siteUrl`

如果多个字段同时存在，按既定优先级使用。

### 成功命中并完成处理

返回 `200 OK`，示例：

```json
{
  "success": true,
  "accepted": true,
  "matched": true,
  "category": "news",
  "sourceKey": "aibase",
  "upsertedCount": 3,
  "message": "Webhook source items fetched and stored."
}
```

### 未命中本地来源

返回 `202 Accepted`，示例：

```json
{
  "success": true,
  "accepted": true,
  "matched": false,
  "message": "Webhook accepted but no configured feed matched this event."
}
```

### 命中来源但未筛出条目

返回 `202 Accepted`，示例：

```json
{
  "success": true,
  "accepted": true,
  "matched": true,
  "category": "news",
  "sourceKey": "aibase",
  "upsertedCount": 0,
  "message": "Webhook accepted but no source items matched the target feed."
}
```

### token 错误

返回 `401 Unauthorized`。

### 上游抓取失败

返回 `502 Bad Gateway`，并把分类级错误聚合进返回体和日志。

## 代码改动面

### 路由层

- [src/index.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/index.js)
  - 新增 `/webhooks/folo` 路由
  - 将该路由放在登录态校验之前
  - 新增 `FOLO_WEBHOOK_TOKEN` 必需环境变量

### 新增服务与注册表

- `src/services/foloWebhookIngestion.js`
  - 负责 webhook 到定向抓取结果的核心流程

- `src/foloFeedRegistry.js`
  - 负责从环境变量和数据源元信息构造 feed 注册表

### 抓取与标准化层

- [src/dataFetchers.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/dataFetchers.js)
  - 继续保留按分类抓取接口
  - 允许 webhook 服务只调用单一 category 抓取

- `src/dataSources/*.js`
  - 在 transform 输出的 `source_meta` 中补足 feed 级标识
  - 至少保证能拿到 `feed_id` 或 URL 级标识中的一种

- [src/sourceItems.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/sourceItems.js)
  - 将 feed 元信息保留到 `extra_json` 或顶层 `source_meta.extra`
  - 保证 webhook 二次筛选时无需再依赖原始 payload 结构猜字段

### 测试

- 新增 webhook handler 测试
- 新增 feed 匹配测试
- 新增命中来源但无条目测试
- 新增 token 校验测试
- 新增上游失败测试

## 配置与部署

### 新增环境变量

新增 Worker 环境变量或 secret：

- `FOLO_WEBHOOK_TOKEN`

建议作为 secret 配置，而不是普通明文变量。

### Folo 配置方式

在 Folo 中将 webhook URL 配置为：

```text
https://<your-worker-domain>/webhooks/folo?token=<FOLO_WEBHOOK_TOKEN>
```

这样 Folo 不需要额外设置自定义 header，接入成本最低。

### 兼容性要求

- 现有 `/writeData`、`/backfillData`、`scheduled()` 行为保持不变
- webhook 只新增能力，不改变登录态工作台主流程
- 若未配置 `FOLO_WEBHOOK_TOKEN`，项目应在启动时明确报配置缺失

## 错误处理与日志

### 日志事件

建议至少输出三类结构化日志：

- `folo-webhook-received`
- `folo-webhook-no-match`
- `folo-webhook-ingestion-result`

建议日志字段包括：

- `event`
- `matched`
- `matchKey`
- `sourceKey`
- `sourceType`
- `status`
- `upsertedCount`
- `errors`

### 失败语义

- `400`：请求体不是合法 JSON，或缺少可识别的 feed 标识
- `401`：query token 错误
- `405`：不是 `POST`
- `502`：命中来源后，上游 Folo 分类抓取失败
- `202`：请求有效，但没有匹配来源或没有筛出目标条目

## 测试策略

### 单元测试

覆盖以下场景：

- token 正确时 webhook 可进入处理逻辑
- token 错误时返回 `401`
- payload 不合法时返回 `400`
- `entry.feedId` 命中本地来源并触发定向写入
- `feed.id` 缺失时可回退到 `feed.url` 或 `feed.siteUrl`
- 未匹配来源时返回 `202`
- 命中来源但无条目时返回 `202`
- 上游分类抓取失败时返回 `502`

### 集成测试

验证以下链路：

- `/webhooks/folo` 不受登录态保护
- 命中来源后只调用一个 category 的抓取逻辑，而不是全量抓取
- webhook 路径只写入 D1 `source_items`，不会写 `daily_reports`

## 后续演进

若 webhook 使用频率升高，或分类级抓取的成本明显偏大，第二阶段可以继续演进：

- 给 data source `fetch(...)` 增加 `targetFeedId`
- 让命中的数据源直接请求单个 feed
- 为 webhook 增加去重键和幂等日志
- 为临时失败增加延迟重试或队列化处理

第一版不做这些增强，优先先把稳定、可落地、改动面小的 webhook 接入跑通。
