import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
const DASHBOARD_CSS = fs.readFileSync(path.join(ASSETS_DIR, "dashboard.css"), "utf8");
const DASHBOARD_JS = fs.readFileSync(path.join(ASSETS_DIR, "dashboard.js"), "utf8");

// Google OAuth 默认公共 Client凭证（动态解码）
const OAUTH_CID_ENC = "MTA3MTAwNjA2MDU5MS10bWhzc2luMmgyMWxjcmUyMzV2dG9sb2poNGc0MDNlcC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ==";
const OAUTH_SEC_ENC = "R09DU1BYLUs1OEZXUjQ4NkxkTExKMW1MQjhzWEM0ejZxREFm";
const DEFAULT_CLASH_PROXY = "http://127.0.0.1:7897";

function getOAuthCredentials() {
  return {
    clientId: Buffer.from(OAUTH_CID_ENC, "base64").toString("utf8"),
    clientSecret: Buffer.from(OAUTH_SEC_ENC, "base64").toString("utf8"),
  };
}

const SUMMARY_ENDPOINTS = [
  "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
  "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuotaSummary",
];

async function runCurl(url, method, headers, data, proxyUrl) {
  const args = ["-s", "-S", "-X", method, url];

  if (proxyUrl) {
    args.push("-x", proxyUrl);
  }

  for (const [k, v] of Object.entries(headers)) {
    args.push("-H", `${k}: ${v}`);
  }

  if (data) {
    args.push("-d", typeof data === "string" ? data : JSON.stringify(data));
  }

  const { stdout, stderr } = await execFileAsync("curl.exe", args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 20000,
  });

  if (!stdout && stderr) {
    throw new Error(`curl 请求失败: ${stderr}`);
  }

  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`响应非 JSON 格式: ${stdout?.slice(0, 200)}`);
  }
}

async function refreshAccessToken(refreshToken, proxyUrl) {
  const { clientId, clientSecret } = getOAuthCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken.trim(),
    grant_type: "refresh_token",
  });

  const res = await runCurl(
    "https://oauth2.googleapis.com/token",
    "POST",
    {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "antigravity",
    },
    params.toString(),
    proxyUrl
  );

  if (!res.access_token) {
    throw new Error(res.error_description || res.error || "刷新 Access Token 失败");
  }
  return res.access_token;
}

async function fetchQuotaSummary(refreshToken, proxyUrl) {
  if (!refreshToken?.trim()) {
    throw new Error("未检测到 Google Refresh Token，请在设置中配置");
  }

  const effectiveToken = await refreshAccessToken(refreshToken, proxyUrl);

  let summaryData = null;
  let lastError = null;

  for (const endpoint of SUMMARY_ENDPOINTS) {
    try {
      summaryData = await runCurl(
        endpoint,
        "POST",
        {
          "Authorization": `Bearer ${effectiveToken}`,
          "Content-Type": "application/json",
          "User-Agent": "antigravity",
        },
        {},
        proxyUrl
      );
      if (summaryData?.groups) break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!summaryData?.groups) {
    throw lastError || new Error("未能从 Google 接口获取到配额摘要");
  }

  // 过滤掉 Claude 和 GPT 等第三方模型分组，只保留 Gemini
  const filteredGroups = (summaryData.groups || []).filter((g) =>
    g.displayName?.toLowerCase().includes("gemini")
  );

  return {
    ok: true,
    ...summaryData,
    groups: filteredGroups,
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHtml(ctx, req) {
  const query = new URL(req.url).searchParams;
  const themeCss = query.get("hana-css");
  const themeTone = query.get("hana-theme") || "inherit";
  const themeLink = themeCss ? `<link rel="stylesheet" href="${escapeHtml(themeCss)}">` : "";

  return `<!doctype html>
<html lang="zh-CN" data-hana-theme="${escapeHtml(themeTone)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${themeLink}
  <style>${DASHBOARD_CSS}</style>
  <title>Gemini 配额监控</title>
</head>
<body>
  <script>window.parent.postMessage({source:"hana-plugin",type:"ready"},"*");</script>
  <div class="dashboard-container">
    
    <!-- 头部 -->
    <header class="header-bar">
      <div class="header-title-group">
        <div class="gemini-icon-box">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
        <div>
          <h1>Gemini 模型配额总览</h1>
          <p>实时监控 5 小时滑动窗口与周限额</p>
        </div>
      </div>
      <div class="header-actions">
        <div style="text-align: right; margin-right: 8px;">
          <div id="status-msg" style="font-size: 0.78rem; color: var(--g-text-secondary);">准备就绪</div>
          <div style="font-size: 0.72rem; color: var(--g-text-secondary);">最后同步: <span id="last-sync">--:--:--</span></div>
        </div>
        <button id="refresh-btn" class="btn btn-primary" type="button">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          立即刷新
        </button>
      </div>
    </header>

    <!-- 哈基米语录气泡 -->
    <div class="sister-speech-card">
      <div class="speech-avatar">🤖</div>
      <div id="speech-text" class="speech-content">正在同步实时状态...</div>
    </div>

    <!-- 配额组容器 -->
    <div id="groups-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div class="group-panel">
        <div class="empty-state">
          <p>正在同步 Google 官方配额数据...</p>
        </div>
      </div>
    </div>

    <!-- 底部说明 -->
    <div class="info-box">
      <svg class="info-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <div>
        <strong>配额计算规则：</strong> 所有 Gemini 模型（Gemini Flash、Gemini Pro 等）共享周限额与 5 小时限额。限额根据消耗的 Token 成本成比例扣减。5 小时限额用于平滑并发峰值，周限额则直接绑定于你的 Pro 订阅周期。
      </div>
    </div>

  </div>
  <script>${DASHBOARD_JS}</script>
</body>
</html>`;
}

export default function registerDashboardRoutes(app, ctx) {
  // 1. 页面 HTML
  app.get("/gemini-quota", (c) => c.html(renderHtml(ctx, c.req)));

  // 2. 聚合配额 API
  app.get("/gemini-quota/api/summary", async (c) => {
    const refreshToken = ctx.config?.get("refreshToken") || "";
    const proxyUrl = ctx.config?.get("proxyUrl") || DEFAULT_CLASH_PROXY;

    try {
      const data = await fetchQuotaSummary(refreshToken, proxyUrl);
      return c.json(data);
    } catch (err) {
      ctx.log.error(`[gemini-quota-dashboard] 配额获取失败: ${err.message}`);
      return c.json({
        ok: false,
        error: err.message,
      });
    }
  });
}
