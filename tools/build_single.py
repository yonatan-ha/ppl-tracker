"""Inline the app into one self-contained HTML file.

Produces two builds in dist/:
  ppl-standalone.html  full HTML document (works over file:// too)
  ppl-artifact.html    body fragment for publishing as an Artifact

The ES modules are concatenated in dependency order with their import/export
keywords stripped, which works because every module-level name across the
codebase is unique.

    python tools/build_single.py
"""

import os
import re

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DIST = os.path.join(ROOT, "dist")

# Dependency order. app.js must stay last: it runs the bootstrap.
MODULES = [
    "exercises.js",
    "storage.js",
    "store.js",
    "ui.js",
    "charts.js",
    "calendar.js",
    "session.js",
    "editor.js",
    "templates.js",
    "stats.js",
    "settings.js",
    "app.js",
]

IMPORT_RE = re.compile(r"^import\s+[\s\S]*?from\s+['\"][^'\"]+['\"];?[ \t]*\n", re.M)
EXPORT_RE = re.compile(r"^export\s+", re.M)


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


def strip_module_syntax(src):
    src = IMPORT_RE.sub("", src)
    src = EXPORT_RE.sub("", src)
    return src.strip()


def bundle_js():
    chunks = []
    for name in MODULES:
        body = strip_module_syntax(read("js", name))
        chunks.append(f"/* ===== {name} ===== */\n{body}")
    return "\n\n".join(chunks)


# Injected only into the single-file builds: there is no manifest to link to,
# so ask iOS for standalone mode via meta tags added at runtime.
PWA_SHIM = """
/* single-file build: no external manifest, so declare the iOS bits inline */
(function () {
  var metas = {
    'apple-mobile-web-app-capable': 'yes',
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'PPL'
  };
  Object.keys(metas).forEach(function (name) {
    if (document.querySelector('meta[name="' + name + '"]')) return;
    var m = document.createElement('meta');
    m.name = name; m.content = metas[name];
    document.head.appendChild(m);
  });
  if (!document.querySelector('meta[name="viewport"]')) {
    var v = document.createElement('meta');
    v.name = 'viewport';
    v.content = 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no';
    document.head.appendChild(v);
  }
})();
"""


def build():
    os.makedirs(DIST, exist_ok=True)
    # styles.css pulls the embedded fonts in with @import, which can't survive
    # being inlined into a <style> block — splice the file in directly.
    css = read("styles.css").replace("@import url('fonts.css');", read("fonts.css"))
    js = bundle_js()
    html = read("index.html")

    # --- full standalone document ---
    doc = html
    doc = doc.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{css}\n</style>")
    doc = re.sub(r'\s*<link rel="manifest"[^>]*>', "", doc)
    doc = re.sub(r'\s*<link rel="(apple-touch-)?icon"[^>]*>', "", doc)
    doc = doc.replace(
        '<script type="module" src="js/app.js"></script>',
        f"<script>\n{PWA_SHIM}\n{js}\n</script>",
    )
    write(os.path.join(DIST, "ppl-standalone.html"), doc)

    # --- artifact fragment: everything between <body> and </body>, plus title/style ---
    body = re.search(r"<body>([\s\S]*?)</body>", doc).group(1)
    body = body.replace("<script>", "<script>", 1)
    fragment = (
        "<title>PPL — Workout Tracker</title>\n"
        f"<style>\n{css}\n</style>\n"
        f"{body.strip()}\n"
    )
    write(os.path.join(DIST, "ppl-artifact.html"), fragment)


def write(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"wrote {path} ({len(text):,} chars)")


if __name__ == "__main__":
    build()
