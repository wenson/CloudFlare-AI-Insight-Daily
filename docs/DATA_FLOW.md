# 数据源与数据流

本文说明项目的数据从哪里来、如何进入系统，以及在 Worker 内部如何流转。本文基于当前代码实际实现，描述的是“内容数据 D1-only + KV 仅会话”的主链路。

## 一句话结论

本项目的主链路是：`浏览器 → Cloudflare Worker → Folo → Cloudflare D1(source_items) → 浏览器内容页 / RSS`，以及 `source_items → AI 生成 → Cloudflare D1(daily_reports) → 浏览器结果页`。

## 总体数据流图

```mermaid
flowchart TD
    U[用户浏览器] --> A[GET /getContentHtml]
    A --> W[Cloudflare Worker]

    U --> B[浏览器 localStorage<br/>保存 Folo Cookie]
    U --> C[POST /writeData<br/>携带 foloCookie]
    C --> W

    W --> D1[Folo API<br/>FOLO_DATA_API]
    D1 --> E[各 DataSource 抓取并标准化]
    E --> F[Cloudflare D1<br/>source_items]

    U --> G[POST /genAIContent]
    G --> W
    W --> F
    F --> H[拼装选中文本]
    H --> I[Gemini / OpenAI Compatible API]
    I --> J[生成 AI 日报]
    J --> U

    U --> K[POST /genAIPodcastScript]
    K --> W
    W --> I
    I --> L[生成播客稿]
    L --> U

    F --> P[GET /rss]
    J --> O[写入 Cloudflare D1<br/>daily_reports]

    U --> M[POST /genAIDailyAnalysis]
    M --> W
    W --> I
    I --> N[生成分析结果]
    N --> U
```

## 数据来源

当前项目实际启用的数据源全部来自 Folo / Follow API：

- `news` → [newsAggregator.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/dataSources/newsAggregator.js)
- `paper` → [papers.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/dataSources/papers.js)
- `socialMedia` → [twitter.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/dataSources/twitter.js)
- `socialMedia` → [reddit.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/dataSources/reddit.js)

这些数据源主要依赖：

- `FOLO_DATA_API`
- `FOLO_FILTER_DAYS`
- `NEWS_AGGREGATOR_LIST_ID`
- `HGPAPERS_LIST_ID`
- `TWITTER_LIST_ID`
- `REDDIT_LIST_ID`

## 用户操作时序图

```mermaid
sequenceDiagram
    participant User as 用户浏览器
    participant Worker as Cloudflare Worker
    participant Folo as Folo API
    participant KV as Cloudflare KV
    participant D1 as Cloudflare D1
    participant AI as Gemini/OpenAI

    User->>Worker: GET /getContentHtml
    Worker->>D1: 读取 source_items 时间窗口内容
    Worker-->>User: 返回勾选页面

    User->>Worker: POST /writeData + foloCookie
    Worker->>Folo: 拉取新闻 / 论文 / 社交内容
    Worker->>D1: upsert 到 source_items

    User->>Worker: POST /genAIContent
    Worker->>D1: 读取选中 source_items
    Worker->>AI: 生成日报
    Worker->>AI: 生成 RSS 摘要
    AI-->>Worker: 返回日报内容与 RSS 摘要
    Worker->>D1: upsert daily_reports
    Worker-->>User: 展示日报结果页

    User->>Worker: POST /genAIPodcastScript
    Worker->>AI: 基于日报内容生成播客稿
    AI-->>Worker: 返回播客稿
    Worker-->>User: 展示播客页

    User->>Worker: GET /rss
    Worker->>D1: 查询最近 N 天 source_items
    D1-->>Worker: 返回结果集
    Worker-->>User: 返回 RSS XML
```

## 关键存储层

项目里当前有三个主要落地点。

### 1. 浏览器 `localStorage`

用于保存 `Folo Cookie`，方便用户在内容选择页重复抓取数据时复用。

### 2. Cloudflare KV

当前仅用于登录 session。

典型键名示例：

- `session:<session_id>`

### 3. Cloudflare D1

用于保存抓取与生成两类核心数据：

- `source_items`：抓取后的新闻/论文/社媒原始内容明细
- `daily_reports`：生成后的日报内容与摘要存档

`daily_reports` 里包含：

- `daily_markdown`
- `rss_markdown`
- `rss_html`
- `published_at` / `updated_at`

`/writeData`、`/getContent`、`/getContentHtml`、`/genAIContent` 的内容数据都以 `source_items` 为准；`/rss` 现在也直接读取 `source_items`，不再依赖 `daily_reports`。

## 代码中的关键入口

建议按这个顺序阅读：

1. [src/index.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/index.js)
2. [src/handlers/writeData.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/handlers/writeData.js)
3. [src/dataFetchers.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/dataFetchers.js)
4. [src/dataSources/newsAggregator.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/dataSources/newsAggregator.js)
5. [src/dataSources/papers.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/dataSources/papers.js)
6. [src/dataSources/twitter.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/dataSources/twitter.js)
7. [src/dataSources/reddit.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/dataSources/reddit.js)
8. [src/handlers/genAIContent.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/handlers/genAIContent.js)
9. [src/d1.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/d1.js)
10. [src/handlers/getRss.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/handlers/getRss.js)

## 补充说明

- `src/dataSources/` 目录下的文件并不会自动生效，真正启用哪些数据源由 [src/dataFetchers.js](/Volumes/c/Workspace/CloudFlare-AI-Insight-Daily/src/dataFetchers.js) 决定。
- Worker 已不再把日报或播客写入 GitHub，且内容数据不再写入 KV。

## 4. 调度与补数的数据通路

- Worker 在 `[triggers]` 中定义了 `crons = ["10 0 * * *"]`，也就是每天 **00:10 UTC / 08:10 Asia/Shanghai** 触发 `scheduled()`。
- 这个入口读取云端环境变量 `FOLO_COOKIE`（通过 `npx wrangler secret put FOLO_COOKIE` 上传），再调用 `runSourceItemIngestion` 运行当天的补数流程，唯一的输出是 D1 的 `source_items`，不会写入 `daily_reports`。
- `/backfillData` 路径复用同一条服务，每次提交 `startDate`/`endDate` 时按日逐个调用同样的 ingestion 服务，结果仍旧只落在 `source_items`。
- 手动 `/writeData` 仍然通过 UI 读取浏览器 localStorage 的 Folo Cookie，供公开页面使用。调度补数因为依赖密文，所以不会把 cookie 暴露给浏览器或 RSS 输出。
