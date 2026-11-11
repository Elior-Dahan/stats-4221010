# Statistics 4221010: study-guide site

Static site of interactive per-lecture study guides for the Statistics course (4221010, Ariel University, lecturer Dr. Shani Elkobi). Maintained by the course TA (Elior). Audience: students. Language: Hebrew, RTL. Hosted on GitHub Pages, deployed by GitHub Actions on every push to `main`.

## Structure

```
index.html                 landing page: renders a card per published lecture from lectures.json
lectures.json              single source of truth: course info + list of lectures
lectures/NN-slug/index.html  the study guide for lecture NN (self-contained page)
lectures/NN-slug/solutions.html  optional: solutions to the lecturer's booklet for that lecture
assets/site.css            landing-page styles
assets/common.js           injected into every lecture page: top/bottom nav (prev / home / next)
tools/build.py             validates the site and builds _site/ (published content only)
.github/workflows/deploy.yml  CI: build.py -> deploy _site/ to Pages
```

`lectures.json` lecture entry:
```json
{ "n": 1, "slug": "01-descriptive", "title": "…", "summary": "1–2 lines", "topics": ["…"],
  "published": true, "solutions": { "path": "solutions.html", "published": false } }
```
`solutions` is `null` when there is no solutions file. Unpublished lectures/solutions stay in the repo but are NOT copied to `_site/`, so they are not on the live site.

## Content rules (hard)

- Hebrew, `<html lang="he" dir="rtl">`. Math terms may appear in English in parentheses on first use.
- No memory tricks / mnemonics: students get a large formula sheet in the exam.
- No Bayesian material (students take it only in 4th year).
- MLE: no second-derivative checks; the course does not do them.
- Do not put the lecturer's exercise-booklet questions inside the study guides. Booklet solutions go only in `lectures/NN-slug/solutions.html`.
- Material beyond the lecture slides goes in collapsible extensions (`<details>`), clearly marked as an extension.

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
3. Add an entry to `lectures.json` with `"published": false`.
4. `python tools/build.py --check`, preview, then publish only when the user says so.
