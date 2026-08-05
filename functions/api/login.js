import { timingSafeEqual, createSessionToken, setSessionCookieHeader } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return new Response(JSON.stringify({ error: "서버에 관리자 로그인 설정(ADMIN_PASSWORD/SESSION_SECRET)이 없습니다." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
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
    return new Response(JSON.stringify({ error: "비밀번호가 올바르지 않습니다." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = await createSessionToken(env.SESSION_SECRET);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": setSessionCookieHeader(token),
    },
  });
}
