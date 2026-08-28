/*
 * 히스토리노트 공통 스크립트
 * - 모바일 내비게이션 토글
 * - 관리자 로그인 여부를 서버(/api/session)에 물어보고 admin-only 요소를 표시/숨김
 *   (Cloudflare Pages Functions가 서명된 세션 쿠키를 검증합니다. 클라이언트는
 *   그 결과만 받아서 UI를 바꿀 뿐, 인증 판단 자체는 서버에서 이루어집니다.)
 */
(function () {
  var cachedAdmin = null;

  function applyAdminState(admin) {
    document.querySelectorAll(".admin-only").forEach(function (el) {
      el.hidden = !admin;
    });
    var bar = document.getElementById("admin-bar");
    if (bar) bar.hidden = !admin;

    var adminCtas = document.querySelectorAll(".admin-cta");
    var readerCtas = document.querySelectorAll(".reader-cta");
    adminCtas.forEach(function (el) { el.classList.toggle("is-visible", admin); });
    readerCtas.forEach(function (el) { el.classList.toggle("is-hidden", admin); });

    var stateText = document.getElementById("author-state-text");
    if (stateText) {
      stateText.textContent = admin
        ? "관리자로 로그인되어 있습니다. 새 칼럼을 바로 작성할 수 있습니다."
        : "운영자가 정리한 칼럼을 읽어보세요.";
    }
  }

  function checkSession() {
    return fetch("/api/session", { credentials: "same-origin" })
      .then(function (res) { return res.ok ? res.json() : { admin: false }; })
      .catch(function () { return { admin: false }; })
      .then(function (data) {
        cachedAdmin = !!data.admin;
        applyAdminState(cachedAdmin);
        return cachedAdmin;
      });
  }
  window.HN_isAdmin = function () { return cachedAdmin === true; };
  window.HN_checkSession = checkSession;

  document.addEventListener("DOMContentLoaded", function () {
    checkSession();

    var toggle = document.getElementById("nav-toggle");
    var nav = document.getElementById("site-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var open = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    // 카테고리 드롭다운: CSS :hover만 쓰면, 방금 그 링크를 클릭해서 이 페이지로
    // 들어온 경우 마우스 커서가 그 자리에 그대로 있어서 움직이지 않아도 계속
    // 펼쳐진 채로 보인다. mouseenter/focus 같은 "실제 이벤트"가 있을 때만
    // 열리도록 JS로 처리해 그 문제를 없앤다.
    document.querySelectorAll(".site-nav li.has-dropdown").forEach(function (li) {
      var dropdown = li.querySelector(".nav-dropdown");
      var link = li.querySelector("a");
      if (!dropdown) return;
      li.addEventListener("mouseenter", function () { dropdown.classList.add("is-open"); });
      li.addEventListener("mouseleave", function () { dropdown.classList.remove("is-open"); });
      if (link) link.addEventListener("focus", function () { dropdown.classList.add("is-open"); });
      li.addEventListener("focusout", function (e) {
        if (!li.contains(e.relatedTarget)) dropdown.classList.remove("is-open");
      });
    });

    var logoutBtn = document.getElementById("admin-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        fetch("/api/logout", { method: "POST", credentials: "same-origin" }).then(function () {
          window.location.href = "/";
        });
      });
    }
  });
})();
