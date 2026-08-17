# 🌟 Gemini Quota Dashboard (Gemini 配额看板)

专为 **HanaAgent (OpenHanako)** 打造的 Google Gemini 5小时滑动窗口与周限额实时监控插件。

---

## ✨ 核心特性

- 🎯 **聚焦 Gemini 官方模型**：自动过滤非 Gemini 模型，专为重度 Gemini 开发者打造。
- 📊 **双限额精准看板**：
  - **周限额（Weekly Limit Remaining）**：实时监测本周总额度消耗与剩余天数/小时倒计时。
  - **5小时滑动窗口（Five Hour Limit Remaining）**：平滑并发控制，精确展示小时/分钟刷新点。
- 💬 **哈基米专属动态吐槽语录**：根据当前实时剩余额度水位，动态切换吐槽与预警提醒。
- 🚀 **Clash / HTTP 代理无缝加速**：内置网络代理支持，稳定直连 Google CloudCode 端点。
- 🎨 **精美自适应设计**：完美适配 Hana 深色/浅色模式，与官方 UI 原生统一。

---

## 📦 安装方法

### 方式一：在 Hana 插件目录安装
将本仓库克隆或解压至 Hana 插件目录：
```bash
git clone https://github.com/TheEarlyWinter/gemini-quota-dashboard.git ~/.hanako/plugins/gemini-quota-dashboard
```

### 方式二：开发槽位安装
在 Hana 中通过 `plugin_dev_install` 安装：
```json
{
  "pluginId": "gemini-quota-dashboard",
  "sourcePath": "/path/to/gemini-quota-dashboard",
  "allowFullAccess": true
}
```

---

## ⚙️ 配置说明

在插件设置或 `manifest.json` 中配置你的 Google OAuth 凭证：

| 配置项 | 说明 | 默认值 |
| :--- | :--- | :--- |
| **`refreshToken`** | Google OAuth Refresh Token (推荐) | `""` |
| **`proxyUrl`** | 本地 HTTP 代理地址（例如 Clash） | `http://127.0.0.1:7897` |
| **`autoRefreshInterval`** | 自动刷新间隔（分钟） | `3` |

---

## 📄 开源许可

[MIT License](./LICENSE) © 2026 TheEarlyWinter
