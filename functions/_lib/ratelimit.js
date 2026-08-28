// 로그인 무차별 대입(brute-force) 방어. Cloudflare KV(RATE_LIMIT_KV 바인딩)에
// IP별 실패 횟수를 잠깐 저장해두고, 짧은 시간 안에 너무 많이 틀리면 막는다.
// KV 바인딩이 아직 설정되지 않았으면(로컬 개발 등) 그냥 통과시킨다 — 이 경우
// Cloudflare 대시보드의 WAF Rate Limiting 규칙으로 별도 방어를 권장한다.

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60; // 15분

function keyFor(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  return `login_fail:${ip}`;
}

export async function checkLoginRateLimit(env, request) {
  if (!env.RATE_LIMIT_KV) return { limited: false, key: null, count: 0 };
  const key = keyFor(request);
  const raw = await env.RATE_LIMIT_KV.get(key);
  const count = raw ? parseInt(raw, 10) || 0 : 0;
  if (count >= MAX_ATTEMPTS) {
    return { limited: true, retryAfter: WINDOW_SECONDS };
  }
  return { limited: false, key, count };
}

export async function recordLoginFailure(env, key, count) {
  if (!env.RATE_LIMIT_KV || !key) return;
  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS });
}

export async function clearLoginFailures(env, key) {
  if (!env.RATE_LIMIT_KV || !key) return;
  await env.RATE_LIMIT_KV.delete(key);
}
