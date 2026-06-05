# Nanobot 本地部署指引（东莞首靠船识别系统）

> 适用版本：nanobot-ai v0.1.5+  
> 前端对接地址：`http://127.0.0.1:8900/v1/chat/completions`

---

## 一、环境要求

| 项目 | 最低要求 |
|------|---------|
| Python | ≥ 3.11（推荐 3.12） |
| 操作系统 | Windows 10+、Linux、macOS |
| 内存 | ≥ 2GB 可用内存 |
| 网络 | 需访问 LLM 提供商 API（或本地 Ollama） |

> **Windows 用户**：v0.1.5.post2 起已正式支持 Windows + Python 3.14。

---

## 二、安装方式

### 方式 A：pip 安装（推荐 / 快速）

```bash
# 1. 安装 nanobot（含 API 服务依赖）
pip install "nanobot-ai[api]"

# 2. 首次初始化配置
nanobot onboard

# 3. 启动 OpenAI 兼容 API 服务（默认 127.0.0.1:8900）
nanobot serve
```

### 方式 B：源码安装（开发 / 最新功能）

```bash
git clone https://github.com/HKUDS/nanobot.git
cd nanobot
pip install -e ".[api]"

nanobot onboard
nanobot serve
```

### 方式 C：Docker 部署（生产环境）

```bash
cd nanobot-main

# 首次初始化
docker compose run --rm nanobot-cli onboard

# 编辑配置
notepad %USERPROFILE%\.nanobot\config.json

# 启动 API 服务（端口 8900）
docker compose up -d nanobot-api

# 查看日志
docker compose logs -f nanobot-api

# 停止
docker compose down
```

> Docker 容器以非 root 用户 `nanobot`（UID 1000）运行。  
> 配置目录挂载路径：`~/.nanobot → /home/nanobot/.nanobot`

---

## 三、配置 LLM 提供商

编辑 `~/.nanobot/config.json`（Windows 下为 `%USERPROFILE%\.nanobot\config.json`）：

### 选项 1：使用 DeepSeek（国内推荐，低延迟）

```json
{
  "providers": {
    "deepseek": {
      "apiKey": "sk-xxxxxxxxxxxxxxxx"
    }
  },
  "agents": {
    "defaults": {
      "provider": "deepseek",
      "model": "deepseek-chat"
    }
  }
}
```

> 获取 API Key：https://platform.deepseek.com

### 选项 2：使用通义千问（阿里云百炼）

```json
{
  "providers": {
    "dashscope": {
      "apiKey": "sk-xxxxxxxxxxxxxxxx",
      "apiBase": "https://dashscope.aliyuncs.com/compatible-mode/v1"
    }
  },
  "agents": {
    "defaults": {
      "provider": "dashscope",
      "model": "qwen-max"
    }
  }
}
```

> 获取 API Key：https://dashscope.console.aliyun.com

### 选项 3：使用本地 Ollama（完全离线）

```bash
# 先安装 Ollama 并拉取模型
ollama pull qwen2.5:14b
```

```json
{
  "providers": {
    "ollama": {}
  },
  "agents": {
    "defaults": {
      "provider": "ollama",
      "model": "qwen2.5:14b"
    }
  }
}
```

> Ollama 默认地址 `http://localhost:11434`，无需 API Key。  
> 模型推荐：`qwen2.5:14b`（中文能力强，海事领域表现好）

### 选项 4：使用 OpenRouter（海外多模型聚合）

```json
{
  "providers": {
    "openrouter": {
      "apiKey": "sk-or-v1-xxx"
    }
  },
  "agents": {
    "defaults": {
      "provider": "openrouter",
      "model": "anthropic/claude-opus-4-6"
    }
  }
}
```

---

## 四、启动 API 服务

```bash
# 默认绑定 127.0.0.1:8900
nanobot serve

# 指定地址和工作目录
nanobot serve --host 0.0.0.0 --port 8900 -w ~/.nanobot/api-workspace
```

启动成功后，终端输出类似：

```
INFO     API server listening on http://127.0.0.1:8900
```

---

## 五、验证连通性

### 5.1 健康检查

```bash
curl http://127.0.0.1:8900/health
```

预期返回：`{"status":"ok"}`

### 5.2 查看模型

```bash
curl http://127.0.0.1:8900/v1/models
```

### 5.3 发送测试消息

```bash
curl http://127.0.0.1:8900/v1/chat/completions -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"你好，我是东莞海事局执法人员\"}]}"
```

预期返回包含 `choices[0].message.content` 的 JSON 响应。

