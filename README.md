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

## פתרונות לחוברת
המאגר ציבורי, ולכן כל קובץ שנכנס אליו גלוי ב-GitHub גם אם הוא לא מופיע באתר. לכן:
- קובצי `lectures/NN-slug/solutions.html` לא נכנסים למאגר עד שמחליטים לשחרר אותם. הם מוחרגים ב-`.gitignore`, כך שאפשר להחזיק אותם מקומית.
- עד השחרור, השדה `solutions` של ההרצאה ב-`lectures.json` נשאר `null`. אחרת ה-workflow ייכשל, כי הקובץ לא קיים במאגר.
- שחרור קובץ פתרונות: `git add -f lectures/NN-slug/solutions.html`, לעדכן ב-`lectures.json` את `"solutions": { "path": "solutions.html", "published": true }`, להריץ `python tools/build.py --check`, ואז commit ו-push.

גם הרצאה עם `"published": false` לא מופיעה באתר, אבל הקובץ שלה גלוי במאגר.

## פרסום
`git push` ל-`main`. ה-workflow בודק את האתר, בונה רק תוכן מפורסם ומעלה אותו.
הגדרה חד-פעמית: Settings ← Pages ← Source: **GitHub Actions**.

כללי תוכן והנחיות לעבודה עם Claude Code: ראו `CLAUDE.md`.
