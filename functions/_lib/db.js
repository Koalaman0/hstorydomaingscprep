// Cloudflare D1 데이터 접근 계층. "게시"가 GitHub 커밋 없이 이 DB에 바로
// 쓰이기 때문에, 저장하는 순간 다음 요청부터 즉시 반영된다(재배포 불필요).

function rowToPost(row) {
  return {
    slug: row.slug,
    title: row.title || "",
    subtitle: row.subtitle || "",
    category: row.category || "",
    summary: row.summary || "",
    published: row.published || "",
    modified: row.modified || "",
    featured: !!row.featured,
    status: row.status || "published",
    body_html: row.body_html || "",
    body: row.body_json ? JSON.parse(row.body_json) : [],
    toc: row.toc_json ? JSON.parse(row.toc_json) : [],
    key_points: row.key_points_json ? JSON.parse(row.key_points_json) : [],
    mistakes: row.mistakes_json ? JSON.parse(row.mistakes_json) : [],
    checklist: row.checklist_json ? JSON.parse(row.checklist_json) : [],
    related: row.related_json ? JSON.parse(row.related_json) : [],
    faq: row.faq_json ? JSON.parse(row.faq_json) : [],
  };
}

function rowToColumn(row) {
  return {
    slug: row.slug,
    title: row.title || "",
    summary: row.summary || "",
    published: row.published || "",
    modified: row.modified || "",
    featured: !!row.featured,
    status: row.status || "published",
    body_html: row.body_html || "",
    body: row.body_json ? JSON.parse(row.body_json) : [],
  };
}

export async function loadSiteData(env) {
  const [configRow, catRows, postRows, colRows] = await Promise.all([
    env.DB.prepare("SELECT * FROM config WHERE id = 1").first(),
    env.DB.prepare("SELECT * FROM categories ORDER BY rowid").all(),
    env.DB.prepare("SELECT * FROM posts ORDER BY rowid").all(),
    env.DB.prepare("SELECT * FROM columns ORDER BY rowid").all(),
  ]);
  const SITE = configRow || {};
  const CATEGORIES = (catRows.results || []).map((r) => ({ slug: r.slug, name: r.name, desc: r.desc || "" }));
  const POSTS = (postRows.results || []).map(rowToPost);
  const COLUMNS = (colRows.results || []).map(rowToColumn);
  const PUBLISHED_POSTS = POSTS.filter((p) => p.status !== "draft");
  const PUBLISHED_COLUMNS = COLUMNS.filter((c) => c.status !== "draft");
  return { SITE, CATEGORIES, POSTS, COLUMNS, PUBLISHED_POSTS, PUBLISHED_COLUMNS };
}

export async function getPostBySlug(env, slug) {
  const row = await env.DB.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first();
  return row ? rowToPost(row) : null;
}

export async function getColumnBySlug(env, slug) {
  const row = await env.DB.prepare("SELECT * FROM columns WHERE slug = ?").bind(slug).first();
  return row ? rowToColumn(row) : null;
}

export async function upsertPost(env, p, origSlug) {
  if (origSlug && origSlug !== p.slug) {
    await env.DB.prepare("DELETE FROM posts WHERE slug = ?").bind(origSlug).run();
  }
  await env.DB.prepare(`
    INSERT INTO posts (slug, title, subtitle, category, summary, published, modified, featured, status,
      body_html, body_json, toc_json, key_points_json, mistakes_json, checklist_json, related_json, faq_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(slug) DO UPDATE SET
      title=excluded.title, subtitle=excluded.subtitle, category=excluded.category, summary=excluded.summary,
      published=excluded.published, modified=excluded.modified, featured=excluded.featured, status=excluded.status,
      body_html=excluded.body_html, body_json=excluded.body_json, toc_json=excluded.toc_json,
      key_points_json=excluded.key_points_json, mistakes_json=excluded.mistakes_json,
      checklist_json=excluded.checklist_json, related_json=excluded.related_json, faq_json=excluded.faq_json
  `).bind(
    p.slug, p.title || "", p.subtitle || "", p.category || "", p.summary || "",
    p.published || "", p.modified || "", p.featured ? 1 : 0, p.status || "published",
    p.body_html || "", JSON.stringify(p.body || []), JSON.stringify(p.toc || []),
    JSON.stringify(p.key_points || []), JSON.stringify(p.mistakes || []),
    JSON.stringify(p.checklist || []), JSON.stringify(p.related || []), JSON.stringify(p.faq || [])
  ).run();
}

