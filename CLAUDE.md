# Statistics 4221010: study-guide site

Static site of interactive per-lecture study guides for the Statistics course (4221010, Ariel University, lecturer Dr. Shani Elkobi). Maintained by the course TA (Elior). Audience: students. Language: Hebrew, RTL. Hosted on GitHub Pages, deployed by GitHub Actions on every push to `main`.

## Structure

```
index.html                 landing page: renders a card per published lecture from lectures.json
lectures.json              single source of truth: course info + list of lectures
lectures/NN-slug/index.html  the study guide for lecture NN (self-contained page)
lectures/NN-slug/solutions.html  optional: solutions to the lecturer's booklet for that lecture (git-ignored until released)
assets/site.css            landing-page styles
assets/common.js           injected into every lecture page: top/bottom nav (prev / home / next) and the back-to-top button
tools/build.py             validates the site and builds _site/ (published content only)
.github/workflows/deploy.yml  CI: build.py -> deploy _site/ to Pages
```

`lectures.json` lecture entry:
```json
{ "n": 1, "slug": "01-descriptive", "title": "…", "summary": "1–2 lines", "topics": ["…"],
  "published": true, "solutions": { "path": "solutions.html", "published": false } }
```
`solutions` is `null` when there is no released solutions file. Unpublished lectures stay in the repo but are NOT copied to `_site/`, so they are not on the live site.

## Solutions policy (hard)

The repo is public, so anything committed is readable on github.com even when it is not on the site. Therefore:

- Solutions files are never committed until the user decides to release them. `.gitignore` has `lectures/*/solutions.html`, so they can live locally without being committed. Never `git add -f` one unless the user explicitly says to release that file.
- Until release, the lecture's `solutions` field in `lectures.json` stays `null`. The ignored file does not exist on CI, so a non-null `solutions` entry fails the deploy ("solutions file not found").
- To release a solutions file, only when the user says so: `git add -f lectures/NN-slug/solutions.html`, set `"solutions": { "path": "solutions.html", "published": true }`, run the check, commit.
- A local `solutions.html` is still copied into the local `_site/` preview along with its lecture folder. That is local only.
- The same goes for unpublished lectures: they are off the site but visible in the repo. Do not commit a draft the user wants kept private.

## Content rules (hard)

- Hebrew, `<html lang="he" dir="rtl">`. Math terms may appear in English in parentheses on first use.
- No memory tricks / mnemonics: students get a large formula sheet in the exam.
- No Bayesian material (students take it only in 4th year).
- MLE: the course requires the second-derivative check. Lecturer's procedure: first derivative of ln L = 0 gives the critical point; the second derivative of ln L at that point is negative, so it is a maximum; then confirm it is the absolute maximum (the only critical point in the parameter's domain). Compute the second derivative from the sum form of (ln L)', not from the combined fraction, and plug in the estimate whenever its sign depends on the parameter.
- Do not put the lecturer's exercise-booklet questions inside the study guides. Booklet solutions go only in `lectures/NN-slug/solutions.html`.
- Lecture 2 (`02-probability`) is final as is: do not move, split or remove any of its content.
- The existing guides are finished work. Do not remove or rewrite their content unless asked.
- Material beyond the lecture slides goes in collapsible extensions (`<details>`), clearly marked as an extension.

## Guide conventions (every lecture follows these)

The four guides share one design system and one set of conventions. A new lecture starts as a copy of an existing guide's CSS/JS and must match all of the following.

- **Page title:** `<title>הרצאה N – <landing title> · סטטיסטיקה</title>` (en dash after the number; the landing title is the lecture's `title` in `lectures.json`).
- **Masthead:** `<h1>` is the landing title; the creative line goes in `<span class="h1-second">` inside it.
- **Controls bar**, in this order and with this exact text:
  - legend: `<span class="ext-badge">הרחבה</span> חומר שמעבר לחומר ההרצאה. מקופל כברירת מחדל.`
  - theme button `#toggle-theme` ("מצב כהה" / "מצב בהיר"), saved under `localStorage["stats-guide-theme"]`
  - one extensions button `#toggle-ext-open`: "פתח את כל ההרחבות" / "סגור את כל ההרחבות". Extensions are closed by default. There is no "hide extensions" mode.
- **Footer:** `<footer class="foot">` after the layout, with the text: `מדריך למידה לקורס סטטיסטיקה 4221010, אוניברסיטת אריאל. חומר שמסומן "הרחבה" הוא מעבר לחומר ההרצאה.`
- **Exercises chapter** (when a lecture has one): heading "תרגילים פתורים", table-of-contents entry "תרגילים".
- **Spelling:** "גיאומטרית", "היפרגיאומטרית" (as on the lecturer's formula sheet).
- **Distribution notation:** `Geo(p)`, `Pois(\lambda)`, `Exp(\lambda)`, `B(n,p)`, `N(\mu,\sigma^2)`, and for the uniform `U(a,b)` when continuous, `U[a,b]` when discrete.
- **Operators in formulas:** `\mathrm{Var}`, `\mathrm{Cov}` (upright), never bare `Var` / `Cov` inside TeX.
- **Cross-lecture references:** always "הרצאה N" with the natural Hebrew prefix (בהרצאה 1, מהרצאה 3, להרצאה 2), written as a relative link to that lecture and to the chapter when one fits: `<a href="../01-descriptive/#transform">בהרצאה 1</a>`. Never "בשיעור על…", "בשיעור הקודם" or "היחידה". "ההרצאה" without a number means the current lecture.
- **Tables:** wrap in `<div class="table-wrap">`, and `.table-wrap` has `position: relative` (keeps KaTeX's hidden copies from widening the page on phones).
- **Design tokens:** the `:root` tokens (palette, `--font-body`, `--font-head`) are identical in every guide, and `assets/site.css` (landing page) mirrors them. Change a token everywhere or nowhere.
- **Back-to-top button and prev/home/next nav** come from `assets/common.js`. Do not add either inside a guide.

## Technical rules

- Every lecture page keeps its own CSS/JS. Do not refactor or restyle across pages unless asked.
- Every lecture page (and solutions page) must have, in `<head>`:
  ```html
  <meta name="robots" content="noindex">
  <script src="../../assets/common.js" defer></script>
  ```
- Relative links only. The site is served under a sub-path (`https://<org>.github.io/<repo>/`), so a link starting with `/` breaks.
- Math/charts libraries from a CDN are fine (KaTeX, MathJax, Chart.js…).
- Never flip `published` (lecture or solutions) to `true` unless the user explicitly says so.
- After any change run `python tools/build.py --check` and fix every error.
- Commit in small, descriptive commits. Do not `git push` unless the user asks.

## Preview locally

`fetch()` does not work from `file://`, so always use a local server:
```
python tools/build.py --drafts && python -m http.server 8000 -d _site
```
Then open http://localhost:8000. (`--drafts` includes unpublished content; omit it to see exactly what students will see.)

## Adding a lecture

1. Create `lectures/NN-slug/index.html` (two-digit NN, short English slug).
2. Add the two `<head>` lines above.
3. Follow every item under "Guide conventions".
4. Add an entry to `lectures.json` with `"published": false`.
5. `python tools/build.py --check`, preview, then publish only when the user says so.
