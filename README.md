# 此刻去哪 · AI Native 旅行路线助手

一个面向真实旅行执行场景的移动端 H5 原型。它不只生成行程，还会结合日期、当前位置、营业状态、预约、交通与体力变化，持续判断“下一站现在是否还能去”，并在调整前展示影响范围。

![上海两日游路线总览](portfolio/shanghai-two-day/03-trip-overview.png)

## 核心体验

- 从目的地、日期、同行人与旅行偏好生成多套可比较路线
- 将 AI 推荐理由、来源与未知信息显式呈现，避免把推测写成事实
- 以“下一站”为核心组织当天执行，衔接实时路线、到达与停留状态
- 在天气、体力或时间变化后先预览调整，再由用户确认应用
- 用地图、时间轴、待确认任务和住宿建议连接完整旅行流程
- 支持已完成行程的只读回顾与路线版本恢复

## 本地运行

```bash
npm install
npm run dev -- --port 4173
```

访问 `http://localhost:4173/`。

## 验证

```bash
npm test
npm run build
```

## 可选服务配置

复制 `.env.example` 为 `.env` 后配置：

- `VITE_AMAP_KEY` 与 `VITE_AMAP_SECURITY_JS_CODE`：高德地图与路线
- `DEEPSEEK_API_KEY`：仅由本地 Vite 服务端代理读取，不进入浏览器构建产物

GitHub Pages 会在没有密钥时使用产品内置的降级体验。若需要在线地图，可在仓库 Actions secrets 中配置两个高德变量。

## 项目结构

- `src/`：React 交互与旅行状态模型
- `server/`：DeepSeek 路线规划代理与校验
- `audit/`：流程审计与可用性验证记录
- `portfolio/`：作品集展示截图
- `design/`：视觉方向稿

## 技术栈

React · Vite · 高德地图 JS API · DeepSeek API · GitHub Actions · GitHub Pages
