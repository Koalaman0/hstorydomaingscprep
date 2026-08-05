(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("login-form");
    var errorEl = document.getElementById("login-error");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorEl.hidden = true;
      var password = document.getElementById("login-pass").value;
      var submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password: password }),
      })
        .then(function (res) {
          if (res.ok) {
            window.location.href = "/admin/";
            return;
          }
          submitBtn.disabled = false;
          errorEl.textContent = "비밀번호가 올바르지 않습니다.";
          errorEl.hidden = false;
        })
        .catch(function () {
          submitBtn.disabled = false;
          errorEl.textContent = "로그인 요청 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
          errorEl.hidden = false;
        });
    });
  });
})();
