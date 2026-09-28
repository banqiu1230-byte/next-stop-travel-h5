# DeepSeek 接入

当前路线规划会优先请求同源接口 `/api/ai/plan`。未配置 DeepSeek、请求失败或超时时，会自动回退到现有本地规则，创建旅行不会被阻断。

## 本地配置

把下面两行加入 `.env.local`，然后重启开发服务器：

```dotenv
DEEPSEEK_API_KEY=你的服务端密钥
DEEPSEEK_MODEL=deepseek-v4-flash
```

`DEEPSEEK_API_KEY` 没有 `VITE_` 前缀，因此不会进入 H5 打包产物。浏览器只请求本项目的服务端代理。

## 部署要求

生产部署需要让 `/api/ai/plan` 运行在 Node 服务或云函数中，并在服务端环境变量设置同样的两个值。`server/deepseek.mjs` 已包含输入限制、超时、结构化 JSON、地点 ID 白名单与本地回退所需的错误状态。
