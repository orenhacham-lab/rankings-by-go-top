# Rankings by Go Top

מערכת מעקב דירוגי SEO בעברית — Google Search אורגני + Google Maps.

## תכונות

- מעקב אחר מיקום אתרים בגוגל (עד 100 תוצאות)
- מעקב אחר מיקום עסקים בגוגל מפות
- ניהול לקוחות, פרויקטים ומילות מפתח
- היסטוריית דירוגים עם גרפים
- סריקות ידניות ואוטומטיות (cron יומי)
- ייצוא דוחות Excel ו-PDF
- ממשק עברית RTL מלא

## דרישות

- Node.js 18+
- פרויקט [Supabase](https://supabase.com) (חינמי)
- מפתח API של [Serper](https://serper.dev) (2,500 חיפושים חינמיים)

## התקנה מקומית

```bash
npm install
cp .env.local.example .env.local
# ערוך את .env.local עם הפרטים שלך
npm run dev
```

פתח [http://localhost:3000](http://localhost:3000) — ייפתח אשף ההגדרה.

## משתני סביבה

| משתנה | תיאור |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | כתובת פרויקט Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | מפתח anon public של Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | מפתח service_role של Supabase |
| `SERPER_API_KEY` | מפתח API של Serper |

## הגדרת בסיס הנתונים

הרץ את `supabase/schema.sql` ב-SQL Editor של פרויקט ה-Supabase שלך.

## פריסה על Vercel

1. חבר את ה-repository ב-Vercel
2. הוסף את משתני הסביבה בלוח הבקרה של Vercel
3. פרוס — הסריקה האוטומטית היומית מוגדרת ב-`vercel.json`

## Tech Stack

Next.js 16 · Supabase · Serper API · Tailwind CSS · TypeScript
