# 此刻去哪 · AI Native 旅行路线助手

一个面向真实旅行执行场景的移动端 H5 原型。它不只生成行程，还会结合日期、当前位置、营业状态、预约、交通与体力变化，持续判断“下一站现在是否还能去”，并在调整前展示影响范围。

## 在线体验

- [打开在线体验](https://banqiu1230-byte.github.io/next-stop-travel-h5/)
- [查看 GitHub 源码](https://github.com/banqiu1230-byte/next-stop-travel-h5)

扫码在手机上打开：

![在线体验二维码](share/next-stop-travel-h5-qr.png)

![上海两日游路线总览](portfolio/shanghai-two-day/03-trip-overview.png)

## 核心体验

- 新用户从空白行程开始，创建后只展示自己的旅行
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

线上页面通过独立的服务端接口调用 DeepSeek 与高德地图，原体验链接和二维码保持不变。

- GitHub Actions variables：`VITE_AMAP_KEY`（公开的 JS API 标识）、`VITE_AMAP_SERVICE_HOST`、`VITE_API_BASE_URL`
- 服务端运行环境：`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`AMAP_KEY`、`AMAP_SECURITY_JS_CODE`、`ALLOWED_ORIGINS`
- DeepSeek 密钥和高德安全码保存在托管服务的加密配置中，不进入源码或浏览器构建产物。
- Pages 随 `main` 更新自动发布；服务端通过 Sites 发布，`npm run build:hosted` 构建对应产物。

接口包含请求体上限、超时、来源检查与基本限流；提供商不可用时保留明确的失败反馈。旅行数据目前保存在用户自己的浏览器中，不支持跨设备同步。

## 项目结构

- `src/`：React 交互与旅行状态模型
- `server/`：DeepSeek 路线规划代理与校验
- `audit/`：流程审计与可用性验证记录
- `portfolio/`：作品集展示截图
- `design/`：视觉方向稿

## 技术栈

React · Vite · 高德地图 JS API · DeepSeek API · GitHub Actions · GitHub Pages
