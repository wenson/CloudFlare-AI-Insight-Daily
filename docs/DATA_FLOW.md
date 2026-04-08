# 数据源与数据流

本文说明项目的数据从哪里来、如何进入系统，以及在 Worker 内部如何流转。本文基于当前代码实际实现，描述的是 `KV + D1` 架构下的主链路。

## 一句话结论

本项目的主链路是：`浏览器 → Cloudflare Worker → Folo → Cloudflare KV → AI 生成 → Cloudflare D1 → 浏览器结果页 / RSS`。

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
    E --> F[Cloudflare KV<br/>按日期+分类存储]

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

    J --> O[写入 Cloudflare D1<br/>日报正文 + RSS 摘要]
    O --> P[GET /rss]

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
    Worker->>KV: 读取当天已有内容
    Worker-->>User: 返回勾选页面

    User->>Worker: POST /writeData + foloCookie
    Worker->>Folo: 拉取新闻 / 论文 / 社交内容
    Worker->>KV: 按分类写入

    User->>Worker: POST /genAIContent
    Worker->>KV: 读取已抓取内容
    Worker->>AI: 生成日报
    Worker->>AI: 生成 RSS 摘要
    AI-->>Worker: 返回日报内容与 RSS 摘要
    Worker->>D1: upsert 当天日报记录
    Worker-->>User: 展示日报结果页

    User->>Worker: POST /genAIPodcastScript
    Worker->>AI: 基于日报内容生成播客稿
    AI-->>Worker: 返回播客稿
    Worker-->>User: 展示播客页

    User->>Worker: GET /rss
    Worker->>D1: 查询最近 N 天日报摘要
    D1-->>Worker: 返回结果集
    Worker-->>User: 返回 RSS XML
```

## 关键存储层

项目里当前有三个主要落地点。

### 1. 浏览器 `localStorage`

用于保存 `Folo Cookie`，方便用户在内容选择页重复抓取数据时复用。

### 2. Cloudflare KV

用于保存：

- 按日期和分类缓存的抓取结果
- 登录 session

典型键名示例：

- `2026-04-07-news`
- `2026-04-07-paper`
- `2026-04-07-socialMedia`
- `session:<session_id>`

### 3. Cloudflare D1

用于保存生成后的正式产物：

- `daily_markdown`
- `rss_markdown`
- `rss_html`
- `published_at` / `updated_at`

它是 `/rss` 的唯一数据来源，也是“生成即发布”的持久化落点。

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
- Worker 已不再把日报或播客写入 GitHub，但会把日报正文与 RSS 摘要写入 D1。
