// scripts/import_admin_export.py의 변환 로직을 JS로 그대로 옮긴 것입니다.
// 관리자 화면(admin.js)의 폼 형식(bodyText/faqText/keyPointsText 등)을
// 사이트 렌더링에 쓰이는 구조(body 섹션 목록/faq 목록 등)로 변환합니다.

import { sanitizeHtml } from "./sanitize.js";

function parseBodyMarkdown(text) {
  text = (text || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [["본문", [""]]];

  const lines = text.split("\n");
  const sections = [];
  let currentHeading = null;
  let currentLines = [];

  function flush() {
    if (currentHeading !== null) {
      const block = currentLines.join("\n").trim();
      let paragraphs = block.split("\n\n").map((p) => p.trim()).filter(Boolean);
      if (paragraphs.length === 0) paragraphs = [""];
      sections.push([currentHeading, paragraphs]);
    }
  }

  for (const line of lines) {
    if (line.trim().startsWith("## ")) {
      flush();
      currentHeading = line.trim().slice(3).trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (sections.length === 0) {
    const paragraphs = text.split("\n\n").map((p) => p.trim()).filter(Boolean);
    return [["본문", paragraphs.length ? paragraphs : [text]]];
  }
  return sections;
}

function parseFaq(text) {
  const faq = [];
  for (let line of (text || "").split("\n")) {
    line = line.trim();
    if (!line || line.indexOf("|") === -1) continue;
    const idx = line.indexOf("|");
    const q = line.slice(0, idx).trim();
    const a = line.slice(idx + 1).trim();
    if (q && a) faq.push([q, a]);
  }
  return faq;
}

function parseLines(text) {
  return (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
}

export function convertPost(raw, existingBySlug) {
  const slug = raw.slug;
  const existing = existingBySlug.get(slug) || {};

  const body = "bodyText" in raw
    ? parseBodyMarkdown(raw.bodyText)
    : raw.body || existing.body || [["본문", [""]]];

  const faq = "faqText" in raw ? parseFaq(raw.faqText) : (raw.faq || existing.faq || []);
  const keyPoints = "keyPointsText" in raw ? parseLines(raw.keyPointsText) : (raw.key_points || existing.key_points || []);
  const mistakes = "mistakesText" in raw ? parseLines(raw.mistakesText) : (raw.mistakes || existing.mistakes || []);
  const checklist = "checklistText" in raw ? parseLines(raw.checklistText) : (raw.checklist || existing.checklist || []);

  const bodyHtml = sanitizeHtml(raw.body_html ?? existing.body_html ?? "");

  return {
    slug,
    title: raw.title ?? existing.title ?? "",
    subtitle: raw.subtitle ?? existing.subtitle ?? "",
    category: raw.category ?? existing.category ?? "",
    summary: raw.summary ?? existing.summary ?? "",
    published: raw.published ?? existing.published ?? "",
    modified: raw.modified ?? existing.modified ?? "",
    featured: Boolean(raw.featured ?? existing.featured ?? false),
    status: raw.status ?? existing.status ?? "published",
    toc: body.map((sec) => sec[0]),
    body,
    body_html: bodyHtml,
    key_points: keyPoints,
    mistakes,
    checklist,
    related: raw.related ?? existing.related ?? [],
    faq,
  };
}

export function convertColumn(raw, existingBySlug) {
  const slug = raw.slug;
  const existing = existingBySlug.get(slug) || {};

  let body;
  if ("bodyText" in raw) {
    body = raw.bodyText.replace(/\r\n/g, "\n").trim().split("\n\n").map((p) => p.trim()).filter(Boolean);
    if (body.length === 0) body = [""];
  } else {
    body = raw.body || existing.body || [""];
  }

  const bodyHtml = sanitizeHtml(raw.body_html ?? existing.body_html ?? "");

  return {
    slug,
    title: raw.title ?? existing.title ?? "",
    summary: raw.summary ?? existing.summary ?? "",
    published: raw.published ?? existing.published ?? "",
    modified: raw.modified ?? existing.modified ?? "",
    featured: Boolean(raw.featured ?? existing.featured ?? false),
    status: raw.status ?? existing.status ?? "published",
    body,
    body_html: bodyHtml,
  };
}
