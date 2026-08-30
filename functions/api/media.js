import { isAuthedRequest } from "../_lib/auth.js";

const PREFIX = "uploads/";

function unauthorized() {
  return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet({ request, env }) {
  if (!(await isAuthedRequest(request, env))) return unauthorized();
  if (!env.MEDIA) {
    return new Response(JSON.stringify({ error: "서버에 이미지 저장소(R2) 설정이 없습니다." }), { status: 500 });
  }
  try {
    const listing = await env.MEDIA.list({ prefix: PREFIX });
    const items = listing.objects
      .map((o) => ({ name: o.key.slice(PREFIX.length), path: o.key, size: o.size, url: `/media/${o.key}` }))
      .sort((a, b) => (a.name < b.name ? 1 : -1));
    return new Response(JSON.stringify({ ok: true, items }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502 });
  }
}

export async function onRequestDelete({ request, env }) {
  if (!(await isAuthedRequest(request, env))) return unauthorized();
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "잘못된 요청입니다." }), { status: 400 });
  }
  const key = typeof payload.path === "string" ? payload.path : "";
  if (!key.startsWith(PREFIX) || key.includes("..")) {
    return new Response(JSON.stringify({ error: "잘못된 경로입니다." }), { status: 400 });
  }
  try {
    await env.MEDIA.delete(key);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}
