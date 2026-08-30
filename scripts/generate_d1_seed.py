# -*- coding: utf-8 -*-
"""
data/content.json을 읽어서 D1에 넣을 seed SQL(d1/seed.sql)을 만든다.
D1로 처음 옮길 때 딱 한 번만 실행하면 된다 (그 이후로는 관리자 화면이
D1에 직접 쓰므로 이 스크립트를 다시 실행할 필요가 없다).

사용법: python3 scripts/generate_d1_seed.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT_PATH = os.path.join(ROOT, "data", "content.json")
OUT_PATH = os.path.join(ROOT, "d1", "seed.sql")


def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_json(v):
    return sql_str(json.dumps(v if v is not None else [], ensure_ascii=False))


def main():
    with open(CONTENT_PATH, encoding="utf-8") as f:
        content = json.load(f)

    cfg = content["config"]
    lines = []
    lines.append("DELETE FROM config; DELETE FROM categories; DELETE FROM posts; DELETE FROM columns;")

    cfg_cols = ["name", "tagline", "topic", "audience", "main_color", "sub_color",
                "owner_name", "owner_bio", "email", "url", "hero_image_url"]
    cfg_vals = ", ".join(sql_str(cfg.get(k, "")) for k in cfg_cols)
    lines.append(f"INSERT INTO config (id, {', '.join(cfg_cols)}) VALUES (1, {cfg_vals});")

    for c in content["categories"]:
        lines.append(
            f"INSERT INTO categories (slug, name, desc) VALUES "
            f"({sql_str(c['slug'])}, {sql_str(c['name'])}, {sql_str(c.get('desc', ''))});"
        )

    for p in content["posts"]:
        lines.append(
            "INSERT INTO posts (slug, title, subtitle, category, summary, published, modified, "
            "featured, status, body_html, body_json, toc_json, key_points_json, mistakes_json, "
            "checklist_json, related_json, faq_json) VALUES ("
            + ", ".join([
                sql_str(p["slug"]), sql_str(p.get("title", "")), sql_str(p.get("subtitle", "")),
                sql_str(p.get("category", "")), sql_str(p.get("summary", "")),
                sql_str(p.get("published", "")), sql_str(p.get("modified", "")),
                "1" if p.get("featured") else "0", sql_str(p.get("status", "published")),
                sql_str(p.get("body_html", "")), sql_json(p.get("body", [])), sql_json(p.get("toc", [])),
                sql_json(p.get("key_points", [])), sql_json(p.get("mistakes", [])),
                sql_json(p.get("checklist", [])), sql_json(p.get("related", [])), sql_json(p.get("faq", [])),
            ])
            + ");"
        )

    for c in content["columns"]:
        lines.append(
            "INSERT INTO columns (slug, title, summary, published, modified, featured, status, "
            "body_html, body_json) VALUES ("
            + ", ".join([
                sql_str(c["slug"]), sql_str(c.get("title", "")), sql_str(c.get("summary", "")),
                sql_str(c.get("published", "")), sql_str(c.get("modified", "")),
                "1" if c.get("featured") else "0", sql_str(c.get("status", "published")),
                sql_str(c.get("body_html", "")), sql_json(c.get("body", [])),
            ])
            + ");"
        )

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"{OUT_PATH} 생성 완료 — 카테고리 {len(content['categories'])}개, "
          f"글 {len(content['posts'])}개, 칼럼 {len(content['columns'])}개")


if __name__ == "__main__":
    main()
