# KV 键结构说明

本文说明项目当前写入 Cloudflare KV 的键名规则、每类 key 存储的内容、写入时机与读取时机。适合排查数据丢失、理解缓存层职责、或准备调整存储模型的开发者阅读。本文仅描述当前代码中已经使用的 key。

## 一句话结论

当前 KV 主要承载三类数据：`按日期分类的抓取结果`、`按日期保存的 RSS report`、`登录 session`。

## KV 键分类图

```mermaid
flowchart TD
    A[Cloudflare KV]
    A --> B[日期分类内容]
    A --> C[RSS report]
    A --> D[登录 session]

    B --> B1[YYYY-MM-DD-news]
    B --> B2[YYYY-MM-DD-paper]
    B --> B3[YYYY-MM-DD-socialMedia]

    C --> C1[YYYY-MM-DD-report]
    D --> D1[session:session_id]
```

## 键名总表

| Key 模式 | 示例 | 值类型 | 写入位置 | 读取位置 |
| --- | --- | --- | --- | --- |
| `YYYY-MM-DD-news` | `2026-04-07-news` | JSON 数组 | `/writeData` | `/getContent` `/getContentHtml` `/genAIContent` |
| `YYYY-MM-DD-paper` | `2026-04-07-paper` | JSON 数组 | `/writeData` | `/getContent` `/getContentHtml` `/genAIContent` |
| `YYYY-MM-DD-socialMedia` | `2026-04-07-socialMedia` | JSON 数组 | `/writeData` | `/getContent` `/getContentHtml` `/genAIContent` |
| `YYYY-MM-DD-report` | `2026-04-07-report` | JSON 对象 | `/writeRssData` | `/rss` |
| `session:<id>` | `session:abc123` | JSON 字符串 | `/login` | 登录校验、续期、登出 |

## 1. 按日期分类的抓取结果

这是项目最核心的一组 key。它们承接外部数据源抓取结果，并作为日报生成阶段的输入。

### 键名规则

格式为：

```text
YYYY-MM-DD-分类名
```

当前分类名来自 `src/dataFetchers.js`：

- `news`
- `paper`
- `socialMedia`

### 写入时机

由 `/writeData` 写入。

- 全量抓取：一次写入全部分类
- 按分类抓取：只写某一个分类

### 读取时机

- `/getContent`
- `/getContentHtml`
- `/genAIContent`

### 值结构

值是一个 JSON 数组，每个元素是统一格式的数据对象，通常包含：

- `id`
- `type`
- `url`
- `title`
- `description`
- `published_date`
- `authors`
- `source`
- `details`

示意结构：

```json
[
  {
    "id": "123",
    "type": "news",
    "url": "https://example.com",
    "title": "标题",
    "description": "摘要",
    "published_date": "2026-04-07T08:00:00.000Z",
    "authors": "author",
    "source": "source",
    "details": {
      "content_html": "<p>...</p>"
    }
  }
]
```

## 2. RSS report

这是 RSS 输出链路使用的 key。

### 键名规则

格式为：

```text
YYYY-MM-DD-report
```

### 写入时机

由 `/writeRssData` 写入。该接口会先从 GitHub 的 `rss/YYYY-MM-DD.md` 读取内容，再转成 HTML，最后保存到 KV。

### 读取时机

由 `/rss` 读取。接口会按最近 N 天遍历：

- `YYYY-MM-DD-report`

再聚合成 RSS Feed。

### 值结构

值是一个 JSON 对象，当前字段包括：

- `report_date`
- `title`
- `link`
- `content_html`
- `published_date`

示意结构：

```json
{
  "report_date": "2026-04-07",
  "title": "2026-04-07日刊",
  "link": "/2026-04/2026-04-07/",
  "content_html": "<h2>...</h2>",
  "published_date": "2026/4/7 08:00:00"
}
```

## 3. 登录 session

这组 key 用于登录态维护。

### 键名规则

格式为：

```text
session:<session_id>
```

### 写入时机

- `/login` 登录成功后写入
- `isAuthenticated()` 校验成功后会续期并重写

### 删除时机

- `/logout` 删除该 key

### 值结构

当前保存的是字符串语义的 session 状态，实际以 JSON 字符串形式存储。

示意：

```json
"valid"
```

## TTL 说明

### 默认 TTL

`src/kv.js` 中的默认 TTL 是 7 天：

```text
86400 * 7
```

因此：

- 分类抓取结果默认保留 7 天
- RSS report 默认保留 7 天

### Session TTL

`src/auth.js` 中 session TTL 是 1 小时：

```text
60 * 60
```

且每次通过认证后会续期。

## 写入与读取关系图

```mermaid
flowchart LR
    A[/writeData/] --> B[YYYY-MM-DD-news/paper/socialMedia]
    B --> C[/getContent/]
    B --> D[/getContentHtml/]
    B --> E[/genAIContent/]

    F[/writeRssData/] --> G[YYYY-MM-DD-report]
    G --> H[/rss/]

    I[/login/] --> J[session:id]
    J --> K[isAuthenticated]
    K --> J
    L[/logout/] --> J
```

## 使用建议

- 排查“页面空白”时，先看当天分类 key 是否写入。
- 排查“RSS 没内容”时，先看当天 `report` key 是否存在。
- 排查“登录失效”时，检查 `session:` key 是否被成功续期或被提前清理。

## 代码入口

建议按以下顺序阅读：

1. `src/kv.js`
2. `src/handlers/writeData.js`
3. `src/handlers/getContent.js`
4. `src/handlers/getContentHtml.js`
5. `src/handlers/genAIContent.js`
6. `src/handlers/writeRssData.js`
7. `src/handlers/getRss.js`
8. `src/auth.js`
