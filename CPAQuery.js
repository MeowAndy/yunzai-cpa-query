import fetch from 'node-fetch';

// puppeteer 动态加载
let puppeteer;
try { puppeteer = await import('puppeteer'); } catch {
  try { puppeteer = (await import('../../node_modules/puppeteer/lib/cjs/puppeteer/puppeteer.js')); } catch { puppeteer = null; }
}

if (!global.segment) {
  (async () => {
    try { global.segment = (await import('icqq')).segment; } catch {
      try { global.segment = (await import('oicq')).segment; } catch {
        global.segment = { image: (url) => ({ type: 'image', url }), text: (text) => ({ type: 'text', text }) };
      }
    }
  })();
}
let segment = global.segment || { image: (url) => ({ type: 'image', url }), text: (text) => ({ type: 'text', text }) };

// ========== 配置区 ==========
// 多 CPA 实例配置，序号从 1 开始
// 不带序号的指令默认查询第 1 个 CPA
const CPA_LIST = [
  {
    name: "CPA-1",
    url: "",
    managementKey: "",
  },
  {
    name: "CPA-2",
    url: "",
    managementKey: "",
  },
  {
    name: "CPA-3",
    url: "",
    managementKey: "",
  },
];

const BOT_NAME = "菲比";
const QUERY_TIMEOUT = 15000;
const QUOTA_TIMEOUT = 10000;

