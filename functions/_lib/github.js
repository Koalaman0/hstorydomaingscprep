// GitHub Contents API를 이용해 저장소의 data/content.json을 직접 커밋합니다.
// 이 커밋이 push로 반영되면 Cloudflare Pages가 자동으로 다시 빌드/배포합니다.

function apiBase(env) {
  return `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents`;
}

function authHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "User-Agent": "historynote-admin",
    Accept: "application/vnd.github+json",
  };
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export async function getFile(env, path) {
  const branch = env.GITHUB_BRANCH || "main";
  const res = await fetch(`${apiBase(env)}/${path}?ref=${encodeURIComponent(branch)}`, {
    headers: authHeaders(env),
  });
  if (!res.ok) {
    throw new Error(`GitHub getFile 실패 (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return { content: fromBase64(data.content), sha: data.sha };
}

export async function putFile(env, path, contentStr, message, sha) {
  return putRaw(env, path, toBase64(contentStr), message, sha);
}

// 이미지 등 바이너리 파일용 — content가 이미 base64로 인코딩되어 있다고 가정한다.
export async function putBinaryFile(env, path, base64Content, message) {
  return putRaw(env, path, base64Content, message, undefined);
}

async function putRaw(env, path, base64Content, message, sha) {
  const branch = env.GITHUB_BRANCH || "main";
  const res = await fetch(`${apiBase(env)}/${path}`, {
    method: "PUT",
    headers: { ...authHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: base64Content,
      sha,
      branch,
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub 저장 실패 (${res.status}): ${await res.text()}`);
  }
  return res.json();
}