### 5.4 流式测试（与前端一致）

```bash
curl http://127.0.0.1:8900/v1/chat/completions -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"测试\"}],\"stream\":true}"
```

预期返回 SSE 格式数据流，以 `data: [DONE]` 结束。

---

## 六、前端对接确认

前端 `nanobot-chat.js` 中的配置已指向本地 API：

```javascript
const CONFIG = {
  BASE_URL: 'http://127.0.0.1:8900/v1',
  MODEL: 'nanobot',
  TIMEOUT_MS: 60000,
};
```

对接要点：
- `MODEL` 字段可传任意值，Nanobot API 会忽略并使用 config.json 中配置的模型
- 支持 `stream: true` 流式输出（SSE）
- 支持 `session_id` 会话隔离（不同船舶使用不同 session）

---

## 七、系统提示词配置

首靠船风险报告页已内置 system prompt 注入逻辑：

```
你是「东莞首靠船识别助手 · Nanobot」，服务于广东海事局东莞局执法人员。
基于近 6 个月进出港计划库 + PSC/FSC 滞留 + 安检处罚 + 配员符合率四类数据源
回答首靠船相关问题。
```

如需全局调整人格，可在 `~/.nanobot/config.json` 中添加：

```json
{
  "agents": {
    "defaults": {
      "systemPrompt": "你是东莞首靠船智能识别助手，专注海事安全监管..."
    }
  }
}
```

---

## 八、离线 / 网络不通时的降级方案

| 场景 | 方案 |
|------|------|
| 无外网但有 GPU | 部署 Ollama + qwen2.5:14b 本地模型 |
| 无外网无 GPU | 部署 Ollama + qwen2.5:3b（CPU 推理，较慢） |
| API 暂时不可用 | 前端自动显示"服务不可用"提示，规则引擎评分仍可用 |
| 局域网多人使用 | `nanobot serve --host 0.0.0.0` 对局域网开放 |

### Ollama 离线部署步骤（Windows）

```powershell
# 1. 下载 Ollama 安装包（提前拷贝到内网机器）
#    https://ollama.com/download/windows

# 2. 安装后拉取模型（需一次性联网或拷贝模型文件）
ollama pull qwen2.5:14b

# 3. Ollama 默认监听 localhost:11434，Nanobot 自动连接

# 4. 配置 Nanobot 使用 Ollama
# 编辑 %USERPROFILE%\.nanobot\config.json，参考上方"选项 3"

# 5. 启动 Nanobot API
nanobot serve
```

---

## 九、常见问题

### Q1: 端口 8900 被占用？

```bash
# Windows 查找占用进程
netstat -ano | findstr :8900

# 或修改端口
nanobot serve --port 9000
```

然后同步修改 `nanobot-chat.js` 中的 `BASE_URL`。

### Q2: 返回 "Connection refused"？

确认 `nanobot serve` 进程正在运行。可用任务管理器或：

```bash
curl http://127.0.0.1:8900/health
```

### Q3: 模型响应慢？

- 检查 LLM 提供商网络延迟
- 本地 Ollama 方案需要 GPU（推荐 ≥ 8GB 显存）
- 减小上下文长度（风险报告页已控制在合理范围内）

### Q4: 如何同时运行 Gateway 和 API？

```bash
# 终端 1：启动 API 服务
nanobot serve

# 终端 2：启动 Gateway（如需 WebUI 或 Channel 集成）
nanobot gateway
```

Docker 方式可一次启动两者：
```bash
docker compose up -d nanobot-api nanobot-gateway
```

---

## 十、推荐生产部署架构

```
┌──────────────────────────────────────────────┐
│           东莞海事局内网 / 局域网              │
│                                              │
│  ┌────────────┐     ┌──────────────────┐    │
│  │  浏览器     │────▶│  Nanobot API     │    │
│  │（前端页面）  │:8900│  nanobot serve   │    │
│  └────────────┘     └───────┬──────────┘    │
│                             │               │
│                     ┌───────▼──────────┐    │
│                     │  LLM Provider    │    │
│                     │  (DeepSeek /     │    │
│                     │   Ollama 本地)    │    │
│                     └──────────────────┘    │
└──────────────────────────────────────────────┘
```

---

## 快速启动清单（一键复制）

```powershell
# Windows PowerShell 快速部署
pip install "nanobot-ai[api]"
nanobot onboard
# 配置完 config.json 后：
nanobot serve
```

部署完成后，打开浏览器访问 `首靠船风险报告.html`，点击「🤖 Nanobot 生成报告」即可验证对接成功。
