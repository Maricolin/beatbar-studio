// Deliberately small Markdown subset: create DOM nodes, never interpret raw HTML.
export function headingId(text) {
  return (
    text
      .toLocaleLowerCase()
      .replace(/[`*_]/g, "")
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-|-$/g, "") || "section"
  );
}

export function renderMarkdown(source, { resolveLink = (href) => href } = {}) {
  const fragment = document.createDocumentFragment();
  const headings = [];
  const ids = new Map();
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  function inline(parent, text) {
    const tokens = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*/g;
    let start = 0;
    for (const match of text.matchAll(tokens)) {
      parent.append(document.createTextNode(text.slice(start, match.index)));
      if (match[1]) {
        const code = document.createElement("code");
        code.textContent = match[1];
        parent.append(code);
      } else if (match[2]) {
        let url;
        try {
          url = new URL(resolveLink(match[3]), location.href);
        } catch {}
        if (url && ["http:", "https:"].includes(url.protocol)) {
          const link = document.createElement("a");
          link.href = url.href;
          link.textContent = match[2];
          if (url.origin !== location.origin) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
          } else if (/\.(?:wav|json|funscript)$/i.test(url.pathname)) {
            link.download = "";
          }
          parent.append(link);
        } else parent.append(document.createTextNode(match[2]));
      } else {
        const strong = document.createElement("strong");
        strong.textContent = match[4];
        parent.append(strong);
      }
      start = match.index + match[0].length;
    }
    parent.append(document.createTextNode(text.slice(start)));
  }
  const tableCells = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split(/(?<!\\)\|/)
      .map((s) => s.trim().replace(/\\\|/g, "|"));
  const isSeparator = (line = "") =>
    /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^\s*```([^`]*)$/);
    if (fence) {
      const block = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i]))
        block.push(lines[i++]);
      if (i < lines.length) i++;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.join("\n");
      if (fence[1].trim()) code.dataset.language = fence[1].trim();
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "copy-code quiet";
      copy.textContent = "复制";
      copy.setAttribute("aria-label", "复制代码块");
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(code.textContent);
          copy.textContent = "已复制";
        } catch {
          copy.textContent = "请选中文字复制";
        }
      };
      pre.append(copy, code);
      fragment.append(pre);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const element = document.createElement("h" + heading[1].length);
      const base = headingId(heading[2]);
      const count = (ids.get(base) || 0) + 1;
      ids.set(base, count);
      element.id = base + (count > 1 ? "-" + count : "");
      inline(element, heading[2]);
      headings.push({
        id: element.id,
        text: element.textContent,
        level: heading[1].length,
      });
      fragment.append(element);
      i++;
      continue;
    }
    if (line.includes("|") && isSeparator(lines[i + 1])) {
      const wrapper = document.createElement("div");
      wrapper.className = "markdown-table";
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "region");
      wrapper.setAttribute("aria-label", "表格，可横向滚动");
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const row = document.createElement("tr");
      for (const value of tableCells(line)) {
        const cell = document.createElement("th");
        cell.scope = "col";
        inline(cell, value);
        row.append(cell);
      }
      head.append(row);
      table.append(head);
      const body = document.createElement("tbody");
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        const tr = document.createElement("tr");
        for (const value of tableCells(lines[i++])) {
          const td = document.createElement("td");
          inline(td, value);
          tr.append(td);
        }
        body.append(tr);
      }
      table.append(body);
      wrapper.append(table);
      fragment.append(wrapper);
      continue;
    }
    const list = line.match(/^\s*(?:(\d+)\.|([-*]))\s+(.+)$/);
    if (list) {
      const ordered = !!list[1];
      const element = document.createElement(ordered ? "ol" : "ul");
      if (ordered) element.start = Number(list[1]);
      while (i < lines.length) {
        const item = lines[i].match(/^\s*(?:(\d+)\.|([-*]))\s+(.+)$/);
        if (!item || !!item[1] !== ordered) break;
        const li = document.createElement("li");
        inline(li, item[3]);
        element.append(li);
        i++;
      }
      fragment.append(element);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = document.createElement("blockquote");
      const text = [];
      while (i < lines.length && /^>\s?/.test(lines[i]))
        text.push(lines[i++].replace(/^>\s?/, ""));
      inline(quote, text.join(" "));
      fragment.append(quote);
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      fragment.append(document.createElement("hr"));
      i++;
      continue;
    }
    const paragraph = document.createElement("p");
    const text = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(?:#{1,6}\s|\s*```|\s*[-*]\s|\s*\d+\.\s|>)/.test(lines[i]) &&
      !isSeparator(lines[i + 1])
    )
      text.push(lines[i++]);
    inline(paragraph, text.join(" "));
    fragment.append(paragraph);
  }
  return { fragment, headings };
}
