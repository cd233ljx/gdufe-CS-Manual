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

  function safeHref(href) {
    var h = (href || "").trim();
    if (/^(https?:|mailto:|#|\/)/i.test(h)) return h;
    return "#";
  }

  function renderInline(text) {
    var codeSpans = [];
    var html = escapeHtml(text);

    html = html.replace(/`([^`\n]+)`/g, function (_, code) {
      var i = codeSpans.length;
      codeSpans.push('<code class="gdufe-ai__inline-code">' + code + "</code>");
      return "\u0000INLINE_CODE_" + i + "\u0000";
    });

    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, href) {
      return (
        '<a href="' +
        safeHref(href) +
        '" target="_blank" rel="noopener noreferrer">' +
        label +
        "</a>"
      );
    });
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");

    return html.replace(/\u0000INLINE_CODE_(\d+)\u0000/g, function (_, i) {
      return codeSpans[Number(i)] || "";
    });
  }

  function codeBlockHtml(lang, code) {
    return (
      '<div class="gdufe-ai__code-wrap">' +
      '<div class="gdufe-ai__code-header">' +
      '<span class="gdufe-ai__code-lang">' +
      escapeHtml((lang || "code").trim()) +
      "</span>" +
      '<button class="gdufe-ai__copy-btn" type="button" title="复制代码">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
      "<span>复制</span>" +
      "</button>" +
      "</div>" +
      '<pre class="gdufe-ai__pre"><code>' +
      escapeHtml(code.trimEnd()) +
      "</code></pre>" +
      "</div>"
    );
  }

  function splitTableRow(line) {
    var cells = [];
    var cell = "";
    var escaped = false;
    var text = line.trim();

    if (text.charAt(0) === "|") text = text.slice(1);
    if (text.charAt(text.length - 1) === "|") text = text.slice(0, -1);

    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (escaped) {
        cell += ch;
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "|") {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += ch;
      }
    }
    if (escaped) cell += "\\";
    cells.push(cell.trim());
    return cells;
  }

  function isTableDelimiter(line) {
    var cells = splitTableRow(line);
    if (cells.length < 2) return false;
    return cells.every(function (cell) {
      return /^:?-{3,}:?$/.test(cell.trim());
    });
  }

  function tableAlign(cell) {
    var text = cell.trim();
    if (/^:-+:$/.test(text)) return "center";
    if (/^-+:$/.test(text)) return "right";
    if (/^:-+$/.test(text)) return "left";
    return "";
  }

  function renderTableRow(cells, tag, aligns) {
    return (
      "<tr>" +
      cells
        .map(function (cell, i) {
          var align = aligns && aligns[i] ? ' style="text-align:' + aligns[i] + '"' : "";
          return "<" + tag + align + ">" + renderInline(cell) + "</" + tag + ">";
        })
        .join("") +
      "</tr>"
    );
  }

  function renderTable(lines) {
    var header = splitTableRow(lines[0]);
    var delimiter = splitTableRow(lines[1]);
    var aligns = delimiter.map(tableAlign);
    var bodyRows = lines.slice(2).map(splitTableRow);

    return (
      '<div class="gdufe-ai__table-wrap"><table class="gdufe-ai__table">' +
      "<thead>" +
      renderTableRow(header, "th", aligns) +
      "</thead>" +
      "<tbody>" +
      bodyRows
        .map(function (row) {
          return renderTableRow(row, "td", aligns);
        })
        .join("") +
      "</tbody>" +
      "</table></div>"
    );
  }

  function renderMarkdown(text) {
    if (!text) return "";
    var codeBlocks = [];
    var source = String(text).replace(/\r\n?/g, "\n");

    source = source.replace(/```([^\n`]*)\n([\s\S]*?)```/g, function (_, lang, code) {
      var i = codeBlocks.length;
      codeBlocks.push(codeBlockHtml(lang, code));
      return "\n@@GDUFE_CODE_BLOCK_" + i + "@@\n";
    });

    var out = [];
    var paragraph = [];
    var listType = null;

    function flushParagraph() {
      if (!paragraph.length) return;
      out.push("<p>" + paragraph.map(renderInline).join("<br>") + "</p>");
      paragraph = [];
    }

    function closeList() {
      if (!listType) return;
      out.push("</" + listType + ">");
      listType = null;
    }

    var lines = source.split("\n");
    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      var line = lines[lineIndex];
      var trimmed = line.trim();
      var match;

      if (!trimmed) {
        flushParagraph();
        closeList();
        continue;
      }

      match = trimmed.match(/^@@GDUFE_CODE_BLOCK_(\d+)@@$/);
      if (match) {
        flushParagraph();
        closeList();
        out.push(codeBlocks[Number(match[1])] || "");
        continue;
      }

      if (
        trimmed.indexOf("|") !== -1 &&
        lineIndex + 1 < lines.length &&
        isTableDelimiter(lines[lineIndex + 1])
      ) {
        var tableLines = [line, lines[lineIndex + 1]];
        lineIndex += 2;
        while (
          lineIndex < lines.length &&
          lines[lineIndex].trim() &&
          lines[lineIndex].indexOf("|") !== -1 &&
          !/^@@GDUFE_CODE_BLOCK_(\d+)@@$/.test(lines[lineIndex].trim())
        ) {
          tableLines.push(lines[lineIndex]);
          lineIndex++;
        }
        lineIndex--;
        flushParagraph();
        closeList();
        out.push(renderTable(tableLines));
        continue;
      }

      match = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        flushParagraph();
        closeList();
        out.push(
          "<h" +
            match[1].length +
            ">" +
            renderInline(match[2]) +
            "</h" +
            match[1].length +
            ">"
        );
        continue;
      }

      if (/^[-*_]{3,}$/.test(trimmed)) {
        flushParagraph();
        closeList();
        out.push("<hr>");
        continue;
      }

      match = trimmed.match(/^>\s?(.+)$/);
      if (match) {
        flushParagraph();
        closeList();
        out.push("<blockquote>" + renderInline(match[1]) + "</blockquote>");
        continue;
      }

      match = trimmed.match(/^[-*]\s+(.+)$/);
      if (match) {
        flushParagraph();
        if (listType !== "ul") {
          closeList();
          out.push("<ul>");
          listType = "ul";
        }
        out.push("<li>" + renderInline(match[1]) + "</li>");
        continue;
      }

      match = trimmed.match(/^\d+\.\s+(.+)$/);
      if (match) {
        flushParagraph();
        if (listType !== "ol") {
          closeList();
          out.push("<ol>");
          listType = "ol";
        }
        out.push("<li>" + renderInline(match[1]) + "</li>");
        continue;
      }

      closeList();
      paragraph.push(line);
    }

    flushParagraph();
    closeList();
    return out.join("");
  }

  /* ── thinking / reasoning block ──────────────── */

  var THINK_OPEN = '<think>';
  var THINK_CLOSE = '</think>';

  function parseThinking(content) {
    if (!content) return { cleanContent: '', thinkContent: '', hasOpenThink: false };
    var openIdx = content.indexOf(THINK_OPEN);
    if (openIdx !== -1) {
      var closeIdx = content.indexOf(THINK_CLOSE, openIdx + THINK_OPEN.length);
      if (closeIdx === -1) {
        return {
          cleanContent: content.slice(0, openIdx).trim(),
          thinkContent: content.slice(openIdx + THINK_OPEN.length).trim(),
          hasOpenThink: true,
        };
      }
    }

    var parts = [];
    var thinkContent = '';
    var lastIndex = 0;

    var THINK_RE = /<think>([\s\S]*?)<\/think>/gi;
    var match;
    while ((match = THINK_RE.exec(content)) !== null) {
      parts.push(content.slice(lastIndex, match.index));
      thinkContent += match[1].trim() + '\n\n';
      lastIndex = THINK_RE.lastIndex;
    }
    parts.push(content.slice(lastIndex));

    return {
      cleanContent: parts.join('').trim(),
      thinkContent: thinkContent.trim(),
      hasOpenThink: false,
    };
  }

  function createThinkingBlock(content, streaming, bubble) {
    var wasStreaming = bubble._thinkStreaming;
    var expanded = true;
    if (wasStreaming && !streaming) {
      expanded = false;
    } else if (!streaming && bubble._thinkExpanded !== undefined) {
      expanded = bubble._thinkExpanded;
    }
    bubble._thinkStreaming = streaming;

    var block = el('div', {
      className: 'gdufe-ai__thinking-block' + (expanded ? ' gdufe-ai__thinking--expanded' : ''),
    });

    var header = el('button', {
      type: 'button',
      className: 'gdufe-ai__thinking-header',
    });

    var headerText = expanded ? '收起思考过程' : '已深度思考';
    var title = el('span', {
      className: 'gdufe-ai__thinking-title',
      textContent: headerText,
    });

    var arrow = el('span', { className: 'gdufe-ai__thinking-arrow' });
    arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>';

    header.appendChild(title);
    header.appendChild(arrow);

    var bodyWrapper = el('div', { className: 'gdufe-ai__thinking-body-wrapper' });
    var body = el('div', { className: 'gdufe-ai__thinking-body' });
    body.textContent = content || '';
    bodyWrapper.appendChild(body);

    header.addEventListener('click', function () {
      expanded = !expanded;
      block.classList.toggle('gdufe-ai__thinking--expanded', expanded);
      title.textContent = expanded ? '收起思考过程' : '已深度思考';
      arrow.style.transform = expanded ? 'rotate(180deg)' : '';
      bubble._thinkExpanded = expanded;
    });

    block.appendChild(header);
    block.appendChild(bodyWrapper);
    return block;
  }

  function updateThinkingBlock(block, content, streaming, bubble) {
    var wasStreaming = bubble._thinkStreaming;
    var expanded = block.classList.contains('gdufe-ai__thinking--expanded');
    if (wasStreaming && !streaming) {
      expanded = false;
      block.classList.remove('gdufe-ai__thinking--expanded');
    }
    bubble._thinkStreaming = streaming;

    var title = block.querySelector('.gdufe-ai__thinking-title');
    var arrow = block.querySelector('.gdufe-ai__thinking-arrow');
    var body = block.querySelector('.gdufe-ai__thinking-body');

    if (title) title.textContent = expanded ? '收起思考过程' : '已深度思考';
    if (arrow) arrow.style.transform = expanded ? 'rotate(180deg)' : '';
    if (body) body.textContent = content || '';
  }

  function renderAssistantContent(bubble, text, isStreaming) {
    var parsed = parseThinking(text);
    var displayContent = parsed.cleanContent;
    var thinkContent = parsed.thinkContent;
    var isActive = parsed.hasOpenThink || !!isStreaming;

    var existingThink = bubble.querySelector('.gdufe-ai__thinking-block');
    var existingAnswer = bubble.querySelector('.gdufe-ai__answer-wrap');

    if (!existingThink && !existingAnswer) {
      bubble.innerHTML = '';
      if (thinkContent || isActive) {
        var thinkBlock = createThinkingBlock(thinkContent, isActive, bubble);
        bubble.appendChild(thinkBlock);
      }
      if (displayContent) {
        var answerWrap = el('div', { className: 'gdufe-ai__answer-wrap' });
        answerWrap.innerHTML = renderMarkdown(displayContent);
        bubble.appendChild(answerWrap);
      }
    } else {
      if (thinkContent || isActive) {
        if (existingThink) {
          updateThinkingBlock(existingThink, thinkContent, isActive, bubble);
        } else {
          var thinkBlock = createThinkingBlock(thinkContent, isActive, bubble);
          bubble.insertBefore(thinkBlock, bubble.firstChild);
        }
      } else if (existingThink) {
        existingThink.remove();
      }
      if (displayContent) {
        if (existingAnswer) {
          existingAnswer.innerHTML = renderMarkdown(displayContent);
        } else {
          var answerWrap = el('div', { className: 'gdufe-ai__answer-wrap' });
          answerWrap.innerHTML = renderMarkdown(displayContent);
          bubble.appendChild(answerWrap);
        }
      } else if (existingAnswer) {
        existingAnswer.remove();
      }
    }
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
    if (typeof data.reasoning_content === "string" && data.reasoning_content) {
      var ans = "";
      if (typeof data.answer === "string") ans = data.answer;
      else if (typeof data.content === "string") ans = data.content;
      else if (data.message && typeof data.message === "string") ans = data.message;
      return "<think>\n" + data.reasoning_content + "\n</think>\n\n" + ans;
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

    var reasoning = "";
    var content = "";

    // reasoning fields (independent checks)
    if (typeof obj.reasoning_content === "string") reasoning = obj.reasoning_content;
    if (obj.delta && typeof obj.delta.reasoning_content === "string") reasoning = obj.delta.reasoning_content;

    // content fields (first match wins)
    if (typeof obj.answer === "string") content = obj.answer;
    else if (typeof obj.content === "string") content = obj.content;
    else if (obj.delta && typeof obj.delta.content === "string") content = obj.delta.content;
    else if (obj.choices && obj.choices[0] && obj.choices[0].delta) {
      var d = obj.choices[0].delta;
      if (typeof d.content === "string") content = d.content;
      if (typeof d.reasoning_content === "string") reasoning = d.reasoning_content;
    } else if (typeof obj.text === "string") content = obj.text;
    else if (typeof obj.token === "string") content = obj.token;
    else if (obj.message && typeof obj.message === "string") content = obj.message;

    if (reasoning || content) {
      if (reasoning) return { reasoning: reasoning, content: content };
      return content;
    }
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
      if (typeof delta === "string" && delta) onDelta(delta);
      else if (delta && typeof delta === "object") {
        if (delta.reasoning) onDelta(delta.reasoning, true);
        if (delta.content) onDelta(delta.content, false);
      }
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
      "计算机专业的培养方案是怎样的？",
      "请问如何申请课程免修？",
      "我想知道操作系统课程的考试形式。"
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
      if (bubble.querySelector(".gdufe-ai__msg-copy")) return;
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
          renderAssistantContent(bubble, m.content || "");
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
              var accThinking = "";
              var accAnswer = "";
              readSSEStream(
                r,
                function (d, isReasoning) {
                  if (isReasoning) accThinking += d;
                  else accAnswer += d;
                  var displayText = accThinking
                    ? "<think>\n" + accThinking + "\n</think>\n\n" + accAnswer
                    : accAnswer;
                  renderAssistantContent(bubble, displayText, true);
                  bubble._rawText = displayText;
                  scrollListBottom();
                },
                function () {
                  // add copy button after stream ends
                  var finalText = accThinking
                    ? "<think>\n" + accThinking + "\n</think>\n\n" + accAnswer
                    : accAnswer;
                  renderAssistantContent(bubble, finalText, false);
                  addMsgCopyButton(bubble);
                  messages.push({
                    role: "assistant",
                    content: finalText || "（空回复）",
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
