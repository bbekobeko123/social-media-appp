(function () {
  try {
    var saved = localStorage.getItem("pf_theme");
    if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else if (saved === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  } catch (e) {}
})();
