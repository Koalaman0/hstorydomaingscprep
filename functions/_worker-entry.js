import { onRequestPost as loginPost } from "./api/login.js";
import { onRequestPost as logoutPost } from "./api/logout.js";
import { onRequestGet as sessionGet } from "./api/session.js";
import { onRequestPost as uploadPost } from "./api/upload.js";
import { onRequestGet as mediaGet, onRequestDelete as mediaDelete } from "./api/media.js";
import { onRequestPost as postsPost, onRequestDelete as postsDelete } from "./api/posts.js";
import { onRequestPost as columnsPost, onRequestDelete as columnsDelete } from "./api/columns.js";
import { onRequestPost as categoriesPost, onRequestDelete as categoriesDelete } from "./api/categories.js";
import { onRequestPost as configPost } from "./api/config.js";
import { onRequestGet as dataGet } from "./api/data.js";

import { loadSiteData } from "./_lib/db.js";
import * as R from "./_lib/render.js";

async function handleApi(url, request, env, ctxArgs) {
  const c = { request, env, waitUntil: ctxArgs.waitUntil };
  const p = url.pathname;
  const m = request.method;

  if (p === "/api/login" && m === "POST") return loginPost(c);
  if (p === "/api/logout" && m === "POST") return logoutPost(c);
  if (p === "/api/session" && m === "GET") return sessionGet(c);
  if (p === "/api/upload" && m === "POST") return uploadPost(c);
  if (p === "/api/media" && m === "GET") return mediaGet(c);
  if (p === "/api/media" && m === "DELETE") return mediaDelete(c);
  if (p === "/api/posts" && m === "POST") return postsPost(c);
  if (p === "/api/posts" && m === "DELETE") return postsDelete(c);
  if (p === "/api/columns" && m === "POST") return columnsPost(c);
  if (p === "/api/columns" && m === "DELETE") return columnsDelete(c);
  if (p === "/api/categories" && m === "POST") return categoriesPost(c);
  if (p === "/api/categories" && m === "DELETE") return categoriesDelete(c);
  if (p === "/api/config" && m === "POST") return configPost(c);
  if (p === "/api/data" && m === "GET") return dataGet(c);
  return null;
}

async function handleMedia(url, env) {
  const key = decodeURIComponent(url.pathname.replace(/^\/media\//, ""));
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
}

const HTML_HEADERS = { "Content-Type": "text/html; charset=UTF-8" };

function htmlResponse(body, status = 200) {
  return new Response(body, { status, headers: HTML_HEADERS });
}

async function handlePage(url, env) {
  const p = url.pathname;
  const data = await loadSiteData(env);

  if (p === "/" || p === "/index.html") return htmlResponse(R.renderHome(data));
  if (p === "/about/") return htmlResponse(R.renderAbout(data));
  if (p === "/author/") return htmlResponse(R.renderAuthor(data));
  if (p === "/contact/") return htmlResponse(R.renderContact(data));
  if (p === "/login/") return htmlResponse(R.renderLogin(data));
  if (p === "/privacy/") return htmlResponse(R.renderPrivacy(data));
  if (p === "/terms/") return htmlResponse(R.renderTerms(data));
  if (p === "/disclaimer/") return htmlResponse(R.renderDisclaimer(data));
  if (p === "/sitemap/") return htmlResponse(R.renderSitemapHtml(data));
  if (p === "/admin/") return htmlResponse(R.renderAdmin(data));
  if (p === "/robots.txt") return new Response(R.renderRobotsTxt(data), { headers: { "Content-Type": "text/plain; charset=UTF-8" } });
  if (p === "/sitemap.xml") return new Response(R.renderSitemapXml(data), { headers: { "Content-Type": "application/xml; charset=UTF-8" } });
  if (p === "/404.html") return htmlResponse(R.render404(data), 404);

  if (p === "/categories/") return htmlResponse(R.renderCategoriesList(data));
  let m = p.match(/^\/categories\/([^/]+)\/$/);
  if (m) {
    const c = data.CATEGORIES.find((x) => x.slug === m[1]);
    if (!c) return htmlResponse(R.render404(data), 404);
    return htmlResponse(R.renderCategoryDetail(data, c));
  }

  if (p === "/columns/") return htmlResponse(R.renderColumnsList(data));
  m = p.match(/^\/columns\/([^/]+)\/$/);
  if (m) {
    const col = R.colBySlug(data, m[1]);
    if (!col) return htmlResponse(R.render404(data), 404);
    return htmlResponse(R.renderColumnDetail(data, col));
  }

  m = p.match(/^\/posts\/([^/]+)\/$/);
  if (m) {
    const post = R.postBySlug(data, m[1]);
    if (!post) return htmlResponse(R.render404(data), 404);
    return htmlResponse(R.renderPostDetail(data, post));
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const res = await handleApi(url, request, env, ctx);
      if (res) return res;
    }

    if (url.pathname.startsWith("/media/")) {
      return handleMedia(url, env);
    }

    try {
      const pageRes = await handlePage(url, env);
      if (pageRes) return pageRes;
    } catch (e) {
      return new Response("Internal Error: " + (e && e.message), { status: 500 });
    }

    // 알려진 동적 라우트가 아니면 정적 자산(css/js/아이콘 등)으로 넘긴다.
    const assetRes = await env.ASSETS.fetch(request);
    if (assetRes.status !== 404) return assetRes;

    // 자산도 아니면 진짜 없는 경로 — 사이트 톤에 맞는 404 페이지를 보여준다.
    const data = await loadSiteData(env);
    return htmlResponse(R.render404(data), 404);
  },
};
