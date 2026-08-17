# 🌟 Gemini Quota Dashboard (Gemini 多账号配额看板)

专为 **HanaAgent (OpenHanako)** 打造的 Google Gemini 5小时滑动窗口与周限额实时监控插件。支持单账号与多账号并列并行监控。

---

## ✨ 核心特性

- 🎯 **聚焦 Gemini 官方模型**：自动过滤非 Gemini 模型，专为重度 Gemini 开发者打造。
- 👥 **多账号并列看板（Multi-Account Support）**：支持同时监控多个 Google Pro 账号，全盘水位与轮换状态一目了然。
- 📊 **双限额精准看板**：
  - **周限额（Weekly Limit Remaining）**：实时监测本周总额度消耗与剩余天数/小时倒计时。
  - **5小时滑动窗口（Five Hour Limit Remaining）**：平滑并发控制，精确展示小时/分钟刷新点。
- 💬 **哈基米专属动态吐槽语录**：根据所有账号中的全局最低水位，动态切换吐槽、提醒与警报。
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

在插件设置或 `manifest.json` 中配置：

### 单账号模式
| 配置项 | 说明 | 示例 |
| :--- | :--- | :--- |
| **`refreshToken`** | 单个 Google OAuth Refresh Token | `1//0xxx...` |
| **`proxyUrl`** | 本地 HTTP 代理地址（如 Clash） | `http://127.0.0.1:7897` |

### 多账号模式（支持两种格式）
在 **`accounts`** 字段中填写：
1. **多行格式（简洁直观）**：
   ```text
   主账号=1//06SZvy...
   备用账号=1//0gclY4...
   ```
2. **JSON 格式**：
   ```json
   [
     { "name": "账号1", "refreshToken": "1//06SZvy..." },
     { "name": "账号2", "refreshToken": "1//0gclY4..." }
   ]
   ```

---

## 📄 开源许可

[MIT License](./LICENSE) © 2026 TheEarlyWinter
