-- 히스토리노트 D1 스키마
-- Cloudflare 대시보드의 D1 콘솔에서 한 번만 실행하면 됩니다.

CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT,
  tagline TEXT,
  topic TEXT,
  audience TEXT,
  main_color TEXT,
  sub_color TEXT,
  owner_name TEXT,
  owner_bio TEXT,
  email TEXT,
  url TEXT,
  hero_image_url TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  desc TEXT
);

CREATE TABLE IF NOT EXISTS posts (
  slug TEXT PRIMARY KEY,
  title TEXT,
  subtitle TEXT,
  category TEXT,
  summary TEXT,
  published TEXT,
  modified TEXT,
  featured INTEGER DEFAULT 0,
  status TEXT DEFAULT 'published',
  body_html TEXT,
  body_json TEXT,
  toc_json TEXT,
  key_points_json TEXT,
  mistakes_json TEXT,
  checklist_json TEXT,
  related_json TEXT,
  faq_json TEXT
);

CREATE TABLE IF NOT EXISTS columns (
  slug TEXT PRIMARY KEY,
  title TEXT,
  summary TEXT,
  published TEXT,
  modified TEXT,
  featured INTEGER DEFAULT 0,
  status TEXT DEFAULT 'published',
  body_html TEXT,
  body_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_columns_status ON columns(status);
