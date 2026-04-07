# 移除 GitHub 发布与 RSS 链路设计

## 结论
本次改动将彻底移除项目中的 GitHub 发布链路与 RSS 输出链路，包括运行时代码、`wrangler.toml` 配置项和所有把 GitHub 自动提交、RSS、GitHub Pages 发布视为当前能力的文档描述。改动完成后，项目将只保留 Cloudflare Worker 上的登录、抓取、日报生成、播客稿生成与分析能力，不再依赖 `GITHUB_TOKEN`。

## 文档目标与范围
本文面向接手该仓库的开发者，说明“移除 GitHub 发布与 RSS 链路”这一收敛改动的边界、实施方式与验收标准。默认读者已了解 Cloudflare Worker、KV 与本项目现有目录结构。本文不包含新的持久化存储替代方案，也不重新设计站点发布能力。

## 改动目标
- 删除 GitHub 自动提交能力与 GitHub 仓库读写能力。
- 删除 RSS 生成、写入与输出能力。
- 删除 `GITHUB_*` 相关必填环境变量与 `wrangler.toml` 配置。
- 删除 README 与技术文档中关于 GitHub 提交、RSS、GitHub Pages 的当前能力描述。
- 保证代码、配置、文档对“当前项目能力”的描述一致。

## 范围
### 范围内
- 修改 `src/index.js`，移除 GitHub / RSS 路由和必填环境变量。
- 删除以下文件：
  - `src/github.js`
  - `src/handlers/commitToGitHub.js`
  - `src/handlers/getRss.js`
  - `src/handlers/writeRssData.js`
- 清理页面与 handler 中对 GitHub / RSS 的直接引用。
- 修改 `wrangler.toml`，移除 `GITHUB_*` 与仅服务于 RSS / GitHub 发布的变量。
- 更新以下文档中的 GitHub / RSS 相关内容：
  - `README.md`
  - `docs/DEPLOYMENT.md`
  - `docs/DATA_FLOW.md`
  - `docs/KV_KEYS.md`
  - `docs/API_ROUTES.md`

### 范围外
- 不新增替代的日报持久化方案。
- 不修改 Folo 抓取与 KV 缓存链路。
- 不修改 AI 摘要、播客稿、分析页的核心生成逻辑，除非它们直接依赖 GitHub / RSS。
- 不处理与本次移除无关的重构。

## 设计方案
### 方案对比
| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A. 彻底移除 | 删除 GitHub / RSS 代码、配置、文档 | 部署最简，不再需要 `GITHUB_TOKEN` | 以后恢复需重新接入 |
| B. 仅隐藏入口 | 保留代码，只删路由或按钮 | 恢复快 | 留下死代码和过期配置 |
| C. 仅改为非必填 | 代码仍在，运行时按条件跳过 | 改动小 | 复杂度仍在，部署口径不清 |

推荐方案为 **A. 彻底移除**，因为用户明确表示“生成日报后自动提交到 GitHub”与 RSS 均不需要。

### 具体改动
#### 1. 路由与运行时代码
- 修改 `src/index.js`：
  - 删除 `handleCommitToGitHub`、`handleRss`、`handleWriteRssData`、`handleGenerateRssContent` 的 import。
  - 删除 `/commitToGitHub`、`/rss`、`/writeRssData`、`/generateRssContent` 路由。
  - 从 `requiredEnvVars` 中移除：
    - `GITHUB_TOKEN`
    - `GITHUB_REPO_OWNER`
    - `GITHUB_REPO_NAME`
    - `GITHUB_BRANCH`
- 删除 `src/github.js` 与三个 GitHub / RSS 相关 handler 文件。
- 检查并清理其他文件中对这些 handler 或 GitHub 能力的直接引用。

#### 2. 配置
- 从 `wrangler.toml` 删除：
  - `GITHUB_TOKEN`
  - `GITHUB_REPO_OWNER`
  - `GITHUB_REPO_NAME`
  - `GITHUB_BRANCH`
  - `BOOK_LINK`（若 RSS 完全移除则无意义）
- 保留 Worker、KV、AI、Folo、登录所需配置。

#### 3. 文档
- `README.md`：删除 GitHub Pages、RSS、自动提交 GitHub 的能力描述。
- `docs/DEPLOYMENT.md`：删除 GitHub API / GitHub Pages / RSS 相关部署内容与配置示例。
- `docs/DATA_FLOW.md`：移除 GitHub Repo、RSS、Pages 相关链路与时序。
- `docs/KV_KEYS.md`：删除 `YYYY-MM-DD-report` 的键说明，保留日期分类内容与 session。
- `docs/API_ROUTES.md`：删除 `/commitToGitHub`、`/generateRssContent`、`/writeRssData`、`/rss` 相关说明。

## 风险与控制
- **风险 1：页面残留按钮或文案。** 若生成结果页仍包含 GitHub / RSS 按钮，会形成死链接。需要检查 HTML 生成逻辑与结果页模板。
- **风险 2：删除 handler 后 import 残留。** 路由入口或其他模块若仍引用被删除文件，会导致 Worker 启动失败。需要做全仓搜索和入口复核。
- **风险 3：文档口径不一致。** 若 README 与 docs 仍然描述 GitHub / RSS，会误导部署者继续配置 `GITHUB_TOKEN`。需要统一更新。

## 实施顺序
1. 删除 GitHub / RSS 路由与 handler 文件。
2. 删除 `src/github.js` 与相关引用。
3. 删除 `wrangler.toml` 中的 GitHub 配置。
4. 清理页面模板中的 GitHub / RSS 文案与按钮。
5. 更新所有目标文档。
6. 全仓搜索确认无残留。

## 验收标准
满足以下条件即视为完成：
- `src/index.js` 不再注册 GitHub / RSS 路由。
- `src/index.js` 的 `requiredEnvVars` 不再包含任何 `GITHUB_*`。
- 以下文件已删除：
  - `src/github.js`
  - `src/handlers/commitToGitHub.js`
  - `src/handlers/getRss.js`
  - `src/handlers/writeRssData.js`
- `wrangler.toml` 不再包含 `GITHUB_TOKEN`、`GITHUB_REPO_OWNER`、`GITHUB_REPO_NAME`、`GITHUB_BRANCH`。
- README 与正式文档不再把 GitHub 提交、RSS、GitHub Pages 视为当前有效能力。
- Cloudflare Worker 部署时不再需要 `GITHUB_TOKEN`。

## 验证方法
- 全仓搜索：
  - `grep -R "GITHUB_TOKEN\|GITHUB_REPO_OWNER\|GITHUB_REPO_NAME\|GITHUB_BRANCH\|commitToGitHub\|generateRssContent\|writeRssData\|handleRss\|/rss" -n .`
- 检查 `src/index.js` 与 `wrangler.toml` 的最终状态。
- 抽查 `README.md`、`docs/DEPLOYMENT.md`、`docs/DATA_FLOW.md`、`docs/KV_KEYS.md`、`docs/API_ROUTES.md`，确认能力描述已收敛为登录、抓取、日报生成、播客稿生成、分析页。
