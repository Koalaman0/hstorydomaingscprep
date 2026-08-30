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

    // 카테고리 드롭다운: mouseenter만 보고 열면, 페이지가 새로 열릴 때 마우스 커서가
    // 우연히 그 위에 있기만 해도(실제로 움직이지 않아도) 브라우저가 hit-test 때문에
    // mouseenter를 스스로 쏴버려서 똑같이 저절로 열려있는 것처럼 보인다. 그래서
    // mouseenter는 "커서가 그 영역 안에 있다"는 상태만 기록해두고, 그 안에서 실제
    // mousemove(진짜 마우스가 움직였을 때만 발생)가 한 번이라도 일어나야 그때 연다.
    document.querySelectorAll(".site-nav li.has-dropdown").forEach(function (li) {
      var dropdown = li.querySelector(".nav-dropdown");
      var link = li.querySelector("a");
      if (!dropdown) return;
      var pointerInside = false;
      var startX = null;
      var startY = null;
      var MOVE_THRESHOLD = 6; // 트랙패드의 미세한 떨림까지 걸러내기 위한 최소 이동 거리(px)
      li.addEventListener("mouseenter", function (e) {
        pointerInside = true;
        startX = e.clientX;
        startY = e.clientY;
      });
      li.addEventListener("mousemove", function (e) {
        if (!pointerInside) return;
        var dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (dist > MOVE_THRESHOLD) dropdown.classList.add("is-open");
      });
      li.addEventListener("mouseleave", function () {
        pointerInside = false;
        dropdown.classList.remove("is-open");
      });
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