export async function deletePost(env, slug) {
  await env.DB.prepare("DELETE FROM posts WHERE slug = ?").bind(slug).run();
}

export async function upsertColumn(env, c, origSlug) {
  if (origSlug && origSlug !== c.slug) {
    await env.DB.prepare("DELETE FROM columns WHERE slug = ?").bind(origSlug).run();
  }
  await env.DB.prepare(`
    INSERT INTO columns (slug, title, summary, published, modified, featured, status, body_html, body_json)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(slug) DO UPDATE SET
      title=excluded.title, summary=excluded.summary, published=excluded.published, modified=excluded.modified,
      featured=excluded.featured, status=excluded.status, body_html=excluded.body_html, body_json=excluded.body_json
  `).bind(
    c.slug, c.title || "", c.summary || "", c.published || "", c.modified || "",
    c.featured ? 1 : 0, c.status || "published", c.body_html || "", JSON.stringify(c.body || [])
  ).run();
}

export async function deleteColumn(env, slug) {
  await env.DB.prepare("DELETE FROM columns WHERE slug = ?").bind(slug).run();
}

export async function upsertCategory(env, cat, origSlug) {
  if (origSlug && origSlug !== cat.slug) {
    await env.DB.prepare("UPDATE posts SET category = ? WHERE category = ?").bind(cat.slug, origSlug).run();
    await env.DB.prepare("DELETE FROM categories WHERE slug = ?").bind(origSlug).run();
  }
  await env.DB.prepare(`
    INSERT INTO categories (slug, name, desc) VALUES (?,?,?)
    ON CONFLICT(slug) DO UPDATE SET name=excluded.name, desc=excluded.desc
  `).bind(cat.slug, cat.name || "", cat.desc || "").run();
}

export async function deleteCategory(env, slug) {
  const inUse = await env.DB.prepare("SELECT COUNT(*) AS n FROM posts WHERE category = ?").bind(slug).first();
  if (inUse && inUse.n > 0) {
    throw new Error("이 카테고리에 연결된 글이 있어 삭제할 수 없습니다.");
  }
  await env.DB.prepare("DELETE FROM categories WHERE slug = ?").bind(slug).run();
}

export async function updateConfig(env, cfg) {
  const allowed = ["name", "tagline", "topic", "audience", "main_color", "sub_color", "owner_name", "owner_bio", "email", "url", "hero_image_url"];
  const existing = await env.DB.prepare("SELECT * FROM config WHERE id = 1").first();
  const merged = { ...(existing || {}) };
  for (const key of allowed) {
    if (typeof cfg[key] === "string" && cfg[key] !== "") merged[key] = cfg[key];
  }
  await env.DB.prepare(`
    INSERT INTO config (id, name, tagline, topic, audience, main_color, sub_color, owner_name, owner_bio, email, url, hero_image_url)
    VALUES (1,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, tagline=excluded.tagline, topic=excluded.topic, audience=excluded.audience,
      main_color=excluded.main_color, sub_color=excluded.sub_color, owner_name=excluded.owner_name,
      owner_bio=excluded.owner_bio, email=excluded.email, url=excluded.url, hero_image_url=excluded.hero_image_url
  `).bind(
    merged.name || "", merged.tagline || "", merged.topic || "", merged.audience || "",
    merged.main_color || "", merged.sub_color || "", merged.owner_name || "", merged.owner_bio || "",
    merged.email || "", merged.url || "", merged.hero_image_url || ""
  ).run();
}
