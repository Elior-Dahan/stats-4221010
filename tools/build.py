#!/usr/bin/env python3
"""Validate the site and build _site/ for GitHub Pages.

  python tools/build.py            check, then build _site/ (published content only)
  python tools/build.py --check    check only
  python tools/build.py --drafts   build including unpublished lectures/solutions (local preview)

Exits non-zero on any error, so CI won't deploy a broken site.
"""
import argparse
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"
NOINDEX = re.compile(r'<meta\s+name=["\']robots["\']\s+content=["\'][^"\']*noindex', re.I)
COMMON = re.compile(r'<script[^>]+src=["\']\.\./\.\./assets/common\.js["\']', re.I)
RTL = re.compile(r'<html[^>]*\bdir=["\']rtl["\']', re.I)
REF = re.compile(r'\b(?:href|src)=["\']([^"\']+)["\']', re.I)
SLUG = re.compile(r"^\d{2}-[a-z0-9-]+$")


def load():
    try:
        return json.loads((ROOT / "lectures.json").read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        sys.exit(f"ERROR lectures.json: {e}")


def check_page(page: Path, errors: list, warnings: list):
    rel = page.relative_to(ROOT)
    html = page.read_text(encoding="utf-8", errors="replace")
    if not NOINDEX.search(html):
        errors.append(f"{rel}: missing <meta name=\"robots\" content=\"noindex\">")
    if not COMMON.search(html):
        errors.append(f"{rel}: missing <script src=\"../../assets/common.js\" defer>")
    if not RTL.search(html):
        warnings.append(f"{rel}: <html> has no dir=\"rtl\"")
    for ref in REF.findall(html):
        if re.match(r"^(https?:|mailto:|tel:|data:|javascript:|#|//)", ref, re.I):
            continue
        if ref.startswith("/"):
            errors.append(f"{rel}: absolute path '{ref}' breaks under the Pages sub-path, use a relative link")
            continue
        target = (page.parent / ref.split("#")[0].split("?")[0]).resolve()
        if target.is_dir():
            target = target / "index.html"
        if not target.exists():
            errors.append(f"{rel}: broken link '{ref}'")


def check(data, drafts: bool):
    errors, warnings = [], []
    lectures = data.get("lectures", [])
    seen_n, seen_slug = set(), set()
    for lec in lectures:
        n, slug = lec.get("n"), lec.get("slug", "")
        tag = f"lecture {n} ({slug})"
        for key in ("n", "slug", "title", "published"):
            if key not in lec:
                errors.append(f"{tag}: missing field '{key}'")
        if n in seen_n:
            errors.append(f"{tag}: duplicate n")
        if slug in seen_slug:
            errors.append(f"{tag}: duplicate slug")
        seen_n.add(n)
        seen_slug.add(slug)
        if not SLUG.match(slug):
            warnings.append(f"{tag}: slug should look like '01-descriptive'")

        page = ROOT / "lectures" / slug / "index.html"
        if not page.exists():
            errors.append(f"{tag}: {page.relative_to(ROOT)} not found")
            continue
        if lec.get("published") or drafts:
            check_page(page, errors, warnings)

        sol = lec.get("solutions")
        if sol:
            sp = ROOT / "lectures" / slug / sol.get("path", "")
            if not sol.get("path") or not sp.is_file():
                errors.append(f"{tag}: solutions file '{sol.get('path')}' not found")
            elif (sol.get("published") and lec.get("published")) or drafts:
                check_page(sp, errors, warnings)
            if not sol.get("published") and not drafts and sol.get("path", "#") in page.read_text(encoding="utf-8", errors="replace"):
                warnings.append(f"{tag}: page links to unpublished solutions '{sol['path']}' (link will be broken on the live site)")
            if sol.get("published") and not lec.get("published"):
                warnings.append(f"{tag}: solutions published but lecture is not; solutions won't be deployed")

    for d in sorted((ROOT / "lectures").glob("*/")):
        if d.name not in seen_slug:
            warnings.append(f"lectures/{d.name}/ is not listed in lectures.json (won't be deployed)")
    stray = [p.name for p in ROOT.glob("*.html") if p.name != "index.html"]
    if stray:
        warnings.append(f"HTML files in the root that aren't part of the site: {', '.join(stray)}")
    return errors, warnings


def build(data, drafts: bool):
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    shutil.copy2(ROOT / "index.html", OUT)
    shutil.copytree(ROOT / "assets", OUT / "assets")
    (OUT / ".nojekyll").touch()

    out_lectures = []
    for lec in data.get("lectures", []):
        if not (lec.get("published") or drafts):
            continue
        lec = dict(lec)
        if drafts:
            lec["published"] = True
        src = ROOT / "lectures" / lec["slug"]
        dst = OUT / "lectures" / lec["slug"]
        shutil.copytree(src, dst)
        sol = lec.get("solutions")
        if sol and not (sol.get("published") or drafts):
            (dst / sol["path"]).unlink(missing_ok=True)
            lec["solutions"] = None
        elif sol and drafts:
            lec["solutions"] = {**sol, "published": True}
        out_lectures.append(lec)

    public = {**data, "lectures": out_lectures}
    (OUT / "lectures.json").write_text(json.dumps(public, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Built _site/ with {len(out_lectures)} lecture(s){' (including drafts)' if drafts else ''}.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="validate only")
    ap.add_argument("--drafts", action="store_true", help="include unpublished content")
    args = ap.parse_args()

    data = load()
    errors, warnings = check(data, args.drafts)
    for w in warnings:
        print(f"warning: {w}")
    for e in errors:
        print(f"ERROR:   {e}")
    if errors:
        sys.exit(f"\n{len(errors)} error(s). Nothing was built.")
    print("Check passed.")
    if not args.check:
        build(data, args.drafts)


if __name__ == "__main__":
    main()
