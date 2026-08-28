/*
 * 히스토리노트 관리자(admin) 스크립트
 * 로그인 여부는 서버(/api/session, HttpOnly 쿠키 기반)로 확인합니다.
 * 편집 중인 내용은 이 브라우저의 localStorage에 임시로 보관되며,
 * "지금 사이트에 게시" 버튼을 누르면 /api/content로 전송되어
 * 저장소의 data/content.json에 커밋되고 사이트가 자동으로 재배포됩니다.
 */
(function () {
  var LS = {
    posts: "hn_posts",
    columns: "hn_columns",
    categories: "hn_categories",
    config: "hn_site_config",
  };

  // ---------------------------------------------------------------
  // 저장소 헬퍼
  // ---------------------------------------------------------------
  function loadJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, val) {
    window.localStorage.setItem(key, JSON.stringify(val));
  }
  function seedIfEmpty() {
    if (!window.localStorage.getItem(LS.posts) && window.HN_SEED) {
      saveJSON(LS.posts, window.HN_SEED.posts || []);
    }
    if (!window.localStorage.getItem(LS.columns) && window.HN_SEED) {
      saveJSON(LS.columns, window.HN_SEED.columns || []);
    }
    if (!window.localStorage.getItem(LS.categories) && window.HN_SEED) {
      saveJSON(LS.categories, window.HN_SEED.categories || []);
    }
    if (!window.localStorage.getItem(LS.config) && window.HN_SEED) {
      saveJSON(LS.config, window.HN_SEED.config || {});
    }
  }

  function getPosts() { return loadJSON(LS.posts, []); }
  function getColumns() { return loadJSON(LS.columns, []); }
  function getCategories() { return loadJSON(LS.categories, []); }
  function getConfig() { return loadJSON(LS.config, {}); }

  function slugifyInput(s) {
    return (s || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }
  function todayStr() {
    var d = new Date();
    return d.toISOString().slice(0, 10);
  }
  function esc(s) {
    return (s || "").toString()
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---------------------------------------------------------------
  // 로그인 (실제 인증은 서버의 /api/session이 판단)
  // ---------------------------------------------------------------
  function logout() {
    fetch("/api/logout", { method: "POST", credentials: "same-origin" }).then(function () {
      window.location.href = "/login/";
    });
  }

  // ---------------------------------------------------------------
  // 대시보드
  // ---------------------------------------------------------------
  function renderDashboard() {
    var posts = getPosts(), columns = getColumns(), cats = getCategories();
    var published = posts.filter(function (p) { return p.status !== "draft"; }).length;
    var draft = posts.length - published;
    var featured = posts.filter(function (p) { return p.featured; }).length;
    var recent = posts.concat(columns).sort(function (a, b) {
      return (b.modified || "").localeCompare(a.modified || "");
    }).slice(0, 6);

    var rows = recent.map(function (item) {
      var type = item.category ? "글" : "칼럼";
      return '<tr><td>' + esc(item.title) + '</td><td>' + type + '</td><td>' + esc(item.modified) + '</td>' +
        '<td><span class="status-pill ' + (item.status === "draft" ? "status-draft" : "status-published") + '">' +
        (item.status === "draft" ? "초안" : "발행") + '</span></td></tr>';
    }).join("");

    return (
      '<div class="stat-grid">' +
      statCard(posts.length, "총 글 수") +
      statCard(columns.length, "총 칼럼 수") +
      statCard(cats.length, "카테고리 수") +
      statCard(featured, "추천 글 수") +
      '</div>' +
      '<div class="admin-card">' +
      '  <h2 style="margin-top:0;">발행/초안 상태 요약</h2>' +
      '  <p style="color:var(--ink-faint);font-size:14px;">발행 ' + published + '건 &middot; 초안 ' + draft + '건</p>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h2 style="margin-top:0;">최근 수정 콘텐츠</h2>' +
      '  <table class="admin-table"><thead><tr><th>제목</th><th>유형</th><th>수정일</th><th>상태</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div>'
    );
  }
  function statCard(num, label) {
    return '<div class="stat-card"><div class="num">' + num + '</div><div class="label">' + label + '</div></div>';
  }

  // ---------------------------------------------------------------
  // 글 목록 / 편집 폼 (칼럼도 동일 폼 재사용, isColumn 플래그로 분기)
  // ---------------------------------------------------------------
  function renderList(items, kind) {
    var isColumn = kind === "column";
    var rows = items.map(function (item, idx) {
      return '<tr>' +
        '<td>' + esc(item.title) + (item.featured ? ' <span class="tag tag-featured" style="margin-left:6px;">추천</span>' : '') + '</td>' +
        '<td style="font-family:var(--font-mono);font-size:12.5px;color:var(--ink-faint);">' + esc(item.slug) + '</td>' +
        (isColumn ? '' : '<td>' + esc(catName(item.category)) + '</td>') +
        '<td>' + esc(item.modified) + '</td>' +
        '<td><span class="status-pill ' + (item.status === "draft" ? "status-draft" : "status-published") + '">' + (item.status === "draft" ? "초안" : "발행") + '</span></td>' +
        '<td class="row-actions">' +
        '<button data-act="edit" data-kind="' + kind + '" data-slug="' + esc(item.slug) + '">수정</button>' +
        '<button data-act="preview" data-kind="' + kind + '" data-slug="' + esc(item.slug) + '">미리보기</button>' +
        '<button data-act="delete" data-kind="' + kind + '" data-slug="' + esc(item.slug) + '">삭제</button>' +
        '</td></tr>';
    }).join("");
    var head = isColumn
      ? '<tr><th>제목</th><th>슬러그</th><th>수정일</th><th>상태</th><th>작업</th></tr>'
      : '<tr><th>제목</th><th>슬러그</th><th>카테고리</th><th>수정일</th><th>상태</th><th>작업</th></tr>';
    return '<table class="admin-table"><thead>' + head + '</thead><tbody>' + (rows || '<tr><td colspan="6" style="color:var(--ink-faint);">아직 등록된 항목이 없습니다.</td></tr>') + '</tbody></table>';
  }

  function catName(slug) {
    var c = getCategories().find(function (c) { return c.slug === slug; });
    return c ? c.name : slug;
  }

  function catOptions(selected) {
    return getCategories().map(function (c) {
      return '<option value="' + esc(c.slug) + '"' + (c.slug === selected ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join("");
  }

  function renderEditForm(kind, item) {
    var isColumn = kind === "column";
    item = item || { slug: "", title: "", subtitle: "", category: getCategories()[0] && getCategories()[0].slug,
      summary: "", body_html: "", faqText: "", related: "", featured: false, status: "draft",
      published: todayStr(), modified: todayStr() };
    var relatedText = item.related ? (Array.isArray(item.related) ? item.related.join(", ") : item.related) : "";
    var faqText = item.faqText || (item.faq ? faqToPlainText(item.faq) : "");
    var keyPointsText = item.keyPointsText || (item.key_points ? item.key_points.join("\n") : "");
    var mistakesText = item.mistakesText || (item.mistakes ? item.mistakes.join("\n") : "");
    var checklistText = item.checklistText || (item.checklist ? item.checklist.join("\n") : "");

    return (
      '<form id="edit-form" class="admin-card">' +
      '  <h2 style="margin-top:0;">' + (isColumn ? "칼럼" : "글") + (item._isNew ? " 새로 작성" : " 수정") + '</h2>' +
      '  <div class="form-grid">' +
      '    <div class="field"><label>제목</label><input type="text" name="title" value="' + esc(item.title) + '" required></div>' +
      '    <div class="field"><label>슬러그 <span class="hint">(URL에 쓰이는 짧은 영문 주소)</span></label><input type="text" name="slug" value="' + esc(item.slug) + '" required></div>' +
      (isColumn ? '' :
        '    <div class="field"><label>부제 / 요약 문장</label><input type="text" name="subtitle" value="' + esc(item.subtitle) + '"></div>' +
        '    <div class="field"><label>카테고리</label><select name="category">' + catOptions(item.category) + '</select></div>'
      ) +
      '    <div class="field"><label>요약(목록/메타에 노출)</label><textarea name="summary" rows="2">' + esc(item.summary) + '</textarea></div>' +
      '    <div class="field"><label>본문 <span class="hint">(소제목은 "제목 2/3" 서식을 쓰면 목차에 자동으로 반영됩니다)</span></label>' +
      '      <div id="rich-editor-wrap"><div id="rich-editor"></div></div>' +
      '      <input type="hidden" name="body_html">' +
      '    </div>' +
      (isColumn ? '' :
        '    <div class="field"><label>핵심 요약 <span class="hint">(한 줄에 하나씩)</span></label><textarea name="keyPointsText" rows="3">' + esc(keyPointsText) + '</textarea></div>' +
        '    <div class="field"><label>초보자가 자주 하는 실수 <span class="hint">(한 줄에 하나씩)</span></label><textarea name="mistakesText" rows="3">' + esc(mistakesText) + '</textarea></div>' +
        '    <div class="field"><label>체크리스트 <span class="hint">(한 줄에 하나씩)</span></label><textarea name="checklistText" rows="3">' + esc(checklistText) + '</textarea></div>' +
        '    <div class="field"><label>FAQ <span class="hint">(질문|답변, 한 줄에 하나 — 선택 사항)</span></label><textarea name="faqText" rows="3">' + esc(faqText) + '</textarea></div>' +
        '    <div class="field"><label>관련 글 슬러그 <span class="hint">(쉼표로 구분)</span></label><input type="text" name="related" value="' + esc(relatedText) + '"></div>' +
        '    <div class="checkbox-row"><input type="checkbox" id="featured" name="featured" ' + (item.featured ? "checked" : "") + '><label for="featured">추천 글로 노출</label></div>'
      ) +
      '    <div class="field"><label>발행 상태</label><select name="status"><option value="draft"' + (item.status === "draft" ? " selected" : "") + '>초안</option><option value="published"' + (item.status !== "draft" ? " selected" : "") + '>발행</option></select></div>' +
      '    <div class="field" style="display:flex;gap:14px;"><div style="flex:1;"><label>작성일</label><input type="date" name="published" value="' + esc(item.published) + '"></div><div style="flex:1;"><label>수정일</label><input type="date" name="modified" value="' + esc(item.modified) + '"></div></div>' +
      '  </div>' +
      '  <div style="display:flex;gap:10px;margin-top:20px;">' +
      '    <button type="submit" class="btn btn-primary">저장</button>' +
      '    <button type="button" id="preview-btn" class="btn btn-outline">미리보기</button>' +
      '    <button type="button" id="cancel-btn" class="btn btn-outline">목록으로</button>' +
      '  </div>' +
      '  <p style="font-size:12.5px;color:var(--ink-faint);margin-top:14px;">저장한 내용은 이 브라우저에만 임시로 남습니다. 실제 사이트에 반영하려면 사이트 설정 화면의 "지금 사이트에 게시"를 눌러주세요.</p>' +
      (item._isNew ? '' : '  <input type="hidden" name="__origSlug" value="' + esc(item.slug) + '">') +
      '</form>'
    );
  }
  function legacyBodyToHtml(sections) {
    if (!sections || !sections.length) return "";
    return sections.map(function (sec) {
      var heading = "<h2>" + esc(sec[0]) + "</h2>";
      var paras = sec[1].map(function (par) { return "<p>" + esc(par) + "</p>"; }).join("");
      return heading + paras;
    }).join("");
  }
  function legacyColumnBodyToHtml(paragraphs) {
    if (!paragraphs || !paragraphs.length) return "";
    return paragraphs.map(function (par) { return "<p>" + esc(par) + "</p>"; }).join("");
  }
  function faqToPlainText(faq) {
    if (!faq) return "";
    return faq.map(function (f) { return f[0] + "|" + f[1]; }).join("\n");
  }

  // ---------------------------------------------------------------
  // 카테고리 / 설정 뷰
  // ---------------------------------------------------------------
  function renderCategories() {
    var cats = getCategories();
    var rows = cats.map(function (c) {
      var count = getPosts().filter(function (p) { return p.category === c.slug; }).length;
      return '<tr><td>' + esc(c.name) + '</td><td style="font-family:var(--font-mono);font-size:12.5px;">' + esc(c.slug) + '</td><td>' + esc(c.desc) + '</td><td>' + count + '개</td>' +
        '<td class="row-actions">' +
        '<button data-cat-act="edit" data-slug="' + esc(c.slug) + '">수정</button>' +
        '<button data-cat-act="delete" data-slug="' + esc(c.slug) + '"' + (count > 0 ? ' disabled title="연결된 글이 있어 삭제할 수 없습니다"' : '') + '>삭제</button>' +
        '</td></tr>';
    }).join("");
    return (
      '<div style="display:flex;justify-content:flex-end;margin-bottom:14px;"><button id="new-cat-btn" class="btn btn-brass btn-sm">새 카테고리 추가</button></div>' +
      '<div class="admin-card"><h2 style="margin-top:0;">카테고리</h2>' +
      '<p style="color:var(--ink-faint);font-size:13.5px;">카테고리는 사이트의 정보 구조를 이루는 핵심 축입니다. 글이 연결된 카테고리는 삭제할 수 없습니다.</p>' +
      '<table class="admin-table"><thead><tr><th>이름</th><th>슬러그</th><th>소개</th><th>연결된 글</th><th>작업</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    );
  }

  function renderCategoryEditForm(cat) {
    cat = cat || { _isNew: true, slug: "", name: "", desc: "" };
    return (
      '<form id="cat-edit-form" class="admin-card">' +
      '  <h2 style="margin-top:0;">카테고리 ' + (cat._isNew ? "추가" : "수정") + '</h2>' +
      '  <div class="form-grid">' +
      '    <div class="field"><label>이름</label><input type="text" name="name" value="' + esc(cat.name) + '" required></div>' +
      '    <div class="field"><label>슬러그 <span class="hint">(URL에 쓰이는 짧은 영문 주소)</span></label><input type="text" name="slug" value="' + esc(cat.slug) + '" required></div>' +
      '    <div class="field"><label>소개 문구</label><textarea name="desc" rows="2">' + esc(cat.desc) + '</textarea></div>' +
      '  </div>' +
      '  <div style="display:flex;gap:10px;margin-top:20px;">' +
      '    <button type="submit" class="btn btn-primary">저장</button>' +
      '    <button type="button" id="cat-cancel-btn" class="btn btn-outline">목록으로</button>' +
      '  </div>' +
      (cat._isNew ? '' : '  <input type="hidden" name="__origSlug" value="' + esc(cat.slug) + '">') +
      '</form>'
    );
  }

  function bindCategoryActions() {
    var newBtn = document.getElementById("new-cat-btn");
    if (newBtn) newBtn.addEventListener("click", function () { openCategoryEdit(null); });
    document.querySelectorAll('[data-cat-act]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.dataset.catAct, slug = btn.dataset.slug;
        if (act === "edit") openCategoryEdit(slug);
        else if (act === "delete") deleteCategory(slug);
      });
    });
  }

  function openCategoryEdit(slug) {
    var cats = getCategories();
    var cat = slug ? cats.find(function (c) { return c.slug === slug; }) : null;
    var body = document.getElementById("admin-view-body");
    body.innerHTML = renderCategoryEditForm(cat);
    document.getElementById("cat-cancel-btn").addEventListener("click", function () { navigate("categories"); });
    document.getElementById("cat-edit-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      var newSlug = slugifyInput(f.slug.value) || slugifyInput(f.name.value);
      var origSlug = f.__origSlug ? f.__origSlug.value : null;
      var record = { slug: newSlug, name: f.name.value.trim(), desc: f.desc.value.trim() };
      var list = getCategories();
      var idx = list.findIndex(function (c) { return c.slug === (origSlug || "__none__"); });
      if (idx > -1) list[idx] = record; else list.push(record);
      saveJSON(LS.categories, list);
      navigate("categories");
    });
  }

  function deleteCategory(slug) {
    var inUse = getPosts().some(function (p) { return p.category === slug; });
    if (inUse) { alert("이 카테고리에 연결된 글이 있어 삭제할 수 없습니다. 먼저 해당 글의 카테고리를 변경해 주세요."); return; }
    if (!window.confirm("카테고리를 삭제하시겠습니까?")) return;
    var list = getCategories().filter(function (c) { return c.slug !== slug; });
    saveJSON(LS.categories, list);
    navigate("categories");
  }

  function renderSettings() {
    var c = getConfig();
    return (
      '<form id="settings-form" class="admin-card">' +
      '  <h2 style="margin-top:0;">사이트 설정</h2>' +
      '  <div class="form-grid">' +
      '    <div class="field"><label>사이트명</label><input type="text" name="name" value="' + esc(c.name) + '"></div>' +
      '    <div class="field"><label>한줄 소개</label><input type="text" name="tagline" value="' + esc(c.tagline) + '"></div>' +
      '    <div class="field"><label>운영자명</label><input type="text" name="owner_name" value="' + esc(c.owner_name) + '"></div>' +
      '    <div class="field"><label>운영자 소개 문구</label><textarea name="owner_bio" rows="2">' + esc(c.owner_bio) + '</textarea></div>' +
      '    <div class="field"><label>연락 이메일</label><input type="email" name="email" value="' + esc(c.email) + '"></div>' +
      '    <div class="field" style="display:flex;gap:14px;"><div style="flex:1;"><label>메인 컬러</label><input type="text" name="main_color" value="' + esc(c.main_color) + '"></div><div style="flex:1;"><label>서브 컬러</label><input type="text" name="sub_color" value="' + esc(c.sub_color) + '"></div></div>' +
      '    <div class="field"><label>기본 도메인</label><input type="text" name="url" value="' + esc(c.url) + '"></div>' +
      '    <div class="field"><label>히어로 배경 이미지 URL <span class="hint">(비워두면 기본 배경을 사용합니다)</span></label><input type="text" name="hero_image_url" value="' + esc(c.hero_image_url) + '" placeholder="https://..."></div>' +
      '  </div>' +
      '  <button type="submit" class="btn btn-primary" style="margin-top:18px;">설정 저장 (임시 보관)</button>' +
      '  <p style="font-size:12.5px;color:var(--ink-faint);margin-top:14px;">이 화면에서 저장한 값은 이 브라우저에만 임시로 남습니다. 아래 "지금 사이트에 게시"를 눌러야 실제 사이트에 반영됩니다.</p>' +
      '</form>' +
      '<div class="admin-card">' +
      '  <h2 style="margin-top:0;">사이트에 게시</h2>' +
      '  <p style="color:var(--ink-faint);font-size:13.5px;">현재 이 브라우저에 임시 보관된 글/칼럼/카테고리/설정을 실제 사이트에 반영합니다. 저장소에 자동으로 커밋되고, 보통 1분 내로 배포가 완료됩니다.</p>' +
      '  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">' +
      '    <button type="button" id="publish-btn" class="btn btn-brass">지금 사이트에 게시</button>' +
      '    <span id="publish-status" style="font-size:13px;color:var(--ink-faint);"></span>' +
      '  </div>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h2 style="margin-top:0;">데이터 내보내기 / 가져오기 (백업용)</h2>' +
      '  <p style="color:var(--ink-faint);font-size:13.5px;">현재 글/칼럼/카테고리/설정 데이터를 JSON 파일로 내보내거나, 이전에 내보낸 JSON을 다시 불러올 수 있습니다.</p>' +
      '  <div style="display:flex;gap:10px;flex-wrap:wrap;">' +
      '    <button type="button" id="export-btn" class="btn btn-outline btn-sm">JSON export</button>' +
      '    <label class="btn btn-outline btn-sm" style="cursor:pointer;">JSON import<input type="file" id="import-input" accept="application/json" style="display:none;"></label>' +
      '    <button type="button" id="reset-btn" class="btn btn-danger btn-sm">기본 데이터로 초기화</button>' +
      '  </div>' +
      '</div>'
    );
  }

  // ---------------------------------------------------------------
  // 메인 렌더 / 라우팅
  // ---------------------------------------------------------------
  var state = { view: "dashboard", editKind: null, editSlug: null };

  function render() {
    var root = document.getElementById("admin-root");
    root.innerHTML = '<p style="padding:40px;text-align:center;color:var(--ink-faint);">로그인 확인 중...</p>';
    fetch("/api/session", { credentials: "same-origin" })
      .then(function (res) { return res.ok ? res.json() : { admin: false }; })
      .catch(function () { return { admin: false }; })
      .then(function (data) {
        if (!data.admin) {
          window.location.href = "/login/";
          return;
        }
        renderDashboardShell(root);
      });
  }

  function renderDashboardShell(root) {
    seedIfEmpty();
    var cfg = getConfig();
    root.innerHTML =
      '<div class="admin-shell">' +
      '  <aside class="admin-sidebar">' +
      '    <div class="brand"><span class="brand-mark" aria-hidden="true">HN</span><span class="brand-text"><strong>' + esc(cfg.name || "히스토리노트") + '</strong><small>관리자 모드</small></span></div>' +
      '    <nav class="admin-nav">' +
      '      <button data-view="dashboard">대시보드</button>' +
      '      <button data-view="posts">일반 글 관리</button>' +
      '      <button data-view="columns">칼럼 관리</button>' +
      '      <button data-view="categories">카테고리</button>' +
      '      <button data-view="settings">사이트 설정</button>' +
      '    </nav>' +
      '    <div class="admin-sidebar-foot">관리자로 로그인됨<br><a href="/" style="color:#D9C29A;">&larr; 사이트로 이동</a><br><button id="sidebar-logout" style="background:none;border:none;color:#D9C29A;cursor:pointer;padding:0;margin-top:6px;">로그아웃</button></div>' +
      '  </aside>' +
      '  <div class="admin-main">' +
      '    <div class="admin-topbar"><h1 id="admin-title">대시보드</h1></div>' +
      '    <div id="admin-view-body"></div>' +
      '  </div>' +
      '</div>';

    document.querySelectorAll(".admin-nav button").forEach(function (btn) {
      btn.addEventListener("click", function () { navigate(btn.dataset.view); });
    });
    document.getElementById("sidebar-logout").addEventListener("click", logout);

    var hash = window.location.hash.replace("#", "");
    if (hash === "post-new") { navigate("posts"); openEdit("post", null); }
    else if (hash === "column-new") { navigate("columns"); openEdit("column", null); }
    else { navigate(state.view); }
  }

  var titles = { dashboard: "대시보드", posts: "일반 글 관리", columns: "칼럼 관리", categories: "카테고리", settings: "사이트 설정" };

  function navigate(view) {
    state.view = view;
    document.getElementById("admin-title").textContent = titles[view] || view;
    document.querySelectorAll(".admin-nav button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === view);
    });
    var body = document.getElementById("admin-view-body");
    if (view === "dashboard") body.innerHTML = renderDashboard();
    else if (view === "posts") { body.innerHTML = listView("post"); bindListActions("post"); }
    else if (view === "columns") { body.innerHTML = listView("column"); bindListActions("column"); }
    else if (view === "categories") { body.innerHTML = renderCategories(); bindCategoryActions(); }
    else if (view === "settings") { body.innerHTML = renderSettings(); bindSettings(); }
  }

  function listView(kind) {
    var isColumn = kind === "column";
    var items = isColumn ? getColumns() : getPosts();
    return (
      '<div style="display:flex;justify-content:flex-end;margin-bottom:14px;">' +
      '<button id="new-item-btn" class="btn btn-brass btn-sm">' + (isColumn ? "새 칼럼 작성" : "새 글 작성") + '</button>' +
      '</div>' +
      '<div class="admin-card">' + renderList(items, kind) + '</div>'
    );
  }

  function bindListActions(kind) {
    var newBtn = document.getElementById("new-item-btn");
    if (newBtn) newBtn.addEventListener("click", function () { openEdit(kind, null); });
    document.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.dataset.act, k = btn.dataset.kind, slug = btn.dataset.slug;
        if (act === "edit") openEdit(k, slug);
        else if (act === "preview") previewItem(k, slug);
        else if (act === "delete") deleteItem(k, slug);
      });
    });
  }

  // ---------------------------------------------------------------
  // 리치 텍스트 에디터 (Quill) — 글씨 크기/색/이미지 삽입 지원
  // ---------------------------------------------------------------
  var currentQuill = null;

  function ensureQuillFormatsRegistered() {
    if (window.__hnQuillFormatsRegistered) return;
    window.__hnQuillFormatsRegistered = true;
    ["size", "color", "background", "align"].forEach(function (name) {
      try {
        var Attr = Quill.import("attributors/style/" + name);
        if (name === "size") Attr.whitelist = ["14px", "16px", "20px", "24px", "32px"];
        Quill.register(Attr, true);
      } catch (e) { /* 버전에 따라 없을 수 있어 무시 */ }
    });
  }

  function createRichEditor(initialHtml) {
    ensureQuillFormatsRegistered();
    var quill = new Quill("#rich-editor", {
      theme: "snow",
      modules: {
        toolbar: [
          [{ header: [2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ size: ["14px", false, "20px", "24px", "32px"] }],
          [{ color: [] }, { background: [] }],
          [{ align: [] }],
          [{ list: "ordered" }, { list: "bullet" }],
          ["blockquote", "link", "image"],
          ["clean"],
        ],
      },
    });
    if (initialHtml) quill.root.innerHTML = initialHtml;

    quill.getModule("toolbar").addHandler("image", function () {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/gif,image/webp";
      input.addEventListener("change", function () {
        var file = input.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { alert("이미지는 5MB 이하만 업로드할 수 있습니다."); return; }
        var range = quill.getSelection(true);
        var reader = new FileReader();
        reader.onload = function () {
          var base64 = String(reader.result).split(",")[1];
          fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ filename: file.name, mimeType: file.type, contentBase64: base64 }),
          })
            .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
            .then(function (result) {
              if (result.ok) {
                quill.insertEmbed(range.index, "image", result.data.url, "user");
                quill.setSelection(range.index + 1);
              } else {
                alert("이미지 업로드 실패: " + (result.data.error || "알 수 없는 오류"));
              }
            })
            .catch(function () { alert("이미지 업로드 중 문제가 발생했습니다."); });
        };
        reader.readAsDataURL(file);
      });
      input.click();
    });

    return quill;
  }

  function openEdit(kind, slug) {
    var isColumn = kind === "column";
    var items = isColumn ? getColumns() : getPosts();
    var item = slug ? items.find(function (i) { return i.slug === slug; }) : null;
    if (item) item = Object.assign({}, item);
    else item = { _isNew: true };
    var body = document.getElementById("admin-view-body");
    body.innerHTML = renderEditForm(kind, item);

    var initialHtml = item.body_html || (isColumn ? legacyColumnBodyToHtml(item.body) : legacyBodyToHtml(item.body));
    currentQuill = createRichEditor(initialHtml);

    document.getElementById("cancel-btn").addEventListener("click", function () { navigate(isColumn ? "columns" : "posts"); });
    document.getElementById("preview-btn").addEventListener("click", function () {
      var f = document.getElementById("edit-form");
      var text = currentQuill.getText();
      alert("제목: " + f.title.value + "\n\n요약: " + f.summary.value + "\n\n본문 미리보기:\n" + text.slice(0, 400) + (text.length > 400 ? "..." : ""));
    });
    document.getElementById("edit-form").addEventListener("submit", function (e) {
      e.preventDefault();
      e.target.body_html.value = currentQuill.root.innerHTML;
      saveItem(kind, e.target, item);
    });
  }

  function saveItem(kind, form, original) {
    var isColumn = kind === "column";
    var data = isColumn ? getColumns() : getPosts();
    var slug = slugifyInput(form.slug.value) || slugifyInput(form.title.value);
    var origSlug = original && original.slug;
    var record = {
      slug: slug,
      title: form.title.value.trim(),
      summary: form.summary.value.trim(),
      body_html: form.body_html.value,
      status: form.status.value,
      published: form.published.value || todayStr(),
      modified: form.modified.value || todayStr(),
    };
    if (!isColumn) {
      record.subtitle = form.subtitle.value.trim();
      record.category = form.category.value;
      record.faqText = form.faqText.value;
      record.keyPointsText = form.keyPointsText.value;
      record.mistakesText = form.mistakesText.value;
      record.checklistText = form.checklistText.value;
      record.related = form.related.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      record.featured = form.featured.checked;
    }
    var existingIdx = data.findIndex(function (d) { return d.slug === (origSlug || "__none__"); });
    if (existingIdx > -1) data[existingIdx] = Object.assign({}, data[existingIdx], record);
    else data.push(record);
    saveJSON(isColumn ? LS.columns : LS.posts, data);
    navigate(isColumn ? "columns" : "posts");
  }

  function deleteItem(kind, slug) {
    if (!window.confirm("정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    var isColumn = kind === "column";
    var key = isColumn ? LS.columns : LS.posts;
    var data = loadJSON(key, []).filter(function (d) { return d.slug !== slug; });
    saveJSON(key, data);
    navigate(isColumn ? "columns" : "posts");
  }

  function previewItem(kind, slug) {
    var isColumn = kind === "column";
    var items = isColumn ? getColumns() : getPosts();
    var item = items.find(function (i) { return i.slug === slug; });
    if (!item) return;
    var path = isColumn ? "/columns/" + slug + "/" : "/posts/" + slug + "/";
    window.open(path, "_blank");
  }

  function bindSettings() {
    document.getElementById("settings-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target;
      var cfg = {
        name: f.name.value, tagline: f.tagline.value, owner_name: f.owner_name.value,
        owner_bio: f.owner_bio.value, email: f.email.value, main_color: f.main_color.value,
        sub_color: f.sub_color.value, url: f.url.value, hero_image_url: f.hero_image_url.value,
      };
      saveJSON(LS.config, cfg);
      alert("이 브라우저에 임시 저장되었습니다. 실제 사이트에 반영하려면 '지금 사이트에 게시'를 눌러주세요.");
      navigate("settings");
    });
    document.getElementById("publish-btn").addEventListener("click", function () {
      var statusEl = document.getElementById("publish-status");
      var btn = document.getElementById("publish-btn");
      var payload = { posts: getPosts(), columns: getColumns(), categories: getCategories(), config: getConfig() };
      btn.disabled = true;
      statusEl.textContent = "게시 중...";
      fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          btn.disabled = false;
          if (result.ok) {
            statusEl.textContent = result.data.message || "게시되었습니다.";
          } else {
            statusEl.textContent = "게시 실패: " + (result.data.error || "알 수 없는 오류");
          }
        })
        .catch(function () {
          btn.disabled = false;
          statusEl.textContent = "게시 요청 중 문제가 발생했습니다.";
        });
    });
    document.getElementById("export-btn").addEventListener("click", function () {
      var payload = { posts: getPosts(), columns: getColumns(), categories: getCategories(), config: getConfig() };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "historynote-data-export.json";
      a.click();
    });
    document.getElementById("import-input").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(reader.result);
          if (parsed.posts) saveJSON(LS.posts, parsed.posts);
          if (parsed.columns) saveJSON(LS.columns, parsed.columns);
          if (parsed.categories) saveJSON(LS.categories, parsed.categories);
          if (parsed.config) saveJSON(LS.config, parsed.config);
          alert("가져오기가 완료되었습니다.");
          navigate("dashboard");
        } catch (err) {
          alert("JSON 파일을 읽는 중 문제가 발생했습니다. 형식을 확인해 주세요.");
        }
      };
      reader.readAsText(file);
    });
    document.getElementById("reset-btn").addEventListener("click", function () {
      if (!window.confirm("현재 브라우저에 저장된 편집 내용을 모두 지우고 기본 데이터로 되돌립니다. 계속할까요?")) return;
      Object.values(LS).forEach(function (k) { window.localStorage.removeItem(k); });
      seedIfEmpty();
      navigate("dashboard");
    });
  }

  document.addEventListener("DOMContentLoaded", render);
})();
