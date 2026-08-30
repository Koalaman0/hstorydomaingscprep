import { isAuthedRequest } from "../_lib/auth.js";
import { updateConfig } from "../_lib/db.js";

export async function onRequestPost({ request, env }) {
  if (!(await isAuthedRequest(request, env))) {
    return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  let raw;
  try {
    raw = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "잘못된 요청입니다." }), { status: 400 });
  }
  try {
    await updateConfig(env, raw);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}
