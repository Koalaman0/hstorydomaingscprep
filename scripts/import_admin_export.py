# -*- coding: utf-8 -*-
"""
관리자(admin) 화면에서 "JSON export"로 내려받은 파일을 실제 사이트 데이터(data/content.json)에
반영하고, 정적 HTML 페이지를 다시 생성합니다.

사용법:
    python3 scripts/import_admin_export.py 다운로드한파일.json

동작:
  1. data/content.json(현재 사이트 데이터)을 불러옵니다.
  2. export 파일의 posts/columns를 관리자 폼 형식(bodyText, faqText, keyPointsText 등)에서
     사이트 렌더링에 쓰이는 구조(body 섹션 목록, faq 목록, key_points 목록 등)로 변환합니다.
  3. categories/config는 export 파일 값으로 갱신합니다. (config는 export에 없는 값은 기존 값을 유지합니다)
  4. data/content.json을 갱신하고, scripts/build.py의 build()를 호출해 전체 정적 페이지를 다시 만듭니다.

주의:
  - 이 스크립트는 "초안(draft)" 상태의 글/칼럼도 content.json에는 저장하지만,
    실제 공개 HTML 페이지는 "발행(published)" 상태인 항목에 대해서만 생성합니다.
  - 이미 존재하는 슬러그는 값이 덮어써집니다. 슬러그가 곧 식별자이므로,
    관리자 화면에서 슬러그를 함부로 바꾸면 다른 글이 되어버리니 주의하세요.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT_PATH = os.path.join(ROOT, "data", "content.json")


def parse_body_markdown(text):
    """'## 소제목' 줄로 섹션을 나누고, 빈 줄로 문단을 나누는 관리자 본문 포맷을 파싱합니다."""
    text = (text or "").replace("\r\n", "\n").strip()
    if not text:
        return [["본문", [""]]]

    lines = text.split("\n")
    sections = []
    current_heading = None
    current_lines = []

    def flush():
        if current_heading is not None:
            block = "\n".join(current_lines).strip()
            paragraphs = [p.strip() for p in block.split("\n\n") if p.strip()]
            if not paragraphs:
                paragraphs = [""]
            sections.append([current_heading, paragraphs])

    for line in lines:
        if line.strip().startswith("## "):
            flush()
            current_heading = line.strip()[3:].strip()
            current_lines = []
        else:
            current_lines.append(line)
    flush()

    if not sections:
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        sections = [["본문", paragraphs or [text]]]
    return sections


def parse_faq(text):
    faq = []
    for line in (text or "").split("\n"):
        line = line.strip()
        if not line or "|" not in line:
            continue
        q, a = line.split("|", 1)
        q, a = q.strip(), a.strip()
        if q and a:
            faq.append([q, a])
    return faq


def parse_lines(text):
    return [l.strip() for l in (text or "").split("\n") if l.strip()]


def convert_post(raw, existing_by_slug):
    slug = raw["slug"]
    existing = existing_by_slug.get(slug, {})

    if "bodyText" in raw:
        body = parse_body_markdown(raw["bodyText"])
    else:
        body = raw.get("body") or existing.get("body") or [["본문", [""]]]

    faq = parse_faq(raw["faqText"]) if "faqText" in raw else (raw.get("faq") or existing.get("faq") or [])
    key_points = parse_lines(raw["keyPointsText"]) if "keyPointsText" in raw else (raw.get("key_points") or existing.get("key_points") or [])
    mistakes = parse_lines(raw["mistakesText"]) if "mistakesText" in raw else (raw.get("mistakes") or existing.get("mistakes") or [])
    checklist = parse_lines(raw["checklistText"]) if "checklistText" in raw else (raw.get("checklist") or existing.get("checklist") or [])

    return {
        "slug": slug,
        "title": raw.get("title", existing.get("title", "")),
        "subtitle": raw.get("subtitle", existing.get("subtitle", "")),
        "category": raw.get("category", existing.get("category", "")),
        "summary": raw.get("summary", existing.get("summary", "")),
        "published": raw.get("published", existing.get("published", "")),
        "modified": raw.get("modified", existing.get("modified", "")),
        "featured": bool(raw.get("featured", existing.get("featured", False))),
        "status": raw.get("status", existing.get("status", "published")),
        "toc": [h for h, _ in body],
        "body": body,
        "body_html": raw.get("body_html", existing.get("body_html", "")),
        "key_points": key_points,
        "mistakes": mistakes,
        "checklist": checklist,
        "related": raw.get("related", existing.get("related", [])),
        "faq": faq,
    }


def convert_column(raw, existing_by_slug):
    slug = raw["slug"]
    existing = existing_by_slug.get(slug, {})

    if "bodyText" in raw:
        body = [p.strip() for p in raw["bodyText"].replace("\r\n", "\n").strip().split("\n\n") if p.strip()]
        if not body:
            body = [""]
    else:
        body = raw.get("body") or existing.get("body") or [""]

    return {
        "slug": slug,
        "title": raw.get("title", existing.get("title", "")),
        "summary": raw.get("summary", existing.get("summary", "")),
        "published": raw.get("published", existing.get("published", "")),
        "modified": raw.get("modified", existing.get("modified", "")),
        "featured": bool(raw.get("featured", existing.get("featured", False))),
        "status": raw.get("status", existing.get("status", "published")),
        "body": body,
        "body_html": raw.get("body_html", existing.get("body_html", "")),
    }


def main():
    if len(sys.argv) != 2:
        print("사용법: python3 scripts/import_admin_export.py <내보낸 JSON 파일 경로>")
        sys.exit(1)

    export_path = sys.argv[1]
    if not os.path.exists(export_path):
        print(f"파일을 찾을 수 없습니다: {export_path}")
        sys.exit(1)

    with open(export_path, encoding="utf-8") as f:
        export_data = json.load(f)

    with open(CONTENT_PATH, encoding="utf-8") as f:
        content = json.load(f)

    existing_posts_by_slug = {p["slug"]: p for p in content["posts"]}
    existing_cols_by_slug = {c["slug"]: c for c in content["columns"]}

    if "posts" in export_data:
        content["posts"] = [convert_post(p, existing_posts_by_slug) for p in export_data["posts"]]
    if "columns" in export_data:
        content["columns"] = [convert_column(c, existing_cols_by_slug) for c in export_data["columns"]]
    if "categories" in export_data:
        content["categories"] = [
            {"slug": c["slug"], "name": c["name"], "desc": c.get("desc", "")}
            for c in export_data["categories"]
        ]
    if "config" in export_data:
        content["config"].update({k: v for k, v in export_data["config"].items() if v not in (None, "")})

    with open(CONTENT_PATH, "w", encoding="utf-8") as f:
        json.dump(content, f, ensure_ascii=False, indent=2)

    print(f"data/content.json 갱신 완료 — 글 {len(content['posts'])}개, 칼럼 {len(content['columns'])}개, "
          f"카테고리 {len(content['categories'])}개")

    # 정적 페이지 재생성
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    import build as build_module
    build_module.build()


if __name__ == "__main__":
    main()
