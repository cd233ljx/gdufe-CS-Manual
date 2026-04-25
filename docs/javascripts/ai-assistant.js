/**
 * 站点侧栏 AI 助手（对接自建 API）
 * 配置由 overrides/main.html 从 mkdocs.yml extra.gdufe_ai 注入到 window.__GDUFE_AI__
 *
 * external_chat：POST { message } 或 { message, stream: true }，头 X-API-Key；JSON { success, answer } 或 SSE
 */
(function () {
  var CFG = window.__GDUFE_AI__ || {};
  var STORAGE_KEY = "gdufe-ai-open";
  var SESSION_MSG = "gdufe-ai-messages";

  /* ── helpers ─────────────────────────────────── */

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "className") n.className = attrs[k];
        else if (k === "textContent") n.textContent = attrs[k];
        else if (k === "innerHTML") n.innerHTML = attrs[k];
        else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function")
          n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else n.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) n.appendChild(c);
    });
    return n;
  }

  /* ── lightweight Markdown → HTML ─────────────── */

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderMarkdown(text) {
    if (!text) return "";
    var html = escapeHtml(text);

    // fenced code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      return (
        '<div class="gdufe-ai__code-wrap">' +
        '<div class="gdufe-ai__code-header">' +
        '<span class="gdufe-ai__code-lang">' +
        (lang || "code") +
        "</span>" +
        '<button class="gdufe-ai__copy-btn" type="button" title="复制代码">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
        "<span>复制</span>" +
        "</button>" +
        "</div>" +
        '<pre class="gdufe-ai__pre"><code>' +
        code.trimEnd() +
        "</code></pre>" +
        "</div>"
      );
    });

    // inline code
    html = html.replace(/`([^`\n]+)`/g, '<code class="gdufe-ai__inline-code">$1</code>');

    // bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // italic
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");

    // links
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // unordered list
    html = html.replace(
      /^(\s*)[-*] (.+)$/gm,
      '$1<li>$2</li>'
    );
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

    // ordered list
    html = html.replace(
      /^(\s*)\d+\. (.+)$/gm,
      '$1<li>$2</li>'
    );

    // paragraphs (double newline)
    html = html.replace(/\n{2,}/g, "</p><p>");
    // single newline → <br>
    html = html.replace(/\n/g, "<br>");

    html = "<p>" + html + "</p>";
    html = html.replace(/<p><\/p>/g, "");
    // clean up code blocks wrapped in <p>
    html = html.replace(/<p>(<div class="gdufe-ai__code-wrap">)/g, "$1");
    html = html.replace(/(<\/div>)<\/p>/g, "$1");
    html = html.replace(/<p>(<ul>)/g, "$1");
    html = html.replace(/(<\/ul>)<\/p>/g, "$1");

    return html;
  }

  /* ── page context ────────────────────────────── */

  function getPageContext() {
    var title = document.title || "";
    var path = (location && location.pathname) || "";
    var h1 = document.querySelector(".md-content h1");
    if (h1 && h1.textContent) title = h1.textContent.trim();
    return "当前页面标题：" + title + "\n页面路径：" + path;
  }

  /* ── API reply parsers ───────────────────────── */

  function parseReply(data) {
    if (data == null) return "";
    if (typeof data !== "object") return String(data);
    if (data.success === false) {
      if (typeof data.error === "string" && data.error) return data.error;
      if (typeof data.message === "string" && data.message) return data.message;
      return "请求未成功";
    }
    if (typeof data.answer === "string") return data.answer;
    if (data.choices && data.choices[0] && data.choices[0].message)
      return data.choices[0].message.content || "";
    if (data.message && typeof data.message === "string") return data.message;
    if (data.reply) return String(data.reply);
    if (data.content) return String(data.content);
    if (data.data && typeof data.data === "string") return data.data;
    try {
      return JSON.stringify(data);
    } catch (e) {
      return "";
    }
  }

  function extractStreamDelta(obj) {
    if (obj == null) return "";
    if (typeof obj === "string") return obj;
    if (typeof obj !== "object") return String(obj);
    if (typeof obj.answer === "string") return obj.answer;
    if (typeof obj.content === "string") return obj.content;
    if (obj.delta && typeof obj.delta.content === "string") return obj.delta.content;
    if (obj.choices && obj.choices[0] && obj.choices[0].delta) {
      var d = obj.choices[0].delta;
      if (typeof d.content === "string") return d.content;
    }
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.token === "string") return obj.token;
    if (obj.message && typeof obj.message === "string") return obj.message;
    return "";
  }

  /* ── session storage ─────────────────────────── */

  function loadMessages() {
    try {
      var raw = sessionStorage.getItem(SESSION_MSG);
      if (!raw) return [];
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (e) {
      return [];
    }
  }

  function saveMessages(messages) {
    try {
      sessionStorage.setItem(SESSION_MSG, JSON.stringify(messages));
    } catch (e) {}
  }

  /* ── request builders ────────────────────────── */

  function buildApiMessages(history, latestUserText) {
    var out = [];
    if (CFG.systemPrompt && String(CFG.systemPrompt).trim())
      out.push({ role: "system", content: String(CFG.systemPrompt).trim() });
    history.forEach(function (m) {
      if (m.role === "user" || m.role === "assistant")
        out.push({ role: m.role, content: m.content });
    });
    var last = latestUserText;
    if (CFG.includePageContext)
      last = latestUserText + "\n\n---\n【页面上下文】\n" + getPageContext();
    out.push({ role: "user", content: last });
    return out;
  }

  function buildRequestBody(apiMessages) {
    var mode = CFG.requestMode || "openai_messages";
    if (mode === "simple") {
      var last = apiMessages
        .filter(function (m) {
          return m.role === "user";
        })
        .pop();
      return {
        message: last ? last.content : "",
        history: apiMessages.filter(function (m) {
          return m.role !== "system";
        }),
      };
    }
    var body = { messages: apiMessages };
    if (CFG.model) body.model = CFG.model;
    return body;
  }

  function buildExternalMessage(historyBefore, latestUserText) {
    var parts = [];
    if (CFG.systemPrompt && String(CFG.systemPrompt).trim())
      parts.push("【系统说明】\n" + String(CFG.systemPrompt).trim());
    if (CFG.includeHistoryInMessage !== false && historyBefore.length) {
      var lines = [];
      historyBefore.forEach(function (m) {
        if (m.role === "user") lines.push("用户：" + m.content);
        else if (m.role === "assistant") lines.push("助手：" + m.content);
      });
      parts.push("【对话历史】\n" + lines.join("\n"));
    }
    var userMsg = latestUserText;
    if (CFG.includePageContext)
      userMsg = userMsg + "\n\n---\n【页面上下文】\n" + getPageContext();
    parts.push("【当前问题】\n" + userMsg);
    return parts.join("\n\n");
  }

  function buildFetchHeaders() {
    var h = { "Content-Type": "application/json" };
    var key = CFG.apiKey;
    if (key != null && String(key).trim() !== "") h["X-API-Key"] = String(key).trim();
    return h;
  }

  /* ── SSE stream reader ───────────────────────── */

  function readSSEStream(response, onDelta, onDone, onError, signal) {
    if (!response.body || !response.body.getReader) {
      onError(new Error("浏览器不支持流式读取"));
      return;
    }
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var lineBuf = "";

    function pump() {
      if (signal && signal.aborted) {
        reader.cancel();
        onDone();
        return;
      }
      return reader
        .read()
        .then(function (result) {
          if (result.done) {
            if (lineBuf.trim()) processLine(lineBuf);
            onDone();
            return;
          }
          lineBuf += decoder.decode(result.value, { stream: true });
          var lines = lineBuf.split(/\r?\n/);
          lineBuf = lines.pop() || "";
          for (var i = 0; i < lines.length; i++) processLine(lines[i]);
          return pump();
        })
        .catch(function (e) {
          if (signal && signal.aborted) {
            onDone();
            return;
          }
          onError(e);
        });
    }

    function processLine(line) {
      line = line.trim();
      if (!line || line[0] === ":") return;
      if (line.indexOf("data:") !== 0) return;
      var payload = line.slice(5).trim();
      if (payload === "[DONE]" || payload === "DONE") return;
      var delta = "";
      try {
        var j = JSON.parse(payload);
        delta = extractStreamDelta(j);
      } catch (e) {
        delta = payload;
      }
      if (delta) onDelta(delta);
    }

    pump();
  }

  /* ── main ────────────────────────────────────── */

  function init() {
    if (CFG.enabled === false) return;
    if (!CFG.apiUrl || String(CFG.apiUrl).trim() === "") return;

    var messages = loadMessages();
    var open = sessionStorage.getItem(STORAGE_KEY) === "1";
    var abortCtrl = null; // for cancelling in-flight requests

    /* ── DOM ── */

    var root = el("div", {
      id: "gdufe-ai-assistant",
      className: "gdufe-ai",
      "aria-label": CFG.title || "AI 助手",
    });

    // tab
    var tab = el("button", {
      type: "button",
      className: "gdufe-ai__tab",
      "aria-expanded": open ? "true" : "false",
      title: (CFG.title || "AI 助手") + "（点击展开/收起）",
    });
    tab.innerHTML =
      '<span class="gdufe-ai__tab-icon" aria-hidden="true">' +
      '<img src="" class="gdufe-ai__favicon" alt="" width="22" height="22" />' +
      "</span>" +
      '<span class="gdufe-ai__tab-text">' +
      (CFG.title || "AI") +
      "</span>";

    // panel
    var panel = el("aside", {
      className: "gdufe-ai__panel",
      role: "dialog",
      "aria-modal": "false",
      "aria-label": CFG.title || "AI 助手",
    });

    // header
    var header = el("div", { className: "gdufe-ai__header" });
    var titleEl = el("span", {
      className: "gdufe-ai__title",
      textContent: CFG.title || "AI 助手",
    });

    var headerActions = el("div", { className: "gdufe-ai__header-actions" });

    var newChatBtn = el("button", {
      type: "button",
      className: "gdufe-ai__new-chat",
      title: "新对话",
      "aria-label": "新对话",
    });
    newChatBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';

    var closeBtn = el("button", {
      type: "button",
      className: "gdufe-ai__close",
      "aria-label": "收起",
      title: "收起",
    });
    closeBtn.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';

    headerActions.appendChild(newChatBtn);
    headerActions.appendChild(closeBtn);

    // message list
    var listEl = el("div", {
      className: "gdufe-ai__messages",
      id: "gdufe-ai-messages",
    });

    // form
    var form = el("form", { className: "gdufe-ai__form" });

    var inputWrap = el("div", { className: "gdufe-ai__input-wrap" });
    var input = el("textarea", {
      className: "gdufe-ai__input",
      rows: "1",
      placeholder: CFG.placeholder || "输入问题…",
      "aria-label": "消息输入",
    });

    var send = el("button", {
      type: "submit",
      className: "gdufe-ai__send",
      title: "发送",
    });
    send.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';

    // stop button (replaces send during generation)
    var stopBtn = el("button", {
      type: "button",
      className: "gdufe-ai__stop",
      title: "停止生成",
    });
    stopBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

    inputWrap.appendChild(input);
    inputWrap.appendChild(send);
    inputWrap.appendChild(stopBtn);

    form.appendChild(inputWrap);

    // assemble
    header.appendChild(titleEl);
    header.appendChild(headerActions);
    panel.appendChild(header);
    panel.appendChild(listEl);
    panel.appendChild(form);
    root.appendChild(tab);
    root.appendChild(panel);
    document.body.appendChild(root);

    // resolve favicon URL from <link rel="icon"> to work on any page depth
    var faviconUrl = (function () {
      var link = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
      if (link && link.href) return link.href;
      var a = document.createElement("a");
      a.href = "assets/favicon.png";
      return a.href;
    })();
    // set src on already-created tab icon
    tab.querySelector(".gdufe-ai__favicon").src = faviconUrl;

    /* ── state helpers ── */

    function scrollListBottom() {
      listEl.scrollTop = listEl.scrollHeight;
    }

    function setOpen(next) {
      open = next;
      root.classList.toggle("gdufe-ai--open", open);
      tab.setAttribute("aria-expanded", open ? "true" : "false");
      try {
        sessionStorage.setItem(STORAGE_KEY, open ? "1" : "0");
      } catch (e) {}
      if (open)
        setTimeout(function () {
          input.focus();
        }, 250);
    }

    function setGenerating(v) {
      root.classList.toggle("gdufe-ai--generating", v);
      send.style.display = v ? "none" : "";
      stopBtn.style.display = v ? "" : "none";
      input.disabled = v;
    }

    /* ── auto-resize input ── */

    function autoResize() {
      input.style.height = "auto";
      var s = input.scrollHeight;
      var max = 140;
      input.style.height = Math.min(s, max) + "px";
    }

    input.addEventListener("input", autoResize);

    /* ── welcome screen ── */

    var suggestions = [
      "佛山校区有哪些园区？",
    ];

    function buildWelcome() {
      var w = el("div", { className: "gdufe-ai__welcome" });
      var icon = el("div", { className: "gdufe-ai__welcome-icon" });
      icon.innerHTML =
        '<img src="' + faviconUrl + '" alt="" width="36" height="36" />';
      var heading = el("div", {
        className: "gdufe-ai__welcome-title",
        textContent: "你好，有什么可以帮你的？",
      });
      var hint = el("div", {
        className: "gdufe-ai__welcome-hint",
        textContent: "选择下方问题或直接输入你的问题",
      });
      var grid = el("div", { className: "gdufe-ai__suggestions" });
      suggestions.forEach(function (s) {
        var chip = el("button", {
          type: "button",
          className: "gdufe-ai__suggestion",
          textContent: s,
        });
        chip.addEventListener("click", function () {
          input.value = s;
          autoResize();
          if (form.requestSubmit) form.requestSubmit();
          else
            form.dispatchEvent(
              new Event("submit", { cancelable: true, bubbles: true })
            );
        });
        grid.appendChild(chip);
      });
      w.appendChild(icon);
      w.appendChild(heading);
      w.appendChild(hint);
      w.appendChild(grid);
      return w;
    }

    /* ── typing indicator ── */

    function createTypingIndicator() {
      var row = el("div", {
        className: "gdufe-ai__msg gdufe-ai__msg--assistant",
      });
      var bubble = el("div", { className: "gdufe-ai__bubble gdufe-ai__typing" });
      bubble.innerHTML =
        '<span class="gdufe-ai__dot"></span>' +
        '<span class="gdufe-ai__dot"></span>' +
        '<span class="gdufe-ai__dot"></span>';
      row.appendChild(bubble);
      return row;
    }

    /* ── copy button handler (event delegation) ── */

    listEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".gdufe-ai__copy-btn");
      if (!btn) return;
      var wrap = btn.closest(".gdufe-ai__code-wrap");
      if (!wrap) return;
      var code = wrap.querySelector("code");
      if (!code) return;
      var text = code.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showCopySuccess(btn);
        });
      } else {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        showCopySuccess(btn);
      }
    });

    function showCopySuccess(btn) {
      var span = btn.querySelector("span");
      if (span) span.textContent = "已复制";
      btn.classList.add("gdufe-ai__copy-btn--done");
      setTimeout(function () {
        if (span) span.textContent = "复制";
        btn.classList.remove("gdufe-ai__copy-btn--done");
      }, 2000);
    }

    /* ── message bubble copy (copy entire message) ── */

    function addMsgCopyButton(bubble) {
      var btn = el("button", {
        type: "button",
        className: "gdufe-ai__msg-copy",
        title: "复制消息",
      });
      btn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
      btn.addEventListener("click", function () {
        var text = bubble._rawText || bubble.textContent;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            btn.classList.add("gdufe-ai__msg-copy--done");
            setTimeout(function () {
              btn.classList.remove("gdufe-ai__msg-copy--done");
            }, 2000);
          });
        } else {
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          btn.classList.add("gdufe-ai__msg-copy--done");
          setTimeout(function () {
            btn.classList.remove("gdufe-ai__msg-copy--done");
          }, 2000);
        }
      });
      bubble.appendChild(btn);
    }

    /* ── render messages ── */

    function renderMessages() {
      listEl.innerHTML = "";
      if (messages.length === 0) {
        listEl.appendChild(buildWelcome());
        return;
      }
      messages.forEach(function (m) {
        var row = el("div", {
          className:
            "gdufe-ai__msg gdufe-ai__msg--" +
            (m.role === "assistant" ? "assistant" : "user"),
        });
        var bubble = el("div", { className: "gdufe-ai__bubble" });
        if (m.role === "assistant") {
          bubble.innerHTML = renderMarkdown(m.content || "");
          bubble._rawText = m.content || "";
          addMsgCopyButton(bubble);
        } else {
          bubble.textContent = m.content || "";
        }
        row.appendChild(bubble);
        listEl.appendChild(row);
      });
      scrollListBottom();
    }

    function appendError(text) {
      var row = el("div", {
        className: "gdufe-ai__msg gdufe-ai__msg--error",
      });
      var bubble = el("div", { className: "gdufe-ai__bubble" });
      bubble.textContent = text;
      row.appendChild(bubble);
      listEl.appendChild(row);
      scrollListBottom();
    }

    /* ── events ── */

    tab.addEventListener("click", function () {
      setOpen(!open);
    });
    closeBtn.addEventListener("click", function () {
      setOpen(false);
    });

    // new chat
    newChatBtn.addEventListener("click", function () {
      if (abortCtrl) {
        abortCtrl.abort();
        abortCtrl = null;
      }
      messages = [];
      saveMessages(messages);
      setGenerating(false);
      renderMessages();
      input.focus();
    });

    // stop generation
    stopBtn.addEventListener("click", function () {
      if (abortCtrl) {
        abortCtrl.abort();
        abortCtrl = null;
      }
    });

    // Enter 发送；Ctrl+Enter/Shift+Enter 换行
    input.addEventListener("keydown", function (e) {
      if (e.isComposing) return;
      if (
        e.key === "Enter" &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        if (send.style.display === "none") return;
        if (form.requestSubmit) form.requestSubmit();
        else
          form.dispatchEvent(
            new Event("submit", { cancelable: true, bubbles: true })
          );
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && open) setOpen(false);
    });

    /* ── submit / fetch ── */

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = (input.value || "").trim();
      if (!text) return;

      input.value = "";
      input.style.height = "auto";
      autoResize();

      messages.push({ role: "user", content: text });
      saveMessages(messages);
      renderMessages();
      setGenerating(true);

      // show typing indicator
      var typingEl = createTypingIndicator();
      listEl.appendChild(typingEl);
      scrollListBottom();

      abortCtrl = new AbortController();
      var signal = abortCtrl.signal;

      var mode = CFG.requestMode || "external_chat";
      var useExternal =
        mode === "external_chat" || mode === "external_stream";

      function formatFetchError(err) {
        var m = err && err.message ? err.message : String(err);
        if (/Failed to fetch|NetworkError|Load failed|network/i.test(m))
          return (
            m +
            "。常见原因：浏览器 CORS 拦截。请在后端把「文档站」的 Origin 加入白名单，例如 mkdocs serve 使用 http://127.0.0.1:8000 与 http://localhost:8000（需与浏览器地址栏一致）。"
          );
        return m;
      }

      function finishFail(err) {
        typingEl.remove();
        appendError("请求失败：" + formatFetchError(err));
        messages.pop();
        saveMessages(messages);
        setGenerating(false);
        abortCtrl = null;
      }

      if (useExternal) {
        var historyBefore = messages.slice(0, -1);
        var msgBody = buildExternalMessage(historyBefore, text);
        var stream = CFG.stream !== false;
        var reqBody = { message: msgBody };
        if (stream) reqBody.stream = true;

        fetch(CFG.apiUrl, {
          method: "POST",
          headers: buildFetchHeaders(),
          body: JSON.stringify(reqBody),
          credentials: "omit",
          signal: signal,
        })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            typingEl.remove();

            var ct = (r.headers.get("content-type") || "").toLowerCase();
            var looksJson = ct.indexOf("application/json") !== -1;
            var looksSse =
              ct.indexOf("text/event-stream") !== -1 ||
              ct.indexOf("event-stream") !== -1;

            if (!stream) {
              return r.json().then(function (data) {
                var reply = parseReply(data);
                messages.push({
                  role: "assistant",
                  content: reply || "（空回复）",
                });
                saveMessages(messages);
                renderMessages();
                setGenerating(false);
                abortCtrl = null;
              });
            }

            if (r.body && (looksSse || !looksJson)) {
              var row = el("div", {
                className: "gdufe-ai__msg gdufe-ai__msg--assistant",
              });
              var bubble = el("div", { className: "gdufe-ai__bubble" });
              row.appendChild(bubble);
              listEl.appendChild(row);
              scrollListBottom();
              var acc = "";
              readSSEStream(
                r,
                function (d) {
                  acc += d;
                  bubble.innerHTML = renderMarkdown(acc);
                  bubble._rawText = acc;
                  scrollListBottom();
                },
                function () {
                  // add copy button after stream ends
                  addMsgCopyButton(bubble);
                  messages.push({
                    role: "assistant",
                    content: acc || "（空回复）",
                  });
                  saveMessages(messages);
                  setGenerating(false);
                  abortCtrl = null;
                },
                function (err) {
                  row.remove();
                  finishFail(err);
                },
                signal
              );
              return;
            }

            return r.json().then(function (data) {
              var reply = parseReply(data);
              messages.push({
                role: "assistant",
                content: reply || "（空回复）",
              });
              saveMessages(messages);
              renderMessages();
              setGenerating(false);
              abortCtrl = null;
            });
          })
          .catch(function (err) {
            if (err.name === "AbortError") {
              typingEl.remove();
              // keep partial message if any stream content was collected
              setGenerating(false);
              abortCtrl = null;
              return;
            }
            finishFail(err);
          });
        return;
      }

      var historyForApi = messages.slice(0, -1);
      var apiMessages = buildApiMessages(historyForApi, text);
      var body = buildRequestBody(apiMessages);

      fetch(CFG.apiUrl, {
        method: "POST",
        headers: buildFetchHeaders(),
        body: JSON.stringify(body),
        credentials: "omit",
        signal: signal,
      })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          typingEl.remove();
          return r.json();
        })
        .then(function (data) {
          var reply = parseReply(data);
          messages.push({
            role: "assistant",
            content: reply || "（空回复）",
          });
          saveMessages(messages);
          renderMessages();
        })
        .catch(function (err) {
          if (err.name === "AbortError") {
            typingEl.remove();
            setGenerating(false);
            abortCtrl = null;
            return;
          }
          finishFail(err);
        })
        .finally(function () {
          setGenerating(false);
          abortCtrl = null;
        });
    });

    renderMessages();
    setOpen(open);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
