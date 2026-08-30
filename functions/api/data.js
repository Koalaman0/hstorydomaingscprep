import { isAuthedRequest } from "../_lib/auth.js";
import { loadSiteData } from "../_lib/db.js";

// 관리자 화면(admin.js)이 대시보드/목록/에디터를 채우기 위해 부르는 endpoint.
// 항상 D1의 최신 상태를 그대로 돌려주므로, 로컬 캐시(localStorage)를
// 따로 두지 않아도 된다.
export async function onRequestGet({ request, env }) {
  if (!(await isAuthedRequest(request, env))) {
    return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const data = await loadSiteData(env);
  return new Response(JSON.stringify({
    ok: true,
    config: data.SITE,
    categories: data.CATEGORIES,
    posts: data.POSTS,
    columns: data.COLUMNS,
  }), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
