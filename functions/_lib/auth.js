// 세션 쿠키 서명/검증 유틸.
// 실제 비밀번호나 세션 데이터를 저장하지 않고, "관리자로 로그인했다"는 사실만
// HMAC-SHA256으로 서명해 클라이언트 쿠키에 담습니다(서버 상태 저장 불필요).

export const SESSION_COOKIE = "hn_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12시간

function toBase64Url(bytes) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  const str = atob(padded);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(sig));
}

export function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) {
    // 길이가 달라도 동일한 시간이 걸리도록 더미 비교를 수행
    let dummy = 0;
    for (let i = 0; i < aBytes.length; i++) dummy |= aBytes[i];
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

export async function createSessionToken(secret) {
  const payload = JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const sig = await hmac(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifySessionToken(token, secret) {
  if (!token || token.indexOf(".") === -1) return false;
  const [payloadB64, sig] = token.split(".");
  const expectedSig = await hmac(secret, payloadB64);
  if (!timingSafeEqual(sig, expectedSig)) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    return typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch (e) {
    return false;
  }
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

export function setSessionCookieHeader(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function isAuthedRequest(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token || !env.SESSION_SECRET) return false;
  return verifySessionToken(token, env.SESSION_SECRET);
}
