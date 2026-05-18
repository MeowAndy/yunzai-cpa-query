# 📊 Yunzai CPA 额度查询插件

> Yunzai-Bot 插件 - 查询 CLIProxyAPI 各类账号额度与状态（Codex/Claude/Gemini/Antigravity/Kimi）

## ✨ 功能

| 指令 | 说明 |
|------|------|
| `#codex查询` | 查询 Codex 账号状态 |
| `#claude查询` | 查询 Claude 账号状态 |
| `#gemini查询` | 查询 Gemini 账号状态 |
| `#anti查询` | 查询 Antigravity 账号状态 |
| `#kimi查询` | 查询 Kimi 账号状态 |
| `#cpa查询` | 查询全部账号概览 |
| `#cpa帮助` | 查看帮助 |

> ⚠️ 所有查询指令仅主人可用

## 📋 展示信息

- 🟢/🔴 账号在线状态
- 邮箱（自动脱敏：`abc***@hotmail.com`）
- 订阅类型（plus/pro 等）
- 成功/失败请求计数
- 最后刷新时间（相对时间）
- 异常状态消息

## 🚀 安装

```bash
# 在 Yunzai plugins 目录下
git clone https://github.com/MeowAndy/yunzai-cpa-query.git cpa-query
# 重启 Yunzai 即可
```

## ⚙️ 配置

编辑 `CPAQuery.js` 顶部配置区：

```javascript
const CPA_CONFIG = {
  // CPA 管理面板地址
  url: "http://你的CPA地址:8317",
  // 管理密钥（面板登录密码，明文）
  managementKey: "你的管理密钥",
};
```

## 🔒 隐私保护

- 邮箱/账号自动脱敏显示（只显示前3位 + `***`）
- token/密钥等敏感字段不会展示
- 仅主人可触发查询

## 📌 支持的 CPA 账号类型

- **Codex** - OpenAI Codex OAuth 账号
- **Claude** - Anthropic Claude OAuth 账号
- **Gemini** - Google Gemini CLI 账号
- **Antigravity** - Antigravity Credits 账号
- **Kimi** - Moonshot Kimi 账号
- **xAI** - xAI/Grok 账号

## 🔧 依赖

- `node-fetch`（Yunzai 通常已自带）

## 🐺 作者

**小凌虾** 开发
