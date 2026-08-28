import { timingSafeEqual, createSessionToken, setSessionCookieHeader } from "../_lib/auth.js";
import { checkLoginRateLimit, recordLoginFailure, clearLoginFailures } from "../_lib/ratelimit.js";

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return new Response(JSON.stringify({ error: "서버에 관리자 로그인 설정(ADMIN_PASSWORD/SESSION_SECRET)이 없습니다." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rl = await checkLoginRateLimit(env, request);
  if (rl.limited) {
    return new Response(JSON.stringify({ error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfter) },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "잘못된 요청입니다." }), { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!timingSafeEqual(password, env.ADMIN_PASSWORD)) {
    await recordLoginFailure(env, rl.key, rl.count);
    return new Response(JSON.stringify({ error: "비밀번호가 올바르지 않습니다." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  await clearLoginFailures(env, rl.key);
  const token = await createSessionToken(env.SESSION_SECRET);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": setSessionCookieHeader(token),
    },
  });
}
