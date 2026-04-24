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

  function getPageContext() {
    var title = document.title || "";
    var path = (location && location.pathname) || "";
    var h1 = document.querySelector(".md-content h1");
    if (h1 && h1.textContent) title = h1.textContent.trim();
    return "当前页面标题：" + title + "\n页面路径：" + path;
  }

  /** 非流式 JSON：{ success, answer } 或与 OpenAI 等兼容字段 */
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

  /** SSE 每行 data: 的 JSON 中增量文本（含 answer 字段） */
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
      var last = apiMessages.filter(function (m) {
        return m.role === "user";
      }).pop();
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

  /**
   * external_chat：单字段 message + stream；多轮可把历史拼进一条 message
   */
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

  function readSSEStream(response, onDelta, onDone, onError) {
    if (!response.body || !response.body.getReader) {
      onError(new Error("浏览器不支持流式读取"));
      return;
    }
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var lineBuf = "";

    function pump() {
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

  function init() {
    if (CFG.enabled === false) return;
    if (!CFG.apiUrl || String(CFG.apiUrl).trim() === "") return;

    var messages = loadMessages();
    var open = sessionStorage.getItem(STORAGE_KEY) === "1";

    var root = el("div", {
      id: "gdufe-ai-assistant",
      className: "gdufe-ai",
      "aria-label": CFG.title || "AI 助手",
    });

    var tab = el("button", {
      type: "button",
      className: "gdufe-ai__tab",
      "aria-expanded": open ? "true" : "false",
      title: (CFG.title || "AI 助手") + "（点击展开/收起）",
    });
    tab.innerHTML =
      '<span class="gdufe-ai__tab-icon" aria-hidden="true">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 010 2h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 010-2h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2M7.5 13A1.5 1.5 0 106 11.5 1.5 1.5 0 007.5 13zm9 0a1.5 1.5 0 10-1.5-1.5 1.5 1.5 0 001.5 1.5z"/></svg>' +
      "</span>" +
      '<span class="gdufe-ai__tab-text">' +
      (CFG.title || "AI") +
      "</span>";

    var panel = el("aside", {
      className: "gdufe-ai__panel",
      role: "dialog",
      "aria-modal": "false",
      "aria-label": CFG.title || "AI 助手",
    });

    var header = el("div", { className: "gdufe-ai__header" });
    var titleEl = el("span", { className: "gdufe-ai__title", textContent: CFG.title || "AI 助手" });
    var closeBtn = el("button", {
      type: "button",
      className: "gdufe-ai__close",
      "aria-label": "收起",
      title: "收起",
    });
    closeBtn.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';

    var listEl = el("div", { className: "gdufe-ai__messages", id: "gdufe-ai-messages" });

    var form = el("form", { className: "gdufe-ai__form" });
    var input = el("textarea", {
      className: "gdufe-ai__input",
      rows: "2",
      placeholder: CFG.placeholder || "输入问题…",
      "aria-label": "消息输入",
    });
    var send = el("button", {
      type: "submit",
      className: "gdufe-ai__send md-button md-button--primary",
      title: "发送",
      innerHTML: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    });

    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    form.appendChild(input);
    form.appendChild(send);
    panel.appendChild(header);
    panel.appendChild(listEl);
    panel.appendChild(form);
    root.appendChild(tab);
    root.appendChild(panel);
    document.body.appendChild(root);

    function scrollListBottom() {
      listEl.scrollTop = listEl.scrollHeight;
    }

    function renderMessages() {
      listEl.innerHTML = "";
      if (messages.length === 0) {
        // Hint text removed as requested
        return;
      }
      messages.forEach(function (m) {
        var row = el("div", {
          className:
            "gdufe-ai__msg gdufe-ai__msg--" + (m.role === "assistant" ? "assistant" : "user"),
        });
        var bubble = el("div", { className: "gdufe-ai__bubble" });
        bubble.textContent = m.content || "";
        row.appendChild(bubble);
        listEl.appendChild(row);
      });
      scrollListBottom();
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
        }, 200);
    }

    function appendError(text) {
      var row = el("div", { className: "gdufe-ai__msg gdufe-ai__msg--error" });
      var bubble = el("div", { className: "gdufe-ai__bubble" });
      bubble.textContent = text;
      row.appendChild(bubble);
      listEl.appendChild(row);
      scrollListBottom();
    }

    tab.addEventListener("click", function () {
      setOpen(!open);
    });
    closeBtn.addEventListener("click", function () {
      setOpen(false);
    });

    // Enter 发送；Ctrl+Enter/Shift+Enter 换行（textarea 默认行为）
    input.addEventListener("keydown", function (e) {
      if (e.isComposing) return;
      if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (send.disabled) return;
        if (form.requestSubmit) form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && open) setOpen(false);
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = (input.value || "").trim();
      if (!text) return;

      // 发送后清空输入框
      input.value = "";
      input.style.height = "";

      messages.push({ role: "user", content: text });
      saveMessages(messages);
      renderMessages();
      send.disabled = true;

      var mode = CFG.requestMode || "external_chat";
      var useExternal = mode === "external_chat" || mode === "external_stream";

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
        appendError("请求失败：" + formatFetchError(err));
        messages.pop();
        saveMessages(messages);
        renderMessages();
        send.disabled = false;
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
        })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            var ct = (r.headers.get("content-type") || "").toLowerCase();
            var looksJson = ct.indexOf("application/json") !== -1;
            var looksSse =
              ct.indexOf("text/event-stream") !== -1 || ct.indexOf("event-stream") !== -1;
            if (!stream) {
              return r.json().then(function (data) {
                var reply = parseReply(data);
                messages.push({ role: "assistant", content: reply || "（空回复）" });
                saveMessages(messages);
                renderMessages();
                send.disabled = false;
              });
            }
            if (r.body && (looksSse || !looksJson)) {
              var row = el("div", { className: "gdufe-ai__msg gdufe-ai__msg--assistant" });
              var bubble = el("div", { className: "gdufe-ai__bubble" });
              row.appendChild(bubble);
              listEl.appendChild(row);
              scrollListBottom();
              var acc = "";
              readSSEStream(
                r,
                function (d) {
                  acc += d;
                  bubble.textContent = acc;
                  scrollListBottom();
                },
                function () {
                  messages.push({ role: "assistant", content: acc || "（空回复）" });
                  saveMessages(messages);
                  send.disabled = false;
                },
                function (err) {
                  row.remove();
                  finishFail(err);
                }
              );
              return;
            }
            return r.json().then(function (data) {
              var reply = parseReply(data);
              messages.push({ role: "assistant", content: reply || "（空回复）" });
              saveMessages(messages);
              renderMessages();
              send.disabled = false;
            });
          })
          .catch(function (err) {
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
      })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (data) {
          var reply = parseReply(data);
          messages.push({ role: "assistant", content: reply || "（空回复）" });
          saveMessages(messages);
          renderMessages();
        })
        .catch(function (err) {
          finishFail(err);
        })
        .finally(function () {
          send.disabled = false;
        });
    });

    renderMessages();
    setOpen(open);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