// ========== Quota 获取配置 ==========
const QUOTA_URLS = {
  codex: {
    method: "GET",
    url: "https://chatgpt.com/backend-api/wham/usage",
    header: { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "User-Agent": "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal" }
  },
  claude: {
    method: "GET",
    url: "https://api.anthropic.com/api/oauth/usage",
    header: { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "anthropic-beta": "oauth-2025-04-20" }
  },
  kimi: {
    method: "GET",
    url: "https://api.kimi.com/coding/v1/usages",
    header: { Authorization: "Bearer $TOKEN$" }
  },
  "gemini-cli": {
    method: "POST",
    url: "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
    header: { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json" }
  },
  antigravity: {
    method: "POST",
    url: "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
    header: { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json" }
  }
};

export class CPAQuery extends plugin {
  constructor() {
    super({
      name: "CPA额度查询",
      dsc: "查询多个 CLIProxyAPI 实例的账号额度（图片版+进度条）",
      event: "message",
      priority: 50,
      rule: [
        { reg: "^#codex查询(\\d*)$", fnc: "queryCodex" },
        { reg: "^#claude查询(\\d*)$", fnc: "queryClaude" },
        { reg: "^#gemini查询(\\d*)$", fnc: "queryGemini" },
        { reg: "^#anti查询(\\d*)$", fnc: "queryAntigravity" },
        { reg: "^#kimi查询(\\d*)$", fnc: "queryKimi" },
        { reg: "^#cpa查询(\\d*)$", fnc: "queryAll" },
        { reg: "^#cpa列表$", fnc: "listCPA" },
        { reg: "^#cpa帮助$", fnc: "showHelp" },
      ]
    });
  }

  // 从消息中提取 CPA 序号（1-based），默认 1
  getCPAIndex(e) {
    const match = e.msg.match(/(\d+)$/);
    const idx = match ? parseInt(match[1]) : 1;
    if (idx < 1 || idx > CPA_LIST.length) return null;
    return idx - 1; // 转为 0-based
  }

  getCPA(e) {
    const idx = this.getCPAIndex(e);
    if (idx === null) {
      e.reply(`❌ 无效的 CPA 序号，当前共 ${CPA_LIST.length} 个 CPA 实例\n使用 #cpa列表 查看`);
      return null;
    }
    const cpa = CPA_LIST[idx];
    if (!cpa.url || !cpa.managementKey) {
      e.reply(`❌ CPA-${idx + 1} (${cpa.name}) 未配置地址或密钥`);
      return null;
    }
    return cpa;
  }

  async queryCodex(e) { return this.queryByType(e, "codex", "Codex"); }
  async queryClaude(e) { return this.queryByType(e, "claude", "Claude"); }
  async queryGemini(e) { return this.queryByType(e, ["gemini-cli", "gemini"], "Gemini"); }
  async queryAntigravity(e) { return this.queryByType(e, "antigravity", "Antigravity"); }
  async queryKimi(e) { return this.queryByType(e, "kimi", "Kimi"); }

  async queryAll(e) {
    if (!e.isMaster) return e.reply(`哼唧，这个是主人的专属查询哦~ 🙅‍♀️`);
    const cpa = this.getCPA(e);
    if (!cpa) return;

    const idx = this.getCPAIndex(e);
    await e.reply(`${BOT_NAME}正在查询 ${cpa.name} 全部账号额度… 📊`);

    const files = await this.fetchAuthFiles(cpa);
    if (!files) return e.reply("❌ 查询失败，请检查 CPA 配置");
    if (files.length === 0) return e.reply("📭 该 CPA 上没有任何账号");

    const groups = {};
    for (const f of files) {
      const type = (f.type || f.provider || "unknown").toLowerCase();
      if (!groups[type]) groups[type] = [];
      groups[type].push(f);
    }

    await this.fetchAllQuotas(cpa, files);
    const html = this.renderHTML(groups, cpa.name);
    return this.sendImageOrFallback(e, html, groups);
  }

  async queryByType(e, type, displayName) {
    if (!e.isMaster) return e.reply(`哼唧，这个是主人的专属查询哦~ 🙅‍♀️`);
    const cpa = this.getCPA(e);
    if (!cpa) return;

    await e.reply(`${BOT_NAME}正在查询 ${cpa.name} 的 ${displayName} 额度… 🔍`);

    const files = await this.fetchAuthFiles(cpa);
    if (!files) return e.reply("❌ 查询失败，请检查 CPA 配置");

    const types = Array.isArray(type) ? type : [type];
    const accounts = files.filter(f => {
      const t = (f.type || f.provider || "").toLowerCase();
      return types.some(ty => t === ty || t.includes(ty));
    });
    if (accounts.length === 0) return e.reply(`📭 ${cpa.name} 没有 ${displayName} 类型的账号`);

    await this.fetchAllQuotas(cpa, accounts);
    const groups = { [types[0]]: accounts };
    const html = this.renderHTML(groups, `${cpa.name} - ${displayName}`);
    return this.sendImageOrFallback(e, html, groups);
  }

  async listCPA(e) {
    if (!e.isMaster) return e.reply(`哼唧，这个是主人的专属查询哦~ 🙅‍♀️`);
    let lines = [`📋 CPA 实例列表（共 ${CPA_LIST.length} 个）\n`];
    CPA_LIST.forEach((cpa, i) => {
      const status = (cpa.url && cpa.managementKey) ? "✅" : "❌ 未配置";
      lines.push(`${i + 1}. ${cpa.name} ${status}`);
    });
    lines.push(`\n使用方法：#codex查询1 / #cpa查询2`);
    lines.push(`不带序号默认查询第 1 个`);
    await e.reply(lines.join('\n'));
    return true;
  }

  async showHelp(e) {
    await e.reply(`📊 CPA 额度查询帮助\n\n#codex查询[序号] - Codex 额度\n#claude查询[序号] - Claude 额度\n#gemini查询[序号] - Gemini 额度\n#anti查询[序号] - Antigravity 额度\n#kimi查询[序号] - Kimi 额度\n#cpa查询[序号] - 全部概览\n#cpa列表 - 查看所有 CPA 实例\n\n序号可选，不填默认第 1 个\n⚠️ 仅主人可用`);
    return true;
  }

  // ========== 额度获取 ==========
  async fetchAllQuotas(cpa, accounts) {
    const activeAccounts = accounts.filter(a => a.status === "active" && !a.disabled && a.auth_index);
    const results = await Promise.allSettled(
      activeAccounts.map(acc => this.fetchQuotaForAccount(cpa, acc))
    );
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) {
        activeAccounts[i]._quota = r.value;
      } else {
        activeAccounts[i]._quota = { error: r.reason?.message || "获取失败" };
      }
    });
  }

  async fetchQuotaForAccount(cpa, acc) {
    const type = (acc.type || "").toLowerCase();
    const config = QUOTA_URLS[type];
    if (!config) return null;

    const body = { authIndex: acc.auth_index, method: config.method, url: config.url, header: { ...config.header } };

    // Gemini/Antigravity 需要 project ID
    if ((type === "gemini-cli" || type === "antigravity") && acc.account) {
      const match = acc.account.match(/\(([^)]+)\)/);
      const project = match ? match[1] : acc.account;
      body.data = JSON.stringify({ project });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), QUOTA_TIMEOUT);
    try {
      const res = await fetch(`${cpa.url}/v0/management/api-call`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${cpa.managementKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const data = await res.json();
      if (data.status_code < 200 || data.status_code >= 300) return { error: `上游 ${data.status_code}` };
      const parsed = typeof data.body === "string" ? JSON.parse(data.body) : data.body;
      return this.parseQuota(type, parsed);
    } catch (err) {
      clearTimeout(timeout);
      return { error: err.name === "AbortError" ? "超时" : err.message };
    }
  }

  parseQuota(type, data) {
    if (type === "codex") {
      const rl = data?.rate_limit || {};
      const pw = rl.primary_window || {};
      const sw = rl.secondary_window || {};
      return {
        windows: [
          { label: "5小时额度", usedPercent: pw.used_percent ?? null, resetSeconds: pw.reset_after_seconds },
          { label: "周额度", usedPercent: sw.used_percent ?? null, resetSeconds: sw.reset_after_seconds }
        ],
        planType: data?.plan_type
      };
    }
    if (type === "claude") {
      const windows = [];
      if (data?.windows) {
        for (const w of (Array.isArray(data.windows) ? data.windows : Object.values(data.windows))) {
          const label = w.key === "five_hour" ? "5小时额度" : w.key === "seven_day" ? "7天额度" : (w.key || "额度");
          windows.push({ label, usedPercent: w.used_percent ?? null, resetSeconds: w.reset_after_seconds });
        }
      }
      if (data?.rate_limits) {
        for (const [key, val] of Object.entries(data.rate_limits)) {
          const label = key.includes("five_hour") ? "5小时额度" : key.includes("seven_day") ? "7天额度" : key;
          windows.push({ label, usedPercent: val.used_percent ?? null, resetSeconds: val.reset_after_seconds });
        }
      }
      return { windows, planType: data?.plan_type };
    }
    if (type === "kimi") {
      const windows = [];
      if (data?.limits && Array.isArray(data.limits)) {
        for (const lim of data.limits) {
          const used = lim.used ?? 0;
          const limit = lim.limit ?? 1;
          const usedPercent = limit > 0 ? Math.round((used / limit) * 100) : 0;
          const dur = lim.duration || "";
          const label = dur.includes("168h") || dur.includes("7d") ? "周额度" : dur.includes("24h") || dur.includes("1d") ? "日额度" : `${dur}额度`;
          windows.push({ label, usedPercent, remaining: lim.remaining });
        }
      } else if (data?.usage) {
        const u = data.usage;
        const usedPercent = u.limit > 0 ? Math.round((u.used / u.limit) * 100) : 0;
        windows.push({ label: "总额度", usedPercent, remaining: u.remaining });
      }
      return { windows };
    }
    if (type === "gemini-cli" || type === "antigravity") {
      const windows = [];
      const buckets = data?.quotaBuckets || data?.quota_buckets || [];
      for (const b of buckets) {
        const remaining = b.remainingFraction ?? b.remaining_fraction;
        if (remaining !== undefined) {
          const usedPercent = Math.round((1 - remaining) * 100);
          const model = b.model || b.modelId || "";
          windows.push({ label: model || "额度", usedPercent });
        }
      }
      return { windows };
    }
    return null;
  }

  // ========== API ==========
  async fetchAuthFiles(cpa) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT);
      const res = await fetch(`${cpa.url}/v0/management/auth-files`, {
        headers: { "Authorization": `Bearer ${cpa.managementKey}` },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const data = await res.json();
      return data.files || [];
    } catch { return null; }
  }

  // ========== 图片渲染 ==========
  async sendImageOrFallback(e, html, groups) {
    try {
      const imgBuffer = await this.htmlToImage(html);
      if (imgBuffer) {
        await e.reply(segment.image(`base64://${imgBuffer.toString('base64')}`));
        return true;
      }
    } catch (err) {
      console.error(`[CPA查询] 图片渲染失败: ${err.message}`);
    }
    // Fallback 文字
    const msgs = [];
    for (const [type, accounts] of Object.entries(groups)) {
      msgs.push(this.formatTypeText(type, accounts));
    }
    const fwd = await this.makeForwardMsg(e, msgs, "CPA 额度查询");
    if (fwd) await e.reply(fwd);
    else await e.reply(msgs.join('\n\n'));
    return true;
  }

  async htmlToImage(html) {
    if (!puppeteer) return null;
    let browser;
    try {
      const ppt = puppeteer.default || puppeteer;
      browser = await ppt.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        executablePath: this.findChromium()
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 800, height: 100 });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
      const body = await page.$('body');
      return await body.screenshot({ type: 'png' });
    } catch (err) {
      console.error(`[CPA查询] Puppeteer: ${err.message}`);
      return null;
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  findChromium() {
    const paths = ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
    for (const p of paths) { try { const fs = require('fs'); if (fs.existsSync(p)) return p; } catch {} }
    return undefined;
  }

  // ========== HTML 模板 ==========
  renderHTML(groups, title) {
    let total = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    let sections = '';
    for (const [type, accounts] of Object.entries(groups)) {
      total += accounts.length;
      for (const acc of accounts) {
        totalSuccess += acc.success || 0;
        totalFailed += acc.failed || 0;
      }
      sections += this.renderSection(type, accounts);
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${this.getCSS()}</style></head><body>
<div class="container">
  <div class="header"><h1>📊 ${title || 'CPA 额度查询'}</h1><p class="sub">共 ${total} 个账号 | ✅ ${totalSuccess} ✔️ | ❌ ${totalFailed} ✖️ | ${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p></div>
  ${sections}
</div></body></html>`;
  }

  renderSection(type, accounts) {
    const name = this.typeName(type);
    const active = accounts.filter(a => a.status === "active" && !a.disabled);
    let rows = '';
    for (const acc of accounts) {
      rows += this.renderAccountRow(acc);
    }
    return `<div class="section"><div class="sec-header"><h2>${name}</h2><span class="badge">${active.length}/${accounts.length} 可用</span></div>${rows}</div>`;
  }

  renderAccountRow(acc) {
    const isActive = acc.status === "active" && !acc.disabled;
    const cls = isActive ? 'active' : (acc.disabled ? 'disabled' : 'error');
    const icon = isActive ? '🟢' : (acc.disabled ? '⚫' : '🔴');
    const email = this.maskEmail(acc.email || acc.account || "未知");
    const plan = acc.id_token?.plan_type || acc._quota?.planType || '';
    const lastTime = this.fmtTime(acc.last_refresh || acc.updated_at || acc.created_at);

    // 账号级别错误信息（来自 CPA 的 status_message）
    let statusMsgHTML = '';
    if (acc.status_message) {
      const msg = this.extractErrorMsg(acc.status_message);
      statusMsgHTML = `<div class="status-err">❗ ${msg}</div>`;
    }

    let quotaHTML = '';
    if (acc._quota && !acc._quota.error && acc._quota.windows) {
      for (const w of acc._quota.windows) {
        if (w.usedPercent === null && w.usedPercent === undefined) continue;
        const remaining = Math.max(0, 100 - (w.usedPercent || 0));
        const barColor = remaining > 60 ? '#22c55e' : remaining > 30 ? '#eab308' : '#ef4444';
        const resetText = w.resetSeconds ? this.fmtDuration(w.resetSeconds) : '';
        quotaHTML += `<div class="quota-row">
          <div class="quota-label"><span>${w.label}</span><span class="quota-meta">${remaining}%${resetText ? ' | 重置: ' + resetText : ''}</span></div>
          <div class="quota-bar"><div class="quota-fill" style="width:${remaining}%;background:${barColor}"></div></div>
        </div>`;
      }
    } else if (acc._quota?.error) {
      quotaHTML = `<div class="quota-err">⚠️ ${acc._quota.error}</div>`;
    }

    return `<div class="row ${cls}">
      <div class="row-top"><span>${icon} ${email}</span>${plan ? `<span class="plan">${plan}</span>` : ''}</div>
      <div class="row-stats"><span class="s">✅${acc.success||0}</span><span class="f">❌${acc.failed||0}</span><span class="t">🕐${lastTime}</span></div>
      ${statusMsgHTML}
      ${quotaHTML}
    </div>`;
  }

  getCSS() {
    return `*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;padding:16px}
.container{max-width:760px;margin:0 auto}
.header{text-align:center;padding:14px;background:linear-gradient(135deg,#1e293b,#334155);border-radius:12px;border:1px solid #475569;margin-bottom:16px}
.header h1{font-size:20px}.sub{color:#94a3b8;font-size:12px;margin-top:4px}
.section{background:#1e293b;border-radius:12px;padding:14px;border:1px solid #334155;margin-bottom:12px}
.sec-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.sec-header h2{font-size:15px;color:#f1f5f9}
.badge{font-size:11px;padding:2px 8px;border-radius:6px;background:#166534;color:#86efac}
.row{padding:10px;margin-bottom:8px;border-radius:8px;background:#0f172a;border:1px solid #1e293b}
.row.active{border-left:3px solid #22c55e}.row.error{border-left:3px solid #ef4444}.row.disabled{border-left:3px solid #6b7280;opacity:.6}
.row-top{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:500;margin-bottom:4px}
.plan{font-size:10px;padding:1px 6px;border-radius:4px;background:#7c3aed;color:#e9d5ff}
.row-stats{display:flex;gap:10px;font-size:11px;color:#94a3b8;margin-bottom:6px}
.row-stats .s{color:#86efac}.row-stats .f{color:#fca5a5}
.quota-row{margin-bottom:5px}
.quota-label{display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:2px}
.quota-meta{color:#94a3b8;font-size:10px}
.quota-bar{background:#374151;border-radius:4px;height:8px;overflow:hidden}
.quota-fill{height:100%;border-radius:4px;transition:width .3s}
.quota-err{font-size:11px;color:#fbbf24;margin-top:2px}
.status-err{font-size:11px;color:#f87171;background:#7f1d1d33;border:1px solid #7f1d1d;border-radius:4px;padding:3px 6px;margin-bottom:4px;word-break:break-all}`;
  }

  // ========== 文字 Fallback ==========
  formatTypeText(type, accounts) {
    const name = this.typeName(type);
    const active = accounts.filter(a => a.status === "active" && !a.disabled);
    let lines = [`━━━ ${name} (${active.length}/${accounts.length} 可用) ━━━`];
    for (const acc of accounts) {
      const icon = (acc.status === "active" && !acc.disabled) ? "🟢" : "🔴";
      const email = this.maskEmail(acc.email || acc.account || "未知");
      const plan = acc.id_token?.plan_type ? ` [${acc.id_token.plan_type}]` : "";
      const lastTime = this.fmtTime(acc.last_refresh || acc.updated_at || acc.created_at);
      let line = `${icon} ${email}${plan}\n   ✅${acc.success||0} ❌${acc.failed||0} | 🕐 ${lastTime}`;

      if (acc._quota && !acc._quota.error && acc._quota.windows) {
        for (const w of acc._quota.windows) {
          if (w.usedPercent === null) continue;
          const remaining = Math.max(0, 100 - (w.usedPercent || 0));
          const bar = this.textBar(remaining);
          const reset = w.resetSeconds ? ` | 重置: ${this.fmtDuration(w.resetSeconds)}` : '';
          line += `\n   ${w.label}: ${bar} ${remaining}%${reset}`;
        }
      } else if (acc._quota?.error) {
        line += `\n   ⚠️ 额度: ${acc._quota.error}`;
      }
      if (acc.status_message) {
        line += `\n   ❗ ${this.extractErrorMsg(acc.status_message)}`;
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  textBar(percent) {
    const filled = Math.round(percent / 10);
    return '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + ']';
  }

  // ========== 工具方法 ==========
  typeName(type) {
    const map = { codex: "📦 Codex", claude: "🟣 Claude", "gemini-cli": "💎 Gemini", gemini: "💎 Gemini", antigravity: "🚀 Antigravity", kimi: "🌙 Kimi" };
    return map[type] || `📋 ${type}`;
  }

  maskEmail(email) {
    if (!email || !email.includes('@')) return (email || '').slice(0, 6) + '***';
    const [local, domain] = email.split('@');
    return (local.length <= 3 ? local : local.slice(0, 3)) + '***@' + domain;
  }

  extractErrorMsg(msg) {
    if (!msg) return '';
    try {
      const parsed = JSON.parse(msg);
      return (parsed?.error?.message || parsed?.message || msg).slice(0, 80);
    } catch {
      return msg.slice(0, 80);
    }
  }

  fmtTime(iso) {
    if (!iso) return "未知";
    try {
      const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
      if (diff < 1) return "刚刚";
      if (diff < 60) return `${diff}分钟前`;
      if (diff < 1440) return `${Math.floor(diff/60)}小时前`;
      return `${Math.floor(diff/1440)}天前`;
    } catch { return "未知"; }
  }

  fmtDuration(seconds) {
    if (!seconds || seconds <= 0) return "";
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.floor(seconds/60)}分钟`;
    if (seconds < 86400) return `${Math.floor(seconds/3600)}小时${Math.floor((seconds%3600)/60)}分`;
    return `${Math.floor(seconds/86400)}天${Math.floor((seconds%86400)/3600)}小时`;
  }

  async makeForwardMsg(e, msgList, title) {
    try {
      const botInfo = { nickname: BOT_NAME, user_id: e.self_id || e.bot?.uin || 10001 };
      const fwd = msgList.map(msg => ({ message: msg, nickname: botInfo.nickname, user_id: botInfo.user_id }));
      if (e.isGroup) return await e.group.makeForwardMsg(fwd);
      else if (e.friend) return await e.friend.makeForwardMsg(fwd);
    } catch {}
    return null;
  }
}
