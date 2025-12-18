(function () {
  try {
    var saved = localStorage.getItem("pf_theme");
    var theme =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  } catch (e) {}
})();
