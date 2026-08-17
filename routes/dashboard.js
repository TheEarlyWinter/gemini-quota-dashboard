import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
const DASHBOARD_CSS = fs.readFileSync(path.join(ASSETS_DIR, "dashboard.css"), "utf8");
const DASHBOARD_JS = fs.readFileSync(path.join(ASSETS_DIR, "dashboard.js"), "utf8");

// 默认账号预设（留空，通过设置面板填写）
const DEFAULT_LOCAL_ACCOUNTS = [];

const OAUTH_CID_PARTS = ["MTA3MTAwNjA2MDU5MS10bWhzc2luMmgyMWxjcmUy", "MzV2dG9sb2poNGc0MDNlcC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ=="];
const OAUTH_SEC_PARTS = ["R09DU1BYLUs1OEZXUjQ4", "NkxkTEoxbUxCOHNYQzR6NnFEQWY="];
const DEFAULT_CLASH_PROXY = "http://127.0.0.1:7897";

function getOAuthCredentials() {
  return {
    clientId: Buffer.from(OAUTH_CID_PARTS.join(""), "base64").toString("utf8"),
    clientSecret: Buffer.from(OAUTH_SEC_PARTS.join(""), "base64").toString("utf8"),
  };
}

const SUMMARY_ENDPOINTS = [
  "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
  "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuotaSummary",
];

async function runCurl(url, method, headers, data, proxyUrl, maxRetries = 3) {
  const args = ["-s", "-S", "--http1.1", "--ssl-no-revoke", "-X", method, url];

  if (proxyUrl) {
    args.push("-x", proxyUrl);
  }

  for (const [k, v] of Object.entries(headers)) {
    args.push("-H", `${k}: ${v}`);
  }

  if (data) {
    args.push("-d", typeof data === "string" ? data : JSON.stringify(data));
  }

  let lastError = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { stdout, stderr } = await execFileAsync("curl.exe", args, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 15000,
      });

      if (!stdout && stderr) {
        throw new Error(`curl 请求失败: ${stderr}`);
      }

      try {
        return JSON.parse(stdout);
      } catch {
        throw new Error(`响应非 JSON 格式: ${stdout?.slice(0, 200)}`);
      }
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  throw lastError;
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

async function fetchSingleAccountQuota(refreshToken, proxyUrl) {
  if (!refreshToken?.trim()) {
    throw new Error("缺少有效的 Refresh Token");
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

  // 过滤掉非 Gemini 分组
  const filteredGroups = (summaryData.groups || []).filter((g) =>
    g.displayName?.toLowerCase().includes("gemini")
  );

  return filteredGroups;
}

function parseConfiguredAccounts(ctx) {
  const rawAccounts = ctx.config?.get("accounts");
  const singleToken = ctx.config?.get("refreshToken");

  const accounts = [];

  if (rawAccounts && typeof rawAccounts === "string") {
    const trimmed = rawAccounts.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item?.refreshToken) {
              accounts.push({
                name: item.name || "Google 账号",
                refreshToken: item.refreshToken,
              });
            }
          }
        }
      } catch (e) {
        ctx.log.warn(`[gemini-quota-dashboard] accounts JSON 解析失败: ${e.message}`);
      }
    } else {
      const lines = trimmed.split(/\r?\n/);
      for (const line of lines) {
        const l = line.trim();
        if (!l || l.startsWith("#")) continue;
        if (l.includes("=")) {
          const [name, token] = l.split("=", 2);
          if (token?.trim()) {
            accounts.push({ name: name.trim(), refreshToken: token.trim() });
          }
        } else if (l.startsWith("1//0")) {
          accounts.push({ name: `账号 #${accounts.length + 1}`, refreshToken: l });
        }
      }
    }
  }

  if (!accounts.length && singleToken?.trim()) {
    accounts.push({
      name: "主账号",
      refreshToken: singleToken.trim(),
    });
  }

  // 兜底本地默认账号
  if (!accounts.length) {
    return DEFAULT_LOCAL_ACCOUNTS;
  }

  return accounts;
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
          <h1>Gemini 模型多账号配额总览</h1>
          <p>实时监控各账号 5 小时滑动窗口与周限额</p>
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
      <div id="speech-text" class="speech-content">正在同步多账号实时状态...</div>
    </div>

    <!-- 多账号卡片容器 -->
    <div id="accounts-container" class="accounts-container">
      <div class="account-card">
        <div class="empty-state">
          <p>正在同步 Google 官方配额数据...</p>
        </div>
      </div>
    </div>

    <!-- 底部说明 -->
    <div class="info-box">
      <svg class="info-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <div>
        <strong>多账号调度与配额规则：</strong> 各 Google 账号独立计算周限额与 5 小时滑动窗口。通过多账号轮换可大幅提升总可用吞吐量，建议在任一账号 5 小时窗口吃紧时自动切换至备用账号。
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

  // 2. 多账号聚合配额 API
  app.get("/gemini-quota/api/summary", async (c) => {
    const proxyUrl = ctx.config?.get("proxyUrl") || DEFAULT_CLASH_PROXY;
    const accounts = parseConfiguredAccounts(ctx);

    if (!accounts.length) {
      return c.json({
        ok: false,
        error: "未配置任何 Google 账号，请在插件设置中配置 accounts 或 refreshToken",
        accounts: [],
      });
    }

    try {
      const results = await Promise.allSettled(
        accounts.map(async (acc) => {
          try {
            const groups = await fetchSingleAccountQuota(acc.refreshToken, proxyUrl);
            return {
              name: acc.name,
              ok: true,
              groups,
              error: null,
            };
          } catch (err) {
            return {
              name: acc.name,
              ok: false,
              groups: [],
              error: err.message,
            };
          }
        })
      );

      const accountsData = results.map((r, idx) => {
        if (r.status === "fulfilled") return r.value;
        return {
          name: accounts[idx].name,
          ok: false,
          groups: [],
          error: r.reason?.message || "请求失败",
        };
      });

      return c.json({
        ok: true,
        accounts: accountsData,
      });
    } catch (err) {
      ctx.log.error(`[gemini-quota-dashboard] 配额获取失败: ${err.message}`);
      return c.json({
        ok: false,
        error: err.message,
        accounts: [],
      });
    }
  });
}
