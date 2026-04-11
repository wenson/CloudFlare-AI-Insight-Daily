## 项目部署与维护

### 架构概览

当前项目只包含一条运行主链路：

- Cloudflare Worker：处理登录、抓取、内容生成与页面渲染
- Cloudflare KV：仅保存登录 session
- Cloudflare D1：保存抓取内容明细 `source_items` 与生成结果 `daily_reports`
- Folo / Follow API：作为新闻、论文和社交内容来源
- Gemini 或 OpenAI 兼容接口：生成日报、播客稿和分析内容

项目已不再包含 GitHub 提交链路。当前版本中，`/writeData` 会把内容 upsert 到 D1 `source_items`，`/genAIContent` 会把生成结果 upsert 到 D1 `daily_reports`，而 `/rss` 会直接读取最近 N 天的 `source_items`。

### 1. 准备环境

- 安装 Node.js 20+
- 安装 Wrangler

```bash
npm install -g wrangler
```

- 克隆仓库

```bash
git clone https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily.git
cd CloudFlare-AI-Insight-Daily
```

### 2. 创建并绑定 KV 与 D1

先创建一个专用 KV namespace：

```bash
npx wrangler kv namespace create DATA_KV
```

把命令返回的 namespace id 填到 [wrangler.toml](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/wrangler.toml) 里的 `[[kv_namespaces]]`。

再创建一个 D1 数据库：

```bash
npx wrangler d1 create ai-daily
```

把命令返回的 `database_id` 填到 [wrangler.toml](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/wrangler.toml) 里的 `[[d1_databases]]`，然后执行表结构初始化（会创建 `source_items` 与 `daily_reports` 等表）：

```bash
npx wrangler d1 execute ai-daily --local --file=schema.sql
```

如果要初始化线上库，再执行：

```bash
npx wrangler d1 execute ai-daily --remote --file=schema.sql
```

可选检查（确认 `source_items` 已存在）：

```bash
npx wrangler d1 execute ai-daily --local --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('source_items','daily_reports');"
```

### 3. 配置非敏感变量

项目默认使用 [wrangler.toml](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/wrangler.toml) 中的 `[vars]`：

- `USE_MODEL_PLATFORM`
- `GEMINI_API_URL` / `DEFAULT_GEMINI_MODEL`
- `OPENAI_API_URL` / `DEFAULT_OPEN_MODEL`
- `FOLO_*`
- 各个 `*_LIST_ID`
- 页面标题、播客标题、插入尾注等显示配置

最常见的改法：

- 使用 Gemini：保留 `USE_MODEL_PLATFORM = "GEMINI"`
- 使用 OpenAI 兼容接口：改成 `USE_MODEL_PLATFORM = "OPEN"`，并填写 `OPENAI_API_URL` 与 `DEFAULT_OPEN_MODEL`
- 不抓某一类内容：把对应 `*_LIST_ID` 留空即可

### 4. 配置敏感变量

敏感信息不要写进 `wrangler.toml`，直接用 `wrangler secret put`：

默认 Gemini 部署至少需要：

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put LOGIN_USERNAME
npx wrangler secret put LOGIN_PASSWORD
```

如果你切到 OpenAI 兼容接口，还需要：

```bash
npx wrangler secret put OPENAI_API_KEY
```

- `FOLO_COOKIE`：Cloudflare 定时任务和 `/backfillData` 补数接口都会读取这个密文 Cookie，而不是从浏览器 localStorage 里拿。上传 Cookie 后，调度/补数执行时只在 Worker 内部使用它访问 Folo，手动 `/writeData` 依然通过浏览器端存储迁移 Cookie。

### 5. 本地调试

```bash
npx wrangler dev
```

如果你在改动抓取、页面渲染、D1 读写或 AI 生成链路，建议先跑一遍当前仓库的全量回归测试：

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/*.test.mjs
```

期望结果：

- 所有测试通过
- 输出里 `fail` 为 `0`

默认建议先访问：

- `/login`
- `/getContentHtml?date=YYYY-MM-DD`
- `/rss`

说明：

- `wrangler dev` 默认使用本地 KV（主要影响登录 session），不会直接读线上 KV 数据
- `wrangler dev` 配合 `wrangler d1 execute ... --local` 可以直接调试本地 D1（`source_items`/`daily_reports`）
- Folo Cookie 由浏览器 `localStorage` 保存，不需要写入 Worker 环境变量

### 6. 部署到 Cloudflare

```bash
npx wrangler deploy
```

如果你只想先确认打包没问题，可以先跑：

```bash
npx wrangler deploy --dry-run
```

### 7. 上线后检查

建议按这个顺序做 smoke test：

1. 打开 `/login`，确认能正常显示登录页
2. 使用 `LOGIN_USERNAME` / `LOGIN_PASSWORD` 登录
3. 打开 `/getContentHtml?date=YYYY-MM-DD`
4. 触发一次 `/writeData`
5. 打开 `/rss`，确认最近抓取内容已出现
6. 选择内容生成 `/genAIContent`
7. 再触发 `/genAIPodcastScript` 与 `/genAIDailyAnalysis`

补充说明：

- 仓库已提供 GitHub Actions 测试工作流，会在 `push` 和 `pull_request` 时自动执行同一条 Node 测试命令
- 如果你本地跑不过测试，先不要直接部署

### 8. 当前必需变量清单

运行时至少需要以下绑定或变量：

- `DATA_KV`
- `DB`
- `OPEN_TRANSLATE`
- `USE_MODEL_PLATFORM`
- `LOGIN_USERNAME`
- `LOGIN_PASSWORD`
- `PODCAST_TITLE`
- `PODCAST_BEGIN`
- `PODCAST_END`
- `FOLO_COOKIE_KV_KEY`
- `FOLO_DATA_API`
- `FOLO_FILTER_DAYS`

按模型平台二选一：

- Gemini：`GEMINI_API_KEY`、`GEMINI_API_URL`、`DEFAULT_GEMINI_MODEL`
- OpenAI 兼容：`OPENAI_API_KEY`、`OPENAI_API_URL`、`DEFAULT_OPEN_MODEL`

### 9. 当前发布语义

- `/writeData` 成功后会把抓取内容 upsert 到 D1 `source_items`
- `/genAIContent` 生成成功后会自动 upsert 当天日报到 D1 `daily_reports`
- 同一天重新生成会覆盖正文和 RSS 摘要，不会产生重复 feed 项
- `/rss?days=7` 默认读取最近 7 天的 D1 `source_items` 记录，并按单条内容输出 RSS `<item>`

### 10. Scheduled ingestion and FOLO cookie secret

Worker 已在 `[triggers]` 下设置 `crons = ["10 0 * * *"]`，也就是每天 **00:10 UTC / 08:10 Asia/Shanghai** 执行一次 `scheduled()`。该入口读取上一步配置的 `FOLO_COOKIE` 密文，运行 `runSourceItemIngestion` 来补齐当天数据，只 upsert `source_items`，不会生成或更新 `daily_reports`。如果需要补某个日期区间，可以调用 `/backfillData`，这个接口也同样依赖 `FOLO_COOKIE` secret。

每次手动在浏览器里更新 FOLO Cookie（localStorage）后，请同步运行 `npx wrangler secret put FOLO_COOKIE`，确保调度与补数任务使用的 Cookie 是最新的。
