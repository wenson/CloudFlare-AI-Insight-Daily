# 移除 GitHub Trending API 与 project 分类设计

## 结论
本次改动将彻底移除仓库中的 `GitHub Trending API` 数据源及 `project` 分类，包括运行时代码、`wrangler.toml` 配置项和所有将 `project/项目` 视为当前有效分类的文档说明。改动完成后，系统仅保留 `news`、`paper`、`socialMedia` 三类抓取数据。

## 文档目标与范围
本文面向接手该仓库的开发者，说明“移除 `project` 分类”这一收敛改动的边界、实施方式与验收标准。默认读者已了解 Cloudflare Worker、KV 与本项目现有目录结构。本文不包含替代数据源设计，也不调整 AI 生成逻辑。

## 改动目标
- 删除 `GitHub Trending API` 数据源实现与运行时注册。
- 删除 `PROJECTS_API_URL` 配置项与部署文档中的对应说明。
- 删除 README 与技术文档中将 `project/项目` 视为现有分类的描述。
- 保证代码、配置、文档对“当前分类集合”的描述一致。

## 范围
### 范围内
- 删除 `src/dataSources/github-trending.js`。
- 修改 `src/dataFetchers.js`，移除 `project` 分类及其 import。
- 修改 `wrangler.toml`，移除 `PROJECTS_API_URL`。
- 更新以下文档中的 project 相关内容：
  - `README.md`
  - `docs/DEPLOYMENT.md`
  - `docs/DATA_FLOW.md`
  - `docs/KV_KEYS.md`
  - `docs/API_ROUTES.md`
- 全仓搜索并清理该链路的直接引用。

### 范围外
- 不新增新的项目类数据源。
- 不改变 `news`、`paper`、`socialMedia` 的抓取与生成行为。
- 不重构与本次移除无关的代码。
- 不补做新的产品能力说明。

## 设计方案
### 方案对比
| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A. 彻底移除 | 删除代码、配置、文档中的 `project` | 仓库最干净，后续无误导 | 若未来恢复，需要重新接入 |
| B. 仅停用 | 仅从注册表移除，保留文件与文档 | 恢复快 | 会留下死代码和错误文档 |
| C. 保留空分类 | 保留 `project` 名称但不抓取 | 改动最少 | 语义脏，和需求不符 |

推荐方案为 **A. 彻底移除**，因为用户明确要求“连同代码、配置项、文档里的 `project/项目` 分类一起彻底删掉”。

### 具体改动
#### 1. 代码
- 删除 `src/dataSources/github-trending.js`。
- 更新 `src/dataFetchers.js`：
  - 删除 `GithubTrendingDataSource` import。
  - 删除 `project: { name: '项目', sources: [GithubTrendingDataSource] }`。
- 保持 `src/index.js`、`getContentHtml` 等按 `dataSources` 动态生成分类的逻辑不变。删除注册后，UI 将自动不再展示该分类。

#### 2. 配置
- 从 `wrangler.toml` 的 `[vars]` 删除 `PROJECTS_API_URL`。
- 移除部署文档与 README 中关于该变量的填写说明。

#### 3. 文档
- `README.md`：删除“热门开源项目”等与当前实现不一致的表述。
- `docs/DEPLOYMENT.md`：删除 `GitHub Trending API` 与 `PROJECTS_API_URL` 相关内容。
- `docs/DATA_FLOW.md`：删除 `GitHub Trending API`、`project` 分类、`YYYY-MM-DD-project` 等链路与示例。
- `docs/KV_KEYS.md`：删除 `YYYY-MM-DD-project`、`project` 分类示意与键名说明。
- `docs/API_ROUTES.md`：把涉及 `project` 的分类说明改为仅保留当前三类。

## 风险与控制
- **风险 1：文档残留。** `project` 是普通单词，全文检索时可能混入无关结果。处理时应优先检查 `PROJECTS_API_URL`、`github-trending`、`GitHub Trending`、`YYYY-MM-DD-project`、`name: '项目'` 等高信号关键字。
- **风险 2：运行时分类展示遗漏。** 本项目分类展示由 `dataSources` 动态生成，删除注册后页面应自动消失，但仍需通过代码检查确认没有硬编码 `project`。
- **风险 3：配置与文档不一致。** 删除 `wrangler.toml` 项后，README 与部署文档必须同步更新，否则会继续误导部署者。

## 实施顺序
1. 删除数据源文件与注册。
2. 删除 `wrangler.toml` 中的配置项。
3. 更新所有项目文档。
4. 全仓搜索确认无残留。
5. 进行一次基础验证并记录结果。

## 验收标准
满足以下条件即视为完成：
- `src/dataSources/github-trending.js` 已删除。
- `src/dataFetchers.js` 不再 import 或注册 `project`。
- `wrangler.toml` 不再包含 `PROJECTS_API_URL`。
- 技术文档与 README 不再把 `project/项目` 视为当前有效分类。
- 全仓搜索以下关键字时，不再出现这条链路的直接残留：
  - `PROJECTS_API_URL`
  - `github-trending`
  - `GitHub Trending`
  - `YYYY-MM-DD-project`

## 验证方法
- 运行全仓搜索：
  - `grep -R "PROJECTS_API_URL\|github-trending\|GitHub Trending\|YYYY-MM-DD-project" -n .`
- 检查 `src/dataFetchers.js` 与 `wrangler.toml` 的最终状态。
- 抽查 `README.md`、`docs/DATA_FLOW.md`、`docs/KV_KEYS.md`、`docs/DEPLOYMENT.md`、`docs/API_ROUTES.md`，确认分类描述统一为：`news`、`paper`、`socialMedia`。
