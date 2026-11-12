/* global localStorage, document */
// Puts the kept theme on <html> before the first paint, so a dark choice never flashes light. It is an
// external file because the Content Security Policy is `script-src 'self'`. The key and shape are
// prefs/display.ts's; light on a first visit, or when the choice can't be read.
(function () {
  var theme = "light";
  try {
    var raw = JSON.parse(localStorage.getItem("postern.display") || "null");
    if (raw && raw.version === 1 && (raw.theme === "dark" || raw.theme === "system")) theme = raw.theme;
  } catch {
    // Storage is blocked or the value isn't ours: light.
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
