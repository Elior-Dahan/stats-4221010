# סטטיסטיקה 4221010: מדריכי למידה

אתר סטטי עם מדריך אינטראקטיבי לכל הרצאה. מתארח ב-GitHub Pages ומתעדכן אוטומטית בכל push ל-`main`.

## תצוגה מקומית
```
python tools/build.py --drafts
python -m http.server 8000 -d _site
```
ואז לפתוח http://localhost:8000

## הוספת הרצאה
1. `lectures/NN-slug/index.html`
2. בתוך `<head>`:
   ```html
   <meta name="robots" content="noindex">
   <script src="../../assets/common.js" defer></script>
   ```
3. רשומה חדשה ב-`lectures.json` עם `"published": false`, ולשנות ל-`true` כשמוכן.
4. `python tools/build.py --check`

## פרסום
`git push` ל-`main`. ה-workflow בודק את האתר, בונה רק תוכן מפורסם ומעלה אותו.
הגדרה חד-פעמית: Settings ← Pages ← Source: **GitHub Actions**.

כללי תוכן והנחיות לעבודה עם Claude Code: ראו `CLAUDE.md`.
