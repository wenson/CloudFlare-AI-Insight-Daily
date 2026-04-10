# 定时抓取与手动 Backfill 设计

本文定义“自动抓取最近 7 天数据”和“登录后页面手动补数”两项能力的最终设计，目标读者是维护当前 Cloudflare Worker 的开发者。默认读者已经了解现有 `/writeData`、D1 `source_items`、Folo 抓取链路与登录态页面；本文不覆盖自动生成日报、RSS 自动发布或 webhook 方案。

## 一句话结论

本次设计新增两条互补链路：一条是使用 Cloudflare Worker `scheduled()` 的日常定时抓取链路，每天执行一次“滚动最近 7 天抓取”；另一条是在登录后的内容工作台提供手动 `backfill` 操作，按日期区间逐天回填 `source_items`。两条链路复用同一套抓取与 D1 upsert 服务，自动任务与补数都统一使用 Cloudflare secret `FOLO_COOKIE`，且都不自动生成日报。

## 目标与边界

### 目标

- 让 Worker 在无人值守时自动补齐最近 7 天的原始内容数据。
- 让管理员在登录后的工作台手动回填指定日期区间的数据。
- 复用现有数据源抓取和 D1 upsert 逻辑，避免维护两套实现。
- 保持现有手动 `/writeData` 页面抓取能力可继续使用。

### 不在范围内

- 不自动触发 `/genAIContent`。
- 不自动更新 D1 `daily_reports`。
- 不引入公开的 backfill token 接口。
- 不将 Folo Cookie 写入浏览器以外的 Cloudflare KV。

## 设计决策

### 决策 1：日常任务采用“单次滚动 7 天抓取”

日常 cron 每次只执行一次抓取，直接复用当前 `FOLO_FILTER_DAYS=7` 的窗口语义，而不是循环 7 个日期逐天回填。

原因：

- 当前各数据源天然按“最近 N 天”工作，和滚动窗口模型一致。
- `source_items` 已按 `source_type + source_item_id` upsert，重复抓取安全。
- 单次任务请求量更小，运行时间更短，失败面更窄。

### 决策 2：补数采用“逐天回填”

登录后页面里的 `backfill` 采用日期区间逐天执行，例如 `2026-04-01` 到 `2026-04-03` 会按 3 个锚点日期依次执行抓取。

原因：

- backfill 的目的不是高频保鲜，而是人工兜底历史缺口。
- 逐天执行更符合管理员心智，也更容易在结果中定位哪一天失败。

### 决策 3：自动任务与 backfill 统一使用 secret `FOLO_COOKIE`

浏览器本地 `localStorage` 中的 Folo Cookie 继续服务当前“手动抓取最新数据”按钮；新增的自动任务与 backfill 不依赖浏览器上下文，统一改为读取 Worker secret `FOLO_COOKIE`。

原因：

- `scheduled()` 没有浏览器上下文，不能复用当前请求体传 cookie 的模式。
- `FOLO_COOKIE` 属于运行时凭证，更适合放在 Cloudflare secret。
- 页面手动抓取保留本地 Cookie，可继续支持临时调试和人工排障。

## 总体方案

### 1. 新增共享抓取服务

从现有 [writeData.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/handlers/writeData.js) 中抽出一层共享服务，例如 `runSourceItemIngestion`。

该服务负责：

- 解析目标抓取日期。
- 选择 cookie 来源。
- 调用 `fetchAllData` 或 `fetchDataByCategory`。
- 将结果转换为 `buildSourceItemRecord(...)`。
- upsert 到 D1 `source_items`。
- 生成结构化结果：成功分类、失败分类、写入条数、错误信息。

共享服务不感知调用来源，只处理“单次抓取并入库”。

### 2. 保留现有手动 `/writeData`

现有 `/writeData` 继续保留，行为不变：

- 登录后页面点击“抓取最新数据”。
- 前端从 `localStorage` 读取 Folo Cookie。
- 请求体把 `foloCookie` 传给 Worker。
- Worker 走共享服务完成单次抓取。

这样不会打断当前操作习惯，也便于人工调试 Folo 权限问题。

### 3. 新增 `scheduled()` 定时抓取

在 [index.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/index.js) 的默认导出中新增 `scheduled(controller, env, ctx)`。

执行语义：

- 每天执行 1 次。
- 抓取日期锚点为当前上海日期。
- 读取 secret `FOLO_COOKIE`。
- 运行一次“滚动最近 7 天抓取”。
- 只写 D1 `source_items`。
- 通过 `console.log` / `console.error` 输出结构化执行摘要。

### 4. 新增登录态 backfill 路由

新增登录态 POST 路由，例如 `/backfillData`。

请求体字段：

- `startDate`
- `endDate`

执行语义：

- 仅登录用户可访问。
- 统一读取 secret `FOLO_COOKIE`。
- 校验日期格式与区间顺序。
- 逐天调用共享抓取服务。
- 返回每一天的执行结果摘要。

该接口不是公开运维接口，只作为登录后页面操作的后端支撑。

## 页面交互设计

### 工作台新增 Backfill 卡片

在 [contentSelectionPage.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/ui/contentSelectionPage.js) 的现有工作台中新增一个轻量补数卡片，放在 header action 区附近或 cookie 面板附近，避免打断主流程。

最小交互字段：

- `开始日期`
- `结束日期`
- `开始补数` 按钮

展示原则：

- 默认不展开复杂配置。
- 不暴露 category 级开关。
- 不把“补数”和“生成日报”混成一个按钮。

### 页面交互流程

