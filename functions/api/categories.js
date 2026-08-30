import { isAuthedRequest } from "../_lib/auth.js";
import { upsertCategory, deleteCategory } from "../_lib/db.js";

function unauthorized() {
  return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost({ request, env }) {
  if (!(await isAuthedRequest(request, env))) return unauthorized();
  let raw;
  try {
    raw = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "잘못된 요청입니다." }), { status: 400 });
  }
  if (!raw.slug || !raw.name) {
    return new Response(JSON.stringify({ error: "이름과 슬러그가 필요합니다." }), { status: 400 });
  }
  const origSlug = raw.__origSlug || null;
  try {
    await upsertCategory(env, { slug: raw.slug, name: raw.name, desc: raw.desc || "" }, origSlug);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}

export async function onRequestDelete({ request, env }) {
  if (!(await isAuthedRequest(request, env))) return unauthorized();
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "잘못된 요청입니다." }), { status: 400 });
  }
  if (!payload.slug) return new Response(JSON.stringify({ error: "슬러그가 필요합니다." }), { status: 400 });
  try {
    await deleteCategory(env, payload.slug);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 400 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}
