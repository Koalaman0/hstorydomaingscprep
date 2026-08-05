import { isAuthedRequest } from "../_lib/auth.js";
import { getFile, putFile } from "../_lib/github.js";
import { convertPost, convertColumn } from "../_lib/convert.js";

const CONTENT_PATH = "data/content.json";
const CONFIG_KEYS = [
  "name", "tagline", "topic", "audience", "main_color", "sub_color",
  "owner_name", "owner_bio", "email", "url", "hero_image_url",
];

function unauthorized() {
  return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost({ request, env }) {
  if (!(await isAuthedRequest(request, env))) return unauthorized();
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return new Response(JSON.stringify({ error: "서버에 GitHub 연동 설정(GITHUB_TOKEN/GITHUB_OWNER/GITHUB_REPO)이 없습니다." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "잘못된 요청입니다." }), { status: 400 });
  }

  let file;
  try {
    file = await getFile(env, CONTENT_PATH);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502 });
  }

  const content = JSON.parse(file.content);

  if (Array.isArray(payload.posts)) {
    const existingBySlug = new Map(content.posts.map((p) => [p.slug, p]));
    content.posts = payload.posts
      .filter((p) => p && typeof p.slug === "string" && p.slug)
      .map((p) => convertPost(p, existingBySlug));
  }

  if (Array.isArray(payload.columns)) {
    const existingBySlug = new Map(content.columns.map((c) => [c.slug, c]));
    content.columns = payload.columns
      .filter((c) => c && typeof c.slug === "string" && c.slug)
      .map((c) => convertColumn(c, existingBySlug));
  }

  if (Array.isArray(payload.categories)) {
    content.categories = payload.categories
      .filter((c) => c && typeof c.slug === "string" && typeof c.name === "string")
      .map((c) => ({ slug: c.slug, name: c.name, desc: c.desc || "" }));
  }

  if (payload.config && typeof payload.config === "object") {
    for (const key of CONFIG_KEYS) {
      if (typeof payload.config[key] === "string" && payload.config[key] !== "") {
        content.config[key] = payload.config[key];
      }
    }
  }

  const newContentStr = JSON.stringify(content, null, 2);

  try {
    await putFile(env, CONTENT_PATH, newContentStr, "관리자 화면에서 콘텐츠 업데이트", file.sha);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502 });
  }

  return new Response(JSON.stringify({
    ok: true,
    message: "저장되었습니다. Cloudflare Pages가 자동으로 다시 빌드/배포하며, 보통 1분 내로 실제 사이트에 반영됩니다.",
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
