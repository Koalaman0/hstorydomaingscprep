import { isAuthedRequest } from "../_lib/auth.js";
import { listDir, deleteFile } from "../_lib/github.js";

const UPLOAD_DIR = "assets/uploads";

function unauthorized() {
  return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet({ request, env }) {
  if (!(await isAuthedRequest(request, env))) return unauthorized();
  try {
    const files = await listDir(env, UPLOAD_DIR);
    const items = files
      .map((f) => ({ name: f.name, path: f.path, sha: f.sha, size: f.size, url: `/${f.path}` }))
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

  const path = typeof payload.path === "string" ? payload.path : "";
  const sha = typeof payload.sha === "string" ? payload.sha : "";
  // 이 endpoint로는 assets/uploads/ 안의 파일만 지울 수 있게 제한한다 (다른 저장소 파일 보호).
  if (!path.startsWith(`${UPLOAD_DIR}/`) || path.includes("..") || !sha) {
    return new Response(JSON.stringify({ error: "잘못된 경로입니다." }), { status: 400 });
  }

  try {
    await deleteFile(env, path, sha, `관리자: 이미지 삭제 (${path})`);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
