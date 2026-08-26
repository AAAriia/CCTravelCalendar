# 行程板 · 旅行计划安排

以**周视图日程表 + 日程库**为核心的旅行计划工具：把候选日程先入库，拖拽排期、拖边缘调时长、一键取消回库（预计日期自动回写为上次实际日期）。

**在线体验**：<https://aaariia.github.io/CCTravelCalendar/>（GitHub Pages 自动部署）

规则依据：[`docs/PRD.md`](docs/PRD.md) 与 [`docs/口径文档.md`](docs/口径文档.md)（字段 / 状态机 / 交互与计算口径的唯一规则源）。
交互原型见 [`docs/原型.html`](docs/原型.html)（单文件，可直接打开）。

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 周视图日程表 | 周一起始 7 天 × 00:00–24:00（30 分钟刻度），今日高亮，本周统计 |
| 日程卡片 | 类型色卡片；拖动改期、上下边缘拖拽调时长；点 × 取消（回库 + 预计日期回写） |
| 日程库 | 按类型 / 地点 / 预计日期三种分组，可折叠；拖入日程表排期；已放置置灰防重复 |
| 详情 | 预计日期与备注仅在详情可见；手动编辑日期时间（状态联动） |
| 多行程 | 行程新建 / 重命名 / 删除 / 切换；`#/plan/:id` 深链 |
| 删除与回收站 | 软删除 → 回收站恢复 / 彻底删除（删除 ≠ 取消） |
| 导入导出 | 全量 JSON 备份（合并 / 覆盖导入）、当前行程 CSV |
| 移动端 | <768px 自动切换：日期条 + 单日视图 + 底部抽屉日程库 + 点选放置 |

## 环境要求

- Node.js ≥ 20（仅开发与构建需要；使用时零依赖）

## 快速开始

```bash
npm install
npm run dev        # 开发：http://localhost:5173
```

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | Vite 开发服务器 |
| `npm run build` | 类型检查（vue-tsc）+ 生产构建 → `dist/` |
| `npm run preview` | 本地预览生产构建 |
| `npm run test` | Vitest 全量测试（单测 + 组件集成，含口径回归） |
| `npm run lint` | ESLint 检查 |

## 部署

推送到 `main` 分支即自动通过 GitHub Actions 构建（含测试门禁）并发布到 GitHub Pages。

构建产物为纯静态文件（相对路径 + hash 路由），任意静态托管可直接使用：

- GitHub Pages / Vercel / Netlify：上传 `dist/` 即可，无需服务端回退配置
- 本地使用：`npm run build` 后 `npx serve dist`，或直接托管 `dist/`

## 数据说明

- 数据以 JSON 存储于浏览器 **localStorage**（单键 `tp_app_v1`，带版本迁移），无需数据库
- 清浏览器缓存 / 换设备数据会丢：请用内置 **导出 JSON** 备份，**导入** 恢复
- 数据层为 `DataRepository` 抽象（`src/data/repository.ts`），未来可平滑替换为 IndexedDB 或后端 API
- 首次打开自动载入"杭州 3 日游"示例；右上角可一键重置

## 工程结构

```
src/
├── types/            # 领域模型（Schedule / Plan，与口径文档对齐）
├── constants/        # 六类枚举颜色、30 分钟刻度常量
├── utils/            # datetime 吸附钳制 / layout 重叠并排 / transfer 导入导出
├── data/             # Repository 抽象 + localStorage 实现 + 种子数据
├── stores/planner.ts # ★ Pinia：E1–E8 状态机 + 行程 + 派生状态（分组/统计）
├── composables/      # 拖拽系统（pointer）/ toast / 断点
├── components/       # 周视图、卡片、日程库、各类弹窗
└── views/PlannerView.vue  # 桌面 / 移动双布局组装
tests/                # 62 项测试：口径单测 + jsdom 指针事件集成测试
```

## 测试与质量

- **62 项测试**覆盖：E1–E8 全事件字段副作用、取消回写（多次取消取最近）、吸附/截断/钳制、三分组排序、重叠并排、导入合并、schema 迁移、UI 集成链路（点击开详情 / × 取消 / 拖拽改期 / 新建 / 回收站 / 移动端单日对齐）
- `vue-tsc` 严格类型检查 + ESLint（vue essential + typescript-eslint）
