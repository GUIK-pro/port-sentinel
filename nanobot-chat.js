/**
 * nanobot-chat.js — 东莞首靠船识别助手 · Nanobot 嵌入 SDK
 * --------------------------------------------------------
 * 直连 Nanobot 的 OpenAI 兼容 API：默认 http://127.0.0.1:8900/v1/chat/completions
 * 提供：
 *   1. NanobotChat.ask(question, opts)        弹出 chat 抽屉 + 流式回答
 *   2. NanobotChat.bindPalette(opts)          绑定已有 ⌘K 面板（输入框回车 + 建议问题点击）
 *   3. NanobotChat.injectFloatingButton(opts) 给没有 ⌘K 的页面注入右下角悬浮按钮
 *   4. NanobotChat.setContext(systemPrompt)   注入页面级 system prompt
 *
 * 用法（最简）：
 *   <script src="nanobot-chat.js" defer></script>
 *   <script>NanobotChat.bindPalette({input:'[x-ref="cmdkInput"]', closePalette:()=>{...}})</script>
 */
(function (global) {
  'use strict';

  // ============== 配置 ==============
  const CONFIG = {
    // 使用同源代理避免 CORS 问题（通过 server.py 转发到 Nanobot）
    BASE_URL: window.location.origin + '/v1',
    // Nanobot 的 OpenAI 兼容 API 需要显式指定 model
    MODEL: 'deepseek-chat',
    TIMEOUT_MS: 60000,
    PRODUCT: '东莞首靠船识别助手',
    BRAND: { naval: '#0a1f44', teal: '#00A896', slate: '#475569', red: '#dc2626', amber: '#d97706' },
  };

  let _systemPrompt = `你是「东莞首靠船识别助手 · Nanobot」，服务于广东海事局东莞局执法人员。
基于近 6 个月进出港计划库 + PSC/FSC 滞留 + 安检处罚 + 配员符合率四类数据源回答首靠船相关问题。
首靠比对字段：船名 + 船舶总吨 + 船长姓名 + 联系方式（任一未匹配视为首靠）。
回答风格：简洁、列点、数字优先；面对法规问题时务必引用条款编号。`;
  const _history = []; // {role, content}

  // ============== 样式注入 ==============
  function injectStyle() {
    if (document.getElementById('nb-chat-style')) return;
    const css = `
.nb-mask{position:fixed;inset:0;z-index:9990;background:rgba(7,14,30,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;transition:opacity .22s ease;pointer-events:none}
.nb-mask.show{opacity:1;pointer-events:auto}
.nb-drawer{position:fixed;right:24px;bottom:24px;top:auto;width:480px;max-width:calc(100vw - 32px);height:680px;max-height:calc(100vh - 48px);z-index:9991;background:#fff;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px -20px rgba(7,14,30,.4),0 0 0 1px rgba(15,23,42,.08);transform:translateY(16px);opacity:0;transition:transform .25s cubic-bezier(.2,.8,.2,1),opacity .22s ease;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",sans-serif}
.nb-drawer.show{transform:translateY(0);opacity:1;pointer-events:auto}
.nb-head{display:flex;align-items:center;gap:10px;padding:14px 18px;background:linear-gradient(180deg,#0a1f44 0%,#0f2a5e 100%);color:#fff;border-bottom:1px solid rgba(255,255,255,.08)}
.nb-head .nb-logo{width:30px;height:30px;border-radius:9px;background:#00A896;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.nb-head .nb-title{font-size:13.5px;font-weight:600;letter-spacing:.01em}
.nb-head .nb-sub{font-size:10.5px;color:rgba(255,255,255,.55);letter-spacing:.08em;font-family:"Geist Mono",ui-monospace,monospace;margin-top:2px}
.nb-head .nb-status{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:10.5px;color:rgba(255,255,255,.6);font-family:"Geist Mono",ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}
.nb-head .nb-dot{width:6px;height:6px;border-radius:50%;background:#00A896;box-shadow:0 0 8px #00A896}
.nb-head .nb-dot.off{background:#dc2626;box-shadow:0 0 8px #dc2626}
.nb-head .nb-close{margin-left:8px;width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06);cursor:pointer;transition:background .15s}
.nb-head .nb-close:hover{background:rgba(255,255,255,.16)}
.nb-body{flex:1;overflow-y:auto;padding:18px;background:#fafbfc;scroll-behavior:smooth}
.nb-body::-webkit-scrollbar{width:6px}
.nb-body::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
.nb-msg{margin-bottom:14px;display:flex;gap:10px;animation:nbFade .3s ease}
@keyframes nbFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.nb-msg .nb-avatar{width:28px;height:28px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#fff}
.nb-msg.user .nb-avatar{background:#475569}
.nb-msg.bot .nb-avatar{background:#00A896}
.nb-msg .nb-bubble{max-width:calc(100% - 38px);padding:10px 13px;border-radius:12px;font-size:13.5px;line-height:1.62;color:#0b1220;word-wrap:break-word;white-space:pre-wrap}
.nb-msg.user .nb-bubble{background:#fff;border:1px solid #e2e8f0}
.nb-msg.bot .nb-bubble{background:#fff;border:1px solid #e2e8f0;box-shadow:0 1px 2px rgba(7,14,30,.04)}
.nb-msg.system .nb-bubble{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:12.5px}
.nb-typing{display:inline-flex;gap:3px;align-items:center;height:1em;vertical-align:middle}
.nb-typing span{width:5px;height:5px;border-radius:50%;background:#00A896;animation:nbBounce 1.2s infinite ease-in-out}
.nb-typing span:nth-child(2){animation-delay:.15s}
.nb-typing span:nth-child(3){animation-delay:.3s}
@keyframes nbBounce{0%,80%,100%{transform:scale(.4);opacity:.4}40%{transform:scale(1);opacity:1}}
.nb-empty{padding:36px 16px;text-align:center;color:#64748b}
.nb-empty .nb-empty-ring{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#0a1f44,#00A896);margin:0 auto 14px;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 8px 24px -6px rgba(10,31,68,.4)}
.nb-empty .nb-empty-title{font-size:14.5px;font-weight:600;color:#0b1220;margin-bottom:4px}
.nb-empty .nb-empty-desc{font-size:12px;line-height:1.6;max-width:300px;margin:0 auto 16px}
.nb-quick{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.nb-quick button{padding:6px 12px;border-radius:99px;background:#fff;border:1px solid #e2e8f0;font-size:11.5px;color:#475569;cursor:pointer;transition:all .15s}
.nb-quick button:hover{border-color:#00A896;color:#0a1f44;background:#E6F7F4}
.nb-input-wrap{padding:12px 14px;border-top:1px solid #e2e8f0;background:#fff;display:flex;gap:8px;align-items:flex-end}
.nb-input{flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:13.5px;font-family:inherit;resize:none;outline:none;line-height:1.5;max-height:120px;color:#0b1220;background:#fafbfc;transition:border-color .15s,background .15s}
.nb-input:focus{border-color:#00A896;background:#fff}
.nb-send{width:38px;height:38px;border-radius:10px;background:#0a1f44;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;transition:background .15s;flex-shrink:0}
.nb-send:hover{background:#00A896}
.nb-send:disabled{background:#cbd5e1;cursor:not-allowed}
.nb-foot{padding:8px 14px;border-top:1px solid #f1f5f9;background:#fafbfc;font-size:10.5px;color:#94a3b8;font-family:"Geist Mono",ui-monospace,monospace;letter-spacing:.06em;text-align:center}
.nb-foot a{color:#475569;text-decoration:none}
.nb-fab{position:fixed;right:24px;bottom:24px;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#0a1f44,#00A896);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;z-index:9989;box-shadow:0 12px 28px -6px rgba(10,31,68,.45),0 0 0 1px rgba(255,255,255,.06) inset;transition:transform .2s ease,box-shadow .2s ease}
.nb-fab:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 18px 36px -6px rgba(10,31,68,.55),0 0 0 1px rgba(255,255,255,.08) inset}
.nb-fab .nb-fab-ping{position:absolute;inset:-2px;border-radius:50%;border:1.5px solid #00A896;opacity:.6;animation:nbPing 2s infinite}
@keyframes nbPing{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.35);opacity:0}}
@media (max-width:640px){.nb-drawer{right:8px;left:8px;bottom:8px;width:auto;height:calc(100vh - 16px)}}
`;
    const style = document.createElement('style');
    style.id = 'nb-chat-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============== DOM 构建 ==============
  let _drawer, _mask, _bodyEl, _inputEl, _sendBtn, _statusDot;
  let _busy = false;

  function buildDrawer() {
    if (_drawer) return;
    injectStyle();

    _mask = document.createElement('div');
    _mask.className = 'nb-mask';
    _mask.addEventListener('click', closeDrawer);

    _drawer = document.createElement('aside');
    _drawer.className = 'nb-drawer';
    _drawer.innerHTML = `
      <header class="nb-head">
        <div class="nb-logo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M8 13h.01M16 13h.01M9 17h6"/></svg>
        </div>
        <div>
          <div class="nb-title">${CONFIG.PRODUCT} · Nanobot</div>
          <div class="nb-sub">DG-MSA · LLM ASSISTANT</div>
        </div>
        <div class="nb-status">
          <span class="nb-dot" data-nb-dot></span>
          <span data-nb-status>ONLINE</span>
        </div>
        <div class="nb-close" data-nb-close title="关闭 (Esc)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </div>
      </header>
      <div class="nb-body" data-nb-body></div>
      <div class="nb-input-wrap">
        <textarea class="nb-input" data-nb-input rows="1" placeholder="问 Nanobot ··· Shift+↵ 换行 · ↵ 发送"></textarea>
        <button class="nb-send" data-nb-send title="发送 (↵)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
      </div>
      <div class="nb-foot">DONGGUAN MSA · ${CONFIG.BASE_URL.replace('http://', '')}</div>
    `;

    document.body.appendChild(_mask);
    document.body.appendChild(_drawer);

    _bodyEl = _drawer.querySelector('[data-nb-body]');
    _inputEl = _drawer.querySelector('[data-nb-input]');
    _sendBtn = _drawer.querySelector('[data-nb-send]');
    _statusDot = _drawer.querySelector('[data-nb-dot]');

    _drawer.querySelector('[data-nb-close]').addEventListener('click', closeDrawer);
    _sendBtn.addEventListener('click', () => submitInput());
    _inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitInput();
      }
    });
    _inputEl.addEventListener('input', () => {
      _inputEl.style.height = 'auto';
      _inputEl.style.height = Math.min(_inputEl.scrollHeight, 120) + 'px';
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _drawer.classList.contains('show')) closeDrawer();
    });

    renderEmpty();
  }

  function renderEmpty() {
    if (_history.length > 0) return;
    const samples = [
      '今天有哪些首靠船？',
      '虎门大桥下进港的船净空余量够吗？',
      '近三个月命中最多的规则是哪条？',
      '怎么上传进出港计划？',
    ];
    _bodyEl.innerHTML = `
      <div class="nb-empty">
        <div class="nb-empty-ring">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M8 13h.01M16 13h.01M9 17h6"/></svg>
        </div>
        <div class="nb-empty-title">${CONFIG.PRODUCT}</div>
        <div class="nb-empty-desc">基于近 6 个月进出港计划 + 规则库 + LLM，回答首靠船风险识别相关问题。</div>
        <div class="nb-quick">
          ${samples.map((q) => `<button data-nb-quick>${q}</button>`).join('')}
        </div>
      </div>`;
    _bodyEl.querySelectorAll('[data-nb-quick]').forEach((btn) => {
      btn.addEventListener('click', () => submitText(btn.textContent));
    });
  }

  // ============== 渲染消息 ==============
  function appendMsg(role, text) {
    if (_history.length === 0) _bodyEl.innerHTML = '';
    const el = document.createElement('div');
    el.className = `nb-msg ${role}`;
    const avatar = role === 'user' ? '我' : role === 'system' ? '!' : 'NB';
    el.innerHTML = `
      <div class="nb-avatar">${avatar}</div>
      <div class="nb-bubble" data-nb-bubble></div>`;
    el.querySelector('[data-nb-bubble]').textContent = text;
    _bodyEl.appendChild(el);
    _bodyEl.scrollTop = _bodyEl.scrollHeight;
    return el.querySelector('[data-nb-bubble]');
  }

  function appendTyping() {
    const el = document.createElement('div');
    el.className = 'nb-msg bot';
    el.innerHTML = `
      <div class="nb-avatar">NB</div>
      <div class="nb-bubble"><span class="nb-typing"><span></span><span></span><span></span></span></div>`;
    _bodyEl.appendChild(el);
    _bodyEl.scrollTop = _bodyEl.scrollHeight;
    return el;
  }

  // ============== API 调用（流式 SSE） ==============
  async function streamChat(userText, onDelta) {
    // Nanobot 只支持单条 user 消息，将 system prompt + 历史 + 用户输入合并为一条
    let combinedContent = '';
    if (_systemPrompt) {
      combinedContent += `[系统指令] ${_systemPrompt}\n\n`;
    }
    if (_history.length > 0) {
      combinedContent += '[对话历史]\n';
      _history.forEach((m) => {
        const label = m.role === 'user' ? '用户' : '助手';
        combinedContent += `${label}: ${m.content}\n`;
      });
      combinedContent += '\n';
    }
    combinedContent += userText;

    const messages = [
      { role: 'user', content: combinedContent },
    ];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT_MS);
    try {
      const resp = await fetch(`${CONFIG.BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: CONFIG.MODEL, messages, stream: true }),
        signal: ctrl.signal,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let full = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const data = t.slice(5).trim();
          if (data === '[DONE]') return full;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              full += delta;
              onDelta(full);
            }
          } catch (_) { /* keep-alive 行忽略 */ }
        }
      }
      return full;
    } finally {
      clearTimeout(timer);
    }
  }

  // ============== 提交 ==============
  function submitInput() {
    const v = _inputEl.value.trim();
    if (!v) return;
    _inputEl.value = '';
    _inputEl.style.height = 'auto';
    submitText(v);
  }

  async function submitText(text) {
    if (_busy) return;
    _busy = true;
    _sendBtn.disabled = true;

    appendMsg('user', text);
    _history.push({ role: 'user', content: text });
    const typing = appendTyping();
    const bubble = typing.querySelector('.nb-bubble');

    try {
      _statusDot.classList.remove('off');
      const reply = await streamChat(text, (full) => {
        bubble.textContent = full;
        _bodyEl.scrollTop = _bodyEl.scrollHeight;
      });
      if (!reply) bubble.textContent = '（无响应内容）';
      _history.push({ role: 'assistant', content: reply || '' });
    } catch (e) {
      _statusDot.classList.add('off');
      typing.remove();
      const tip =
        `⚠️ 连接 Nanobot 失败：${e.message || e}\n\n` +
        `请确认：\n` +
        `① 已在本机运行  nanobot serve  （默认监听 ${CONFIG.BASE_URL.replace('/v1', '')}）\n` +
        `② 浏览器允许访问 ${CONFIG.BASE_URL}（如有 CORS 问题，需在 Nanobot 配置中启用本地白名单）\n` +
        `③ 防火墙未拦截 8900 端口\n\n` +
        `💡 尚未配置？请打开：nanobot-config.html 进行大模型配置向导`;
      appendMsg('system', tip);
    } finally {
      _busy = false;
      _sendBtn.disabled = false;
      _inputEl.focus();
    }
  }

  // ============== 抽屉控制 ==============
  function openDrawer() {
    buildDrawer();
    _mask.classList.add('show');
    _drawer.classList.add('show');
    setTimeout(() => _inputEl && _inputEl.focus(), 220);
  }
  function closeDrawer() {
    if (!_drawer) return;
    _mask.classList.remove('show');
    _drawer.classList.remove('show');
  }

  // ============== 公共 API ==============
  const NanobotChat = {
    config: CONFIG,
    setContext(prompt) { if (typeof prompt === 'string') _systemPrompt = prompt; },
    appendContext(extra) { if (typeof extra === 'string') _systemPrompt += '\n\n' + extra; },
    open() { openDrawer(); },
    close() { closeDrawer(); },
    clear() { _history.length = 0; if (_bodyEl) renderEmpty(); },
    ask(question, opts = {}) {
      buildDrawer();
      openDrawer();
      if (opts.closePalette && typeof opts.closePalette === 'function') {
        try { opts.closePalette(); } catch (_) {}
      }
      const q = (question || '').trim();
      if (q) submitText(q);
    },
    /**
     * 绑定已有 ⌘K 面板：输入框回车 + 建议问题点击都会触发 ask
     * opts.input         CSS 选择器或元素（必填）
     * opts.suggestions   建议问题按钮的选择器（可选）
     * opts.closePalette  关闭 ⌘K 面板的回调（可选）
     */
    bindPalette(opts = {}) {
      const ready = () => {
        const inputEl = typeof opts.input === 'string' ? document.querySelector(opts.input) : opts.input;
        if (inputEl && !inputEl.dataset.nbBound) {
          inputEl.dataset.nbBound = '1';
          inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              const v = inputEl.value && inputEl.value.trim();
              if (v) {
                e.preventDefault();
                NanobotChat.ask(v, { closePalette: opts.closePalette });
                inputEl.value = '';
              }
            }
          });
        }
        if (opts.suggestions) {
          const root = document;
          root.querySelectorAll(opts.suggestions).forEach((btn) => {
            if (btn.dataset.nbBound) return;
            btn.dataset.nbBound = '1';
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              const txt = (btn.dataset.nbAsk || btn.textContent || '').trim();
              if (txt) NanobotChat.ask(txt, { closePalette: opts.closePalette });
            });
          });
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(ready, 50));
      } else {
        setTimeout(ready, 50);
      }
      // 监听 DOM 后续更新（如建议问题动态渲染），3s 后自动断开避免内存泄漏
      const mo = new MutationObserver(ready);
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { try { mo.disconnect(); } catch(_){} }, 3000);
    },
    /**
     * 给没有 ⌘K 的页面注入右下角悬浮按钮
     */
    injectFloatingButton(opts = {}) {
      const ready = () => {
        if (document.querySelector('.nb-fab')) return;
        injectStyle();
        const btn = document.createElement('button');
        btn.className = 'nb-fab';
        btn.title = '问 Nanobot · Cmd/Ctrl+K';
        btn.innerHTML = `
          <span class="nb-fab-ping"></span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M8 13h.01M16 13h.01M9 17h6"/></svg>`;
        btn.addEventListener('click', () => openDrawer());
        document.body.appendChild(btn);
        document.addEventListener('keydown', (e) => {
          if ((e.metaKey || e.ctrlKey) && (e.key || '').toLowerCase() === 'k') {
            e.preventDefault();
            openDrawer();
          }
        });
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ready);
      } else {
        ready();
      }
    },
  };

  global.NanobotChat = NanobotChat;
})(window);
