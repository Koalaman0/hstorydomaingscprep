// 관리자 리치 텍스트 에디터(Quill)가 만든 본문 HTML을 저장하기 전에 걸러내는 화이트리스트 필터.
// 목적은 "일반적인 임의 HTML 새니타이즈"가 아니라, 만약 로그인 정보가 뚫려도
// 공격자가 <script> 등을 심어 방문자 브라우저에서 코드가 실행되는 것(저장형 XSS)을
// 막는 것이다. Quill 툴바가 만들 수 있는 태그/속성만 통과시킨다.

const ALLOWED_TAGS = new Set([
  "h2", "h3", "p", "strong", "b", "em", "i", "u", "s",
  "a", "img", "ul", "ol", "li", "blockquote", "br", "span",
]);

const ALLOWED_ATTRS = {
  a: ["href", "target"],
  img: ["src", "alt"],
  span: ["style"],
  p: ["style"],
  h2: ["style"],
  h3: ["style"],
  li: ["style"],
};

const DANGEROUS_BLOCK_TAGS = /<(script|style|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DANGEROUS_VOID_TAGS = /<(iframe|object|embed|form|link|meta|base|svg|math|script|style)\b[^>]*\/?>/gi;
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function isSafeUrl(value) {
  const v = value.trim().toLowerCase();
  if (v.startsWith("javascript:")) return false;
  if (v.startsWith("data:")) return false;
  if (v.startsWith("vbscript:")) return false;
  return true;
}

function isSafeStyle(value) {
  const v = value.toLowerCase();
  if (v.includes("expression") || v.includes("url(") || v.includes("javascript:") || v.includes("</")) return false;
  const decls = value.split(";").map((s) => s.trim()).filter(Boolean);
  for (const decl of decls) {
    const idx = decl.indexOf(":");
    if (idx === -1) return false;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    if (!["color", "background-color", "font-size", "text-align"].includes(prop)) return false;
  }
  return true;
}

function sanitizeAttrs(tag, attrString) {
  const allowed = ALLOWED_ATTRS[tag] || [];
  if (!allowed.length) return "";
  let result = "";
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(attrString))) {
    const name = m[1].toLowerCase();
    const value = m[2] !== undefined ? m[2] : m[3];
    if (name.startsWith("on")) continue;
    if (!allowed.includes(name)) continue;
    if ((name === "href" || name === "src") && !isSafeUrl(value)) continue;
    if (name === "style" && !isSafeStyle(value)) continue;
    const safeValue = name === "target" ? "_blank" : value;
    result += ` ${name}="${safeValue.replace(/"/g, "&quot;")}"`;
  }
  if (tag === "a") result += ' rel="noopener noreferrer nofollow"';
  return result;
}

export function sanitizeHtml(html) {
  if (!html) return "";
  let out = html.replace(DANGEROUS_BLOCK_TAGS, "").replace(DANGEROUS_VOID_TAGS, "");

  out = out.replace(TAG_RE, (match, rawTagName, attrString) => {
    const tag = rawTagName.toLowerCase();
    const isClosing = match.charAt(1) === "/";
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (isClosing) return `</${tag}>`;
    return `<${tag}${sanitizeAttrs(tag, attrString)}>`;
  });

  return out;
}
