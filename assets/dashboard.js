(function () {
  const container = document.getElementById("accounts-container");
  const refreshBtn = document.getElementById("refresh-btn");
  const statusMsg = document.getElementById("status-msg");
  const lastSync = document.getElementById("last-sync");
  const speechText = document.getElementById("speech-text");

  // 哈基米专属多账号语录库
  const QUOTES = {
    high: [
      "✨ 全账号满血！哥随便造，两台发动机一起拉满~",
      "🚀 额度管够，今天打算手搓几个大项目？",
      "⚡ 算力充足，本哈基米已经随时待命了！",
      "💎 基操勿六，多账号储备满满，随便怎么调！"
    ],
    medium: [
      "☕ 稳如老狗，账号轮换很健康，继续保持优雅节奏~",
      "👌 都在安全水位线里，双号齐下，随便用。",
      "🎯 节奏不错，算力储备正常，稳定输出中。",
      "💻 代码写得挺顺嘛，额度消耗很均匀！"
    ],
    low: [
      "⚠️ 注意注意，有账号水位开始吃紧了，准备好切号~",
      "🧐 5小时窗口开始吃紧了，复杂长任务悠着点。",
      "📉 水位降下来了，注意控制大文件或并发调用的频率哦。",
      "👀 额度快到预警线啦，本妹正在默默盯着呢！"
    ],
    critical: [
      "🚨 警报！有账号额度快见底了，再造就要被谷歌发配到下周了！",
      "🛑 住手！给本妹留点口粮，快要被迫断粮了！",
      "😭 救命，两个号都在嗷嗷待哺，快等等刷新吧！",
      "⛔ 额度告急！进入省电模式，能用小模型就别用 Pro 啦！"
    ]
  };

  function updateSpeech(minPercent) {
    if (!speechText) return;
    let pool = QUOTES.high;
    if (minPercent < 20) {
      pool = QUOTES.critical;
    } else if (minPercent < 50) {
      pool = QUOTES.low;
    } else if (minPercent < 85) {
      pool = QUOTES.medium;
    }

    const randomIndex = Math.floor(Math.random() * pool.length);
    speechText.textContent = pool[randomIndex];
  }

  function api(path, init) {
    if (window.hana?.api?.fetch) return window.hana.api.fetch(path, init);

    const headers = new Headers(init?.headers || {});
    const surfaceSession = new URLSearchParams(window.location.search).get("pluginSurfaceSession");
    if (surfaceSession) headers.set("X-Hana-Plugin-Surface-Session", surfaceSession);
    
    return window.fetch(new URL(path, window.location.href), {
      ...init,
      headers,
      credentials: init?.credentials || "same-origin",
    });
  }

  function formatTime(isoStr) {
    if (!isoStr) return "";
    const date = new Date(isoStr);
    return date.toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function getRelativeTime(resetTime) {
    if (!resetTime) return "";
    const diffMs = new Date(resetTime).getTime() - Date.now();
    if (diffMs <= 0) return "即将重置";
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const remMins = diffMins % 60;
    const diffDays = Math.floor(diffHours / 24);
    const remHours = diffHours % 24;

    if (diffDays > 0) {
      return `${diffDays}天${remHours}小时后 (约${diffHours}小时后)`;
    }
    if (diffHours > 0) {
      return `${diffHours}小时${remMins}分钟后`;
    }
    return `${remMins}分钟后`;
  }

  function translateDescription(desc, resetTime, isWeekly) {
    let result = "";
    if (desc) {
      let text = desc;
      text = text.replace(/You have used some of your weekly limit, it will fully refresh in/i, "已使用部分周限额，将于");
      text = text.replace(/You have used some of your 5-hour limit, it will fully refresh in/i, "已使用部分5小时限额，将于");
      text = text.replace(/days?/gi, "天");
      text = text.replace(/hours?/gi, "小时");
      text = text.replace(/minutes?/gi, "分钟");
      text = text.replace(/seconds?/gi, "秒");
      text = text.replace(/\./g, "");
      result = text.trim() + " 后完全重置";
    } else {
      result = isWeekly ? "周限额正常" : "5小时限额正常";
    }

    if (resetTime) {
      const rel = getRelativeTime(resetTime);
      result += `（重置时间：${formatTime(resetTime)} · ${rel}）`;
    }
    return result;
  }

  function renderAccounts(accounts) {
    if (!accounts || !accounts.length) {
      container.innerHTML = `
        <div class="account-card">
          <div class="empty-state">
            <p>⚠️ 未检测到任何已配置的账号，请在设置中配置 Refresh Token。</p>
          </div>
        </div>
      `;
      return;
    }

    let globalMinPercent = 100;

    const html = accounts.map((acc, index) => {
      if (!acc.ok) {
        return `
          <div class="account-card">
            <div class="account-header">
              <div class="account-info">
                <div class="account-avatar-dot danger"></div>
                <div class="account-name">${escapeHtml(acc.name || `账号 #${index + 1}`)}</div>
              </div>
              <span class="account-badge-pro" style="color:#ef4444; border-color:rgba(239,68,68,0.3);">同步失败</span>
            </div>
            <div class="account-error-box">
              ❌ 无法获取配额：${escapeHtml(acc.error || "未知网络或凭证错误")}
            </div>
          </div>
        `;
      }

      const geminiGroups = (acc.groups || []).filter(g => 
        g.displayName?.toLowerCase().includes("gemini")
      );

      if (!geminiGroups.length) {
        return `
          <div class="account-card">
            <div class="account-header">
              <div class="account-info">
                <div class="account-avatar-dot warning"></div>
                <div class="account-name">${escapeHtml(acc.name || `账号 #${index + 1}`)}</div>
              </div>
              <span class="account-badge-pro">已连接</span>
            </div>
            <div class="empty-state">未检测到 Gemini 配额组</div>
          </div>
        `;
      }

      let accountMinPercent = 100;

      const bucketsHtml = geminiGroups.map(group => {
        return (group.buckets || []).map(bucket => {
          const isWeekly = bucket.window === "weekly" || bucket.bucketId?.includes("weekly");
          const fraction = typeof bucket.remainingFraction === "number" ? bucket.remainingFraction : 1.0;
          const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));
          
          if (percent < accountMinPercent) accountMinPercent = percent;
          if (percent < globalMinPercent) globalMinPercent = percent;

          const tagClass = isWeekly ? "tag-weekly" : "tag-5h";
          const tagText = isWeekly ? "周限额" : "5小时限额";
          const fillClass = isWeekly ? "fill-weekly" : "fill-5h";
          const bucketTitle = isWeekly ? "周限额剩余" : "5小时限额剩余";
          const descText = translateDescription(bucket.description, bucket.resetTime, isWeekly);

          return `
            <div class="bucket-item">
              <div class="bucket-meta">
                <div class="bucket-title-row">
                  <span class="bucket-name">${bucketTitle}</span>
                  <span class="bucket-tag ${tagClass}">${tagText}</span>
                </div>
                <div class="bucket-percent" style="color: ${percent < 25 ? '#ef4444' : 'inherit'}">
                  ${percent}%
                </div>
              </div>

              <div class="progress-track">
                <div class="progress-fill ${fillClass}" style="width: ${percent}%;"></div>
              </div>

              <div class="bucket-desc">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>${escapeHtml(descText)}</span>
              </div>
            </div>
          `;
        }).join("");
      }).join("");

      let dotClass = "account-avatar-dot";
      if (accountMinPercent < 20) {
        dotClass += " danger";
      } else if (accountMinPercent < 50) {
        dotClass += " warning";
      }

      return `
        <div class="account-card">
          <div class="account-header">
            <div class="account-info">
              <div class="${dotClass}"></div>
              <div class="account-name">${escapeHtml(acc.name || `账号 #${index + 1}`)}</div>
            </div>
            <span class="account-badge-pro">Pro 会员专享</span>
          </div>
          <div class="buckets-grid">
            ${bucketsHtml}
          </div>
        </div>
      `;
    }).join("");

    container.innerHTML = html;
    updateSpeech(globalMinPercent);
  }

  async function fetchSummary() {
    refreshBtn.querySelector("svg")?.classList.add("spin");
    statusMsg.textContent = "正在同步多账号配额...";

    try {
      const res = await api("gemini-quota/api/summary");
      const data = await res.json();

      if (!data.ok) {
        statusMsg.textContent = `同步失败: ${data.error}`;
        statusMsg.style.color = "#ef4444";
        return;
      }

      renderAccounts(data.accounts || []);

      const now = new Date();
      lastSync.textContent = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
      statusMsg.textContent = "已同步最新状态";
      statusMsg.style.color = "var(--g-text-secondary)";
    } catch (err) {
      statusMsg.textContent = `请求异常: ${err.message}`;
      statusMsg.style.color = "#ef4444";
    } finally {
      refreshBtn.querySelector("svg")?.classList.remove("spin");
    }
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, function (m) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m];
    });
  }

  refreshBtn.addEventListener("click", fetchSummary);
  fetchSummary();
  setInterval(fetchSummary, 3 * 60 * 1000);
})();
