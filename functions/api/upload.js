import { isAuthedRequest } from "../_lib/auth.js";
import { putBinaryFile } from "../_lib/github.js";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

function unauthorized() {
  return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function sanitizeBaseName(name) {
  return (name || "image")
    .toString()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "image";
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

  const mimeType = payload.mimeType;
  const ext = ALLOWED_MIME[mimeType];
  if (!ext) {
    return new Response(JSON.stringify({ error: "png/jpg/gif/webp 이미지만 업로드할 수 있습니다." }), { status: 400 });
  }

  const base64 = (payload.contentBase64 || "").replace(/\s/g, "");
  if (!base64) {
    return new Response(JSON.stringify({ error: "이미지 데이터가 비어 있습니다." }), { status: 400 });
  }
  // base64 텍스트 길이로 대략적인 바이트 크기를 추정해 용량을 제한한다.
  const approxBytes = base64.length * 0.75;
  if (approxBytes > MAX_BYTES) {
    return new Response(JSON.stringify({ error: "이미지는 5MB 이하만 업로드할 수 있습니다." }), { status: 400 });
  }

  const baseName = sanitizeBaseName(payload.filename);
  const path = `assets/uploads/${Date.now()}-${baseName}.${ext}`;

  try {
    await putBinaryFile(env, path, base64, `관리자: 이미지 업로드 (${baseName}.${ext})`);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true, url: `/${path}` }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