1. 管理员登录并进入 `/getContentHtml`。
2. 输入 `startDate` 与 `endDate`。
3. 点击“开始补数”。
4. 前端 POST `/backfillData`。
5. 按钮进入 loading 态。
6. 完成后展示 toast 和压缩结果摘要。

推荐摘要格式：

- `补数完成：3 天成功，1 天部分失败`

如果存在失败，再显示逐日错误信息：

- `2026-04-02：socialMedia 抓取失败`

## 失败处理

### 单次抓取

共享抓取服务按分类聚合结果。

- `FOLO_COOKIE` 缺失：直接失败。
- 某个分类失败：其他分类继续抓取并照常入库。
- 所有分类都失败：该次抓取标记为失败。

返回结构建议：

```json
{
  "success": false,
  "date": "2026-04-10",
  "mode": "scheduled",
  "counts": {
    "news": 21,
    "paper": 8,
    "socialMedia": 0
  },
  "errors": [
    "socialMedia: Reddit request failed: 401 Unauthorized"
  ]
}
```

### Backfill 区间执行

区间内每一天独立执行并独立汇总。

- 单天失败不终止整个区间。
- 最终结果给出成功天数、部分失败天数、完全失败天数。
- 页面返回按日期展开的结果数组，方便前端压缩展示或后续增强。

## 配置与部署

### 新增 secret

新增 Cloudflare secret：

- `FOLO_COOKIE`

本地与线上都必须配置该 secret，才能使用 `scheduled()` 和 `/backfillData`。

### cron 配置

在 [wrangler.toml](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/wrangler.toml) 中新增 cron 配置。

第一版建议时间：

- 北京时间每天 `08:10`
- 对应 UTC cron：`10 0 * * *`

该时间点选择的理由是：

- 适合作为“每天一次保鲜”的默认节奏。
- 对“滚动最近 7 天”模型来说，失败后第二天仍可兜底补齐窗口。

## 代码改动面

### 后端

- [index.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/index.js)
  - 新增 `scheduled()`
  - 新增 `/backfillData` 路由
  - 将新路由纳入登录态保护范围

- [writeData.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/handlers/writeData.js)
  - 下沉共享抓取逻辑
  - 保留现有 handler 行为

- 新增共享服务文件，例如：
  - `src/services/sourceItemIngestion.js`
  - `src/handlers/backfillData.js`

### 前端

- [contentSelectionPage.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/ui/contentSelectionPage.js)
  - 新增 backfill 表单
  - 新增 backfill 请求与结果反馈逻辑
  - 保持现有 cookie panel、手动抓取和生成日报交互不变

### 文档

- [docs/DEPLOYMENT.md](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/docs/DEPLOYMENT.md)
  - 增加 `FOLO_COOKIE` secret 说明
  - 增加 cron 配置说明
  - 增加 backfill 使用说明

- [docs/API_ROUTES.md](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/docs/API_ROUTES.md)
  - 增加 `/backfillData`
  - 增加 `scheduled()` 说明

- [docs/DATA_FLOW.md](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/docs/DATA_FLOW.md)
  - 增加 secret 驱动的自动抓取链路
  - 区分“浏览器手动抓取”和“Worker 自动抓取”

## 测试策略

### 服务层测试

- `FOLO_COOKIE` 缺失时返回清晰错误。
- 单次抓取部分分类失败时，成功分类仍可入库。
- 全部分类失败时返回失败结果。
- 单次抓取成功时返回每分类写入条数。

### `scheduled()` 测试

- 会读取 `env.FOLO_COOKIE`。
- 会调用共享抓取服务 1 次。
- 不会触发 `/genAIContent` 或写 `daily_reports`。

### backfill 测试

- 登录态用户可调用 `/backfillData`。
- 非登录态请求会被重定向到 `/login`。
- 非法日期格式返回 `400`。
- `startDate > endDate` 返回 `400`。
- 合法区间会逐天执行并返回逐日结果。

### UI 测试

- 工作台渲染出开始日期、结束日期和补数按钮。
- 提交 backfill 时使用新的前端控制逻辑。
- 现有 cookie panel、抓取按钮、选择摘要与生成按钮不回归。

## 风险与缓解

### 风险 1：Folo Cookie 失效

影响：

- `scheduled()` 与 backfill 都会失败。

缓解：

- 明确错误日志指向 `FOLO_COOKIE` 缺失或失效。
- 保留浏览器手动抓取链路，便于人工验证 cookie 是否仍有效。

### 风险 2：单次 cron 运行时间偏长

影响：

- 某些列表分页较多时，任务时长增加。

缓解：

- 日常 cron 只跑 1 次滚动 7 天抓取，不做逐天回填。
- 保持现有每分类分页上限配置可调。

### 风险 3：管理员误填过大 backfill 区间

影响：

- 手动补数耗时变长，失败面增大。

缓解：

- 页面第一版限制区间上限，例如不超过 `31` 天。
- 超限时前端和后端都返回清晰错误。

## 上线顺序

1. 抽出共享抓取服务。
2. 接入 `scheduled()` 与 `FOLO_COOKIE`。
3. 接入 `/backfillData`。
4. 在工作台增加 backfill UI。
5. 补充测试与部署文档。
6. 配置 `FOLO_COOKIE` secret 与 cron。

## 验收标准

- Worker 每天能自动执行一次滚动最近 7 天抓取，并将内容写入 D1 `source_items`。
- 登录后的工作台可以手动补数指定日期区间。
- 自动抓取与 backfill 都不会自动生成日报。
- 现有手动 `/writeData` 和 `/genAIContent` 行为保持不变。
- 部分分类失败不会阻断成功分类入库。
