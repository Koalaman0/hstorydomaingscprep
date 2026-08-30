/*
 * 히스토리노트 관리자(admin) 스크립트
 * 로그인 여부는 서버(/api/session, HttpOnly 쿠키 기반)로 확인합니다.
 * "저장"을 누르면 그 즉시 /api/posts, /api/columns, /api/categories, /api/config로
 * 전송되어 Cloudflare D1에 바로 반영됩니다 — 커밋/재배포를 기다릴 필요가 없습니다.
 * 상태를 "초안"으로 두면 저장은 되지만 공개 페이지에는 나타나지 않고,
 * "발행"으로 바꿔 저장하는 순간 실제 사이트에 나타납니다.
 */
(function () {
  var state = { view: "dashboard", data: { config: {}, categories: [], posts: [], columns: [] } };

  function getPosts() { return state.data.posts; }
  function getColumns() { return state.data.columns; }
  function getCategories() { return state.data.categories; }
  function getConfig() { return state.data.config; }

  function fetchData() {
    return fetch("/api/data", { credentials: "same-origin" })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (result) {
        if (result.ok) {
          state.data = {
            config: result.data.config || {},
            categories: result.data.categories || [],
            posts: result.data.posts || [],
            columns: result.data.columns || [],
          };
        }
        return result.ok;
      })
      .catch(function () { return false; });
  }

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
    var rows = items.map(function (item) {
      return '<tr>' +
        '<td><div>' + esc(item.title) + (item.featured ? ' <span class="tag tag-featured" style="margin-left:6px;">추천</span>' : '') + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:11.5px;color:var(--ink-faint);">' + esc(item.slug) + '</div></td>' +
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
      ? '<tr><th>제목</th><th>수정일</th><th>상태</th><th>작업</th></tr>'
      : '<tr><th>제목</th><th>카테고리</th><th>수정일</th><th>상태</th><th>작업</th></tr>';
    return '<table class="admin-table"><thead>' + head + '</thead><tbody>' + (rows || '<tr><td colspan="5" style="color:var(--ink-faint);">검색 결과가 없습니다.</td></tr>') + '</tbody></table>';
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
      '  <div class="form-grid-2">' +
      '    <div class="field"><label>제목</label><input type="text" name="title" value="' + esc(item.title) + '" required></div>' +
      '    <div class="field"><label>슬러그 <span class="hint">(URL 주소, 제목에서 자동 생성)</span></label><input type="text" name="slug" value="' + esc(item.slug) + '" required></div>' +
      (isColumn ? '' :
        '    <div class="field"><label>부제 / 요약 문장</label><input type="text" name="subtitle" value="' + esc(item.subtitle) + '"></div>' +
        '    <div class="field"><label>카테고리</label><select name="category">' + catOptions(item.category) + '</select></div>'
      ) +
      '    <div class="field field-full"><label>요약(목록/메타에 노출)</label><textarea name="summary" rows="2">' + esc(item.summary) + '</textarea></div>' +
      '  </div>' +
      '  <div class="editor-field">' +
      '    <label>본문 <span class="hint">("제목 2/3" 서식을 쓰면 목차에 자동으로 반영됩니다)</span></label>' +
      '    <div id="rich-editor-wrap"><div id="rich-editor"></div></div>' +
      '    <input type="hidden" name="body_html">' +
      '  </div>' +
      (isColumn ? '' :
        '  <details class="edit-extra">' +
        '    <summary>핵심 요약 · 실수 · 체크리스트 · FAQ · 관련 글 (선택 사항)</summary>' +
        '    <div class="form-grid-2">' +
        '      <div class="field"><label>핵심 요약 <span class="hint">(한 줄에 하나씩)</span></label><textarea name="keyPointsText" rows="3">' + esc(keyPointsText) + '</textarea></div>' +
        '      <div class="field"><label>초보자가 자주 하는 실수 <span class="hint">(한 줄에 하나씩)</span></label><textarea name="mistakesText" rows="3">' + esc(mistakesText) + '</textarea></div>' +
        '      <div class="field"><label>체크리스트 <span class="hint">(한 줄에 하나씩)</span></label><textarea name="checklistText" rows="3">' + esc(checklistText) + '</textarea></div>' +
        '      <div class="field"><label>FAQ <span class="hint">(질문|답변, 한 줄에 하나)</span></label><textarea name="faqText" rows="3">' + esc(faqText) + '</textarea></div>' +
        '      <div class="field field-full"><label>관련 글 슬러그 <span class="hint">(쉼표로 구분)</span></label><input type="text" name="related" value="' + esc(relatedText) + '"></div>' +
        '      <div class="checkbox-row field-full"><input type="checkbox" id="featured" name="featured" ' + (item.featured ? "checked" : "") + '><label for="featured">추천 글로 노출</label></div>' +
        '    </div>' +
        '  </details>'
      ) +
      '  <div class="form-grid-2" style="margin-top:16px;">' +
      '    <div class="field"><label>발행 상태</label><select name="status"><option value="draft"' + (item.status === "draft" ? " selected" : "") + '>초안</option><option value="published"' + (item.status !== "draft" ? " selected" : "") + '>발행</option></select></div>' +
      '    <div class="field" style="display:flex;gap:14px;"><div style="flex:1;"><label>작성일</label><input type="date" name="published" value="' + esc(item.published) + '"></div><div style="flex:1;"><label>수정일</label><input type="date" name="modified" value="' + esc(item.modified) + '"></div></div>' +
      '  </div>' +
      '  <div class="sticky-actions">' +
      '    <button type="submit" class="btn btn-primary">저장</button>' +
      '    <button type="button" id="preview-btn" class="btn btn-outline">미리보기</button>' +
      '    <button type="button" id="cancel-btn" class="btn btn-outline">목록으로</button>' +
      '    <span id="save-status" style="font-size:12.5px;color:var(--ink-faint);">"발행" 상태로 저장하면 바로 사이트에 반영됩니다.</span>' +
      '  </div>' +
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
      '  <div style="display:flex;gap:10px;margin-top:20px;align-items:center;">' +
      '    <button type="submit" class="btn btn-primary">저장</button>' +
      '    <button type="button" id="cat-cancel-btn" class="btn btn-outline">목록으로</button>' +
      '    <span id="cat-save-status" style="font-size:12.5px;color:var(--ink-faint);"></span>' +
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
      var statusEl = document.getElementById("cat-save-status");
      var newSlug = slugifyInput(f.slug.value) || slugifyInput(f.name.value);
      var origSlug = f.__origSlug ? f.__origSlug.value : null;
      var payload = { slug: newSlug, name: f.name.value.trim(), desc: f.desc.value.trim(), __origSlug: origSlug };
      statusEl.textContent = "저장 중...";
      apiCall("/api/categories", "POST", payload).then(function (result) {
        if (result.ok) { fetchData().then(function () { navigate("categories"); }); }
        else { statusEl.textContent = "저장 실패: " + (result.error || "알 수 없는 오류"); }
      });
    });
  }

  function deleteCategory(slug) {
    if (!window.confirm("카테고리를 삭제하시겠습니까?")) return;
    apiCall("/api/categories", "DELETE", { slug: slug }).then(function (result) {
      if (result.ok) fetchData().then(function () { navigate("categories"); });
      else alert("삭제 실패: " + (result.error || "알 수 없는 오류"));
    });
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
      '  <div style="display:flex;gap:10px;align-items:center;margin-top:18px;">' +
      '    <button type="submit" class="btn btn-primary">설정 저장</button>' +
      '    <span id="settings-status" style="font-size:12.5px;color:var(--ink-faint);">저장하면 바로 사이트에 반영됩니다.</span>' +
      '  </div>' +
      '</form>' +
      '<div class="admin-card">' +
      '  <h2 style="margin-top:0;">데이터 내보내기 (백업용)</h2>' +
      '  <p style="color:var(--ink-faint);font-size:13.5px;">현재 글/칼럼/카테고리/설정 데이터를 JSON 파일로 내려받아 백업해 둘 수 있습니다.</p>' +
      '  <button type="button" id="export-btn" class="btn btn-outline btn-sm">JSON 내보내기</button>' +
      '</div>'
    );
  }

  // ---------------------------------------------------------------
  // 서버 API 호출 공통 헬퍼
  // ---------------------------------------------------------------
  function apiCall(path, method, payload) {
    return fetch(path, {
      method: method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, error: data.error, data: data }; }); })
      .catch(function () { return { ok: false, error: "요청 중 문제가 발생했습니다." }; });
  }

  // ---------------------------------------------------------------
  // 메인 렌더 / 라우팅
  // ---------------------------------------------------------------

  function render() {
    var root = document.getElementById("admin-root");
    root.innerHTML = '<p style="padding:40px;text-align:center;color:var(--ink-faint);">로그인 확인 중...</p>';
    fetch("/api/session", { credentials: "same-origin" })
      .then(function (res) { return res.ok ? res.json() : { admin: false }; })
      .catch(function () { return { admin: false }; })
      .then(function (sessionData) {
        if (!sessionData.admin) {
          window.location.href = "/login/";
          return;
        }
        fetchData().then(function () { renderDashboardShell(root); });
      });
  }

  function renderDashboardShell(root) {
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
      '      <button data-view="media">미디어</button>' +
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

  var titles = { dashboard: "대시보드", posts: "일반 글 관리", columns: "칼럼 관리", categories: "카테고리", media: "미디어", settings: "사이트 설정" };

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
    else if (view === "media") { body.innerHTML = '<p style="color:var(--ink-faint);">불러오는 중...</p>'; loadMediaView(body); }
    else if (view === "settings") { body.innerHTML = renderSettings(); bindSettings(); }
  }

  // ---------------------------------------------------------------
  // 미디어 (업로드한 이미지 관리)
  // ---------------------------------------------------------------
  function collectUsedImageUrls() {
    var used = {};
    getPosts().concat(getColumns()).forEach(function (item) {
      var html = item.body_html || "";
      var re = /src="([^"]+)"/g;
      var m;
      while ((m = re.exec(html))) used[m[1]] = true;
    });
    return used;
  }

  function humanSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function loadMediaView(body) {
    fetch("/api/media", { credentials: "same-origin" })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) {
          body.innerHTML = '<div class="admin-card">불러오기 실패: ' + esc(result.data.error || "알 수 없는 오류") + '</div>';
          return;
        }
        renderMediaGrid(body, result.data.items || []);
      })
      .catch(function () {
        body.innerHTML = '<div class="admin-card">미디어 목록을 불러오는 중 문제가 발생했습니다.</div>';
      });
  }

  function renderMediaGrid(body, items) {
    var used = collectUsedImageUrls();
    if (!items.length) {
      body.innerHTML = '<div class="admin-card">업로드된 이미지가 없습니다. 글/칼럼 작성 화면의 에디터에서 이미지를 넣으면 여기에 나타납니다.</div>';
      return;
    }
    var cards = items.map(function (item, idx) {
      var inUse = !!used[item.url];
      return (
        '<div class="media-card">' +
        '  <img src="' + esc(item.url) + '" alt="">' +
        '  <div class="media-meta">' +
        '    <span class="media-name" title="' + esc(item.name) + '">' + esc(item.name) + '</span>' +
        '    <span class="media-size">' + humanSize(item.size) + '</span>' +
        '    <span class="status-pill ' + (inUse ? 'status-published' : 'status-draft') + '">' + (inUse ? '사용 중' : '미사용 추정') + '</span>' +
        '  </div>' +
        '  <button type="button" class="btn btn-danger btn-sm" data-media-delete="' + idx + '">삭제</button>' +
        '</div>'
      );
    }).join("");
    body.innerHTML =
      '<div class="admin-card">' +
      '  <p style="color:var(--ink-faint);font-size:13.5px;margin-top:0;">"미사용 추정"은 현재 저장된 모든 글/칼럼(초안 포함)의 본문을 기준으로 판단한 것입니다.</p>' +
      '  <div class="media-grid">' + cards + '</div>' +
      '</div>';

    document.querySelectorAll('[data-media-delete]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var item = items[Number(btn.dataset.mediaDelete)];
        if (!window.confirm('"' + item.name + '" 이미지를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
        btn.disabled = true;
        apiCall("/api/media", "DELETE", { path: item.path }).then(function (result) {
          if (result.ok) navigate("media");
          else { alert("삭제 실패: " + (result.error || "알 수 없는 오류")); btn.disabled = false; }
        });
      });
    });
  }

  function listView(kind) {
    var isColumn = kind === "column";
    return (
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">' +
      '  <div style="display:flex;gap:8px;flex:1;min-width:200px;">' +
      '    <input type="text" id="list-search" placeholder="제목으로 검색" style="max-width:240px;">' +
      (isColumn ? '' : '    <select id="list-cat-filter"><option value="">전체 카테고리</option>' + catOptions(null) + '</select>') +
      '  </div>' +
      '  <button id="new-item-btn" class="btn btn-brass btn-sm">' + (isColumn ? "새 칼럼 작성" : "새 글 작성") + '</button>' +
      '</div>' +
      '<div class="admin-card"><div id="list-table-body"></div></div>'
    );
  }

  function bindListActions(kind) {
    var isColumn = kind === "column";
    var newBtn = document.getElementById("new-item-btn");
    if (newBtn) newBtn.addEventListener("click", function () { openEdit(kind, null); });

    var searchInput = document.getElementById("list-search");
    var catFilter = document.getElementById("list-cat-filter");

    function renderFiltered() {
      var items = (isColumn ? getColumns() : getPosts()).slice();
      items.sort(function (a, b) { return (b.modified || "").localeCompare(a.modified || ""); });
      var q = (searchInput.value || "").trim().toLowerCase();
      if (q) items = items.filter(function (i) { return (i.title || "").toLowerCase().indexOf(q) > -1; });
      if (catFilter && catFilter.value) items = items.filter(function (i) { return i.category === catFilter.value; });
      document.getElementById("list-table-body").innerHTML = renderList(items, kind);
      bindRowActions(kind);
    }

    searchInput.addEventListener("input", renderFiltered);
    if (catFilter) catFilter.addEventListener("change", renderFiltered);
    renderFiltered();
  }

  function bindRowActions(kind) {
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

  // 폰트 선택지: 값 자체가 저장되는 CSS font-family 문자열이라(클래스 대신 style로 저장),
  // sanitize.js의 화이트리스트만 통과하면 저장 후에도 그대로 살아남는다.
  var FONT_CHOICES = [
    "Noto Sans KR, sans-serif",
    "Noto Serif KR, serif",
    "Nanum Gothic, sans-serif",
    "Nanum Myeongjo, serif",
    "Gothic A1, sans-serif",
    "Nanum Pen Script, cursive",
    "Gaegu, cursive",
    "Black Han Sans, sans-serif",
    "IBM Plex Mono, monospace",
  ];
  var FONT_LABELS = {
    "Noto Sans KR, sans-serif": "노토 산스",
    "Noto Serif KR, serif": "노토 명조",
    "Nanum Gothic, sans-serif": "나눔고딕",
    "Nanum Myeongjo, serif": "나눔명조",
    "Gothic A1, sans-serif": "고딕 A1",
    "Nanum Pen Script, cursive": "나눔손글씨",
    "Gaegu, cursive": "개구쟁이",
    "Black Han Sans, sans-serif": "블랙한산스",
    "IBM Plex Mono, monospace": "고정폭",
  };

  function ensureQuillFormatsRegistered() {
    if (window.__hnQuillFormatsRegistered) return;
    window.__hnQuillFormatsRegistered = true;
    ["size", "color", "background", "align", "font"].forEach(function (name) {
      try {
        var Attr = Quill.import("attributors/style/" + name);
        if (name === "size") Attr.whitelist = ["14px", "16px", "20px", "24px", "32px"];
        if (name === "font") Attr.whitelist = FONT_CHOICES;
        Quill.register(Attr, true);
      } catch (e) { /* 버전에 따라 없을 수 있어 무시 */ }
    });
    injectFontPickerLabels();
  }

  // Quill 폰트 드롭다운은 기본적으로 값(=font-family 문자열)을 그대로 보여주므로,
  // 한글 이름 + 실제 폰트로 미리보기가 되도록 스타일을 동적으로 주입한다.
  function injectFontPickerLabels() {
    var css = FONT_CHOICES.map(function (f) {
      var esc = f.replace(/"/g, '\\"');
      return (
        '#rich-editor-wrap .ql-picker.ql-font .ql-picker-item[data-value="' + esc + '"]::before,\n' +
        '#rich-editor-wrap .ql-picker.ql-font .ql-picker-label[data-value="' + esc + '"]::before {\n' +
        '  content: "' + (FONT_LABELS[f] || f) + '";\n' +
        '  font-family: ' + f + ';\n' +
        '}\n'
      );
    }).join("") +
      '#rich-editor-wrap .ql-picker.ql-font .ql-picker-item:not([data-value])::before,\n' +
      '#rich-editor-wrap .ql-picker.ql-font .ql-picker-label:not([data-value])::before {\n' +
      '  content: "기본 서체";\n' +
      '}\n';
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function createRichEditor(initialHtml) {
    ensureQuillFormatsRegistered();
    var quill = new Quill("#rich-editor", {
      theme: "snow",
      modules: {
        toolbar: [
          [{ header: [2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ font: [false].concat(FONT_CHOICES) }],
          [{ size: ["14px", false, "20px", "24px", "32px"] }],
          [{ color: [] }, { background: [] }],
          [{ align: [] }],
          [{ script: "sub" }, { script: "super" }],
          [{ list: "ordered" }, { list: "bullet" }],
          ["blockquote", "code-block", "link", "image"],
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
        var range = quill.getSelection(true);
        var altText = window.prompt("이미지 설명(대체 텍스트)을 입력해 주세요. 검색 노출과 접근성에 도움이 됩니다.\n(비워두고 확인을 눌러도 됩니다)", "") || "";

        resizeImageFile(file, 1600).then(function (uploadFile) {
          if (uploadFile.size > 5 * 1024 * 1024) { alert("이미지는 5MB 이하만 업로드할 수 있습니다."); return; }
          var reader = new FileReader();
          reader.onload = function () {
            var base64 = String(reader.result).split(",")[1];
            apiCall("/api/upload", "POST", { filename: uploadFile.name, mimeType: uploadFile.type, contentBase64: base64 })
              .then(function (result) {
                if (result.ok) {
                  quill.insertEmbed(range.index, "image", result.data.url, "user");
                  quill.setSelection(range.index + 1);
                  var leaf = quill.getLeaf(range.index);
                  if (leaf && leaf[0] && leaf[0].domNode) leaf[0].domNode.setAttribute("alt", altText);
                } else {
                  alert("이미지 업로드 실패: " + (result.error || "알 수 없는 오류"));
                }
              });
          };
          reader.readAsDataURL(uploadFile);
        });
      });
      input.click();
    });

    return quill;
  }

  // 업로드 전 브라우저에서 큰 이미지를 적당한 크기로 줄인다 (페이지 로딩 속도용).
  // GIF는 캔버스로 다시 인코딩하면 애니메이션이 깨지므로 원본 그대로 둔다.
  function resizeImageFile(file, maxDimension) {
    if (file.type === "image/gif") return Promise.resolve(file);
    return new Promise(function (resolve) {
      var objectUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        var scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        if (scale >= 1) { resolve(file); return; }
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name, { type: file.type }));
        }, file.type, 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
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

    var editForm = document.getElementById("edit-form");
    if (item._isNew) {
      editForm.title.addEventListener("input", function () {
        if (!editForm.slug.dataset.touched) editForm.slug.value = slugifyInput(editForm.title.value);
      });
      editForm.slug.addEventListener("input", function () { editForm.slug.dataset.touched = "1"; });
    }

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
    var statusEl = document.getElementById("save-status");
    var slug = slugifyInput(form.slug.value) || slugifyInput(form.title.value);
    var origSlug = original && !original._isNew ? original.slug : null;
    var payload = {
      slug: slug,
      __origSlug: origSlug,
      title: form.title.value.trim(),
      summary: form.summary.value.trim(),
      body_html: form.body_html.value,
      status: form.status.value,
      published: form.published.value || todayStr(),
      modified: form.modified.value || todayStr(),
    };
    if (!isColumn) {
      payload.subtitle = form.subtitle.value.trim();
      payload.category = form.category.value;
      payload.faqText = form.faqText.value;
      payload.keyPointsText = form.keyPointsText.value;
      payload.mistakesText = form.mistakesText.value;
      payload.checklistText = form.checklistText.value;
      payload.related = form.related.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      payload.featured = form.featured.checked;
    }
    statusEl.textContent = "저장 중...";
    apiCall(isColumn ? "/api/columns" : "/api/posts", "POST", payload).then(function (result) {
      if (result.ok) {
        fetchData().then(function () { navigate(isColumn ? "columns" : "posts"); });
      } else {
        statusEl.textContent = "저장 실패: " + (result.error || "알 수 없는 오류");
      }
    });
  }

  function deleteItem(kind, slug) {
    if (!window.confirm("정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    var isColumn = kind === "column";
    apiCall(isColumn ? "/api/columns" : "/api/posts", "DELETE", { slug: slug }).then(function (result) {
      if (result.ok) fetchData().then(function () { navigate(isColumn ? "columns" : "posts"); });
      else alert("삭제 실패: " + (result.error || "알 수 없는 오류"));
    });
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
      var statusEl = document.getElementById("settings-status");
      var cfg = {
        name: f.name.value, tagline: f.tagline.value, owner_name: f.owner_name.value,
        owner_bio: f.owner_bio.value, email: f.email.value, main_color: f.main_color.value,
        sub_color: f.sub_color.value, url: f.url.value, hero_image_url: f.hero_image_url.value,
      };
      statusEl.textContent = "저장 중...";
      apiCall("/api/config", "POST", cfg).then(function (result) {
        if (result.ok) {
          fetchData().then(function () {
            statusEl.textContent = "저장되었습니다. 사이트에 바로 반영됩니다.";
          });
        } else {
          statusEl.textContent = "저장 실패: " + (result.error || "알 수 없는 오류");
        }
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
  }

  document.addEventListener("DOMContentLoaded", render);
})();
