-- PROBE: the repair in /mnt/project-files/articles/blog-2026-10-10/
-- fix-tables-and-anchors.sql does what it says, on a disposable cluster.
-- The two UPDATE statements below are copied verbatim from that file.
create table articles (
  slug text primary key,
  locale text not null,
  content text not null,
  updated_at timestamptz not null default now()
);

-- The body of the live article, as served on 2026-10-10 (heading ids removed,
-- since the renderer adds those). Three tables flattened into paragraphs.
insert into articles (slug, locale, content) values
  ('seo-keywords-planning-tool', 'he', '<p>הרבה בעלי עסקים מתחילים קידום אתרים בלי לעצור לשאול שאלה בסיסית אחת: מה הלקוחות באמת מחפשים? כאן בדיוק נכנס מחקר מילות מפתח בגוגל.</p><p>זהו השלב שמפריד בין קידום “בערך” לבין קידום שמביא תוצאות אמיתיות. במקום לנחש, מסתכלים על נתונים. במקום לכתוב תוכן כללי, כותבים מה שאנשים באמת מחפשים.</p><p>מחקר נכון הוא לא רק רשימת מילים. הוא הבנה של כוונת משתמש.</p><h2>למה מחקר מילות מפתח כל כך חשוב?</h2><p>כאשר אדם מחפש משהו בגוגל, הוא מקליד ביטוי מסוים. הביטוי הזה מייצג צורך. לפעמים זו שאלה, לפעמים בעיה, לפעמים רצון לקנות.</p><p>מחקר מילות מפתח בגוגל מאפשר לזהות את הביטויים האלה בדיוק. להבין איך אנשים חושבים, איך הם מחפשים ומה חשוב להם.</p><p>כאשר האתר שלכם מותאם למה שהם מחפשים, הסיכוי שהם יגיעו אליכם גדל משמעותית.</p><h2>איך מחקר מילות מפתח משפיע על הצלחת האתר?</h2><p>ההשפעה היא ישירה.</p><p>אם בוחרים ביטויים לא נכונים, גם אם תגיעו למקום הראשון – לא תקבלו תנועה רלוונטית. אם בוחרים נכון, גם מיקום בינוני יכול להביא לקוחות.</p><p>סוג ביטוי</p><p>תוצאה אפשרית</p><p>ביטוי כללי מדי</p><p>הרבה חשיפה, מעט המרות</p><p>ביטוי מדויק</p><p>פחות תנועה, אך איכותית</p><p>ביטוי לא רלוונטי</p><p>תנועה לא רלוונטית</p><p>המטרה היא לא רק להביא גולשים, אלא להביא את הגולשים הנכונים.</p><h2>מה זה בעצם “כוונת חיפוש”?</h2><p>זו אחת הנקודות הכי חשובות במחקר.</p><p>כאשר מישהו מחפש ביטוי, יש לו כוונה. הוא רוצה ללמוד, להשוות או לקנות.</p><p>סוג כוונה</p><p>דוגמה</p><p>משמעות</p><p>מידע</p><p>“איך לבחור בושם”</p><p>מחפש ידע</p><p>השוואה</p><p>“בושם X או Y”</p><p>מתלבט</p><p>רכישה</p><p>“לקנות בושם”</p><p>מוכן לפעולה</p><p>מחקר מילות מפתח בגוגל צריך לזהות את הכוונה, לא רק את המילה.</p><h2>איך מבצעים מחקר מילות מפתח נכון?</h2><p>התהליך מתחיל בהבנה של העסק. מי הקהל, מה השירות ומה הבעיה שהעסק פותר.</p><p>לאחר מכן, בודקים איך אנשים מחפשים את זה בפועל. אילו ביטויים הם מקלידים. אילו וריאציות קיימות.</p><p>כאן כלים מתקדמים כמו <a target="_blank" rel="noopener noreferrer" class="text-action underline underline-offset-2 hover:text-action-hover text-blue-600 hover:text-blue-700" href="https://www.gotopseo.com">Go Top SEO</a> יכולים לעזור להבין לא רק את המילים, אלא גם את הביצועים שלהן לאורך זמן.</p><p>המחקר אינו חד פעמי. הוא תהליך מתמשך.</p><h2>האם כדאי לבחור ביטויים עם הרבה חיפושים?</h2><p>זו שאלה נפוצה מאוד.</p><p>הרבה חושבים שכדאי ללכת על ביטויים עם נפח חיפוש גבוה. בפועל, זה לא תמיד נכון.</p><p>סוג ביטוי</p><p>יתרון</p><p>חיסרון</p><p>נפח גבוה</p><p>הרבה תנועה</p><p>תחרות גבוהה</p><p>נפח נמוך</p><p>תחרות נמוכה</p><p>פחות תנועה</p><p>בינוני</p><p>איזון</p><p>דורש דיוק</p><p>הבחירה הנכונה תלויה באסטרטגיה.</p><h2>איך יודעים אילו ביטויים באמת שווים?</h2><p>לא כל ביטוי שווה השקעה.</p><p>צריך לבדוק כמה דברים. תחרות, רלוונטיות, כוונת חיפוש והיכולת להגיע למיקום גבוה.</p><p>כאשר משלבים את כל הפרמטרים, מתקבלת תמונה מלאה יותר.</p><p>זה ההבדל בין רשימת מילים לבין אסטרטגיה.</p><h2>האם מחקר מילות מפתח מתאים גם לעסקים קטנים?</h2><p>כן, ואפילו יותר.</p><p>עסקים קטנים יכולים להתחרות בביטויים מדויקים יותר. כאלה שממוקדים בקהל יעד ספציפי.</p><p>במקום לנסות להתחרות על ביטויים כלליים, הם יכולים להתמקד בביטויים שמביאים לקוחות בפועל.</p><p>זו גישה חכמה יותר.</p><h2>איך מחקר מילות מפתח משתלב בתוכן?</h2><p>לאחר שמוצאים את הביטויים, צריך לשלב אותם בתוכן בצורה טבעית.</p><p>התוכן צריך להרגיש אנושי. לא מלאכותי. לא עמוס במילים חוזרות.</p><p>המטרה היא לכתוב לגולש, לא רק לגוגל.</p><p>כאשר התוכן טוב באמת, הוא עובד גם עבור מנועי חיפוש וגם עבור אנשים.</p><h2>האם מחקר מילות מפתח חשוב גם בעידן AI?</h2><p>יותר מתמיד.</p><p>מנועי חיפוש מבוססי AI לא מחפשים רק התאמה למילים. הם מחפשים הבנה. הקשר. עומק.</p><p>מחקר מילות מפתח בגוגל מאפשר להבין את הנושאים שמעניינים את המשתמשים, ולא רק את המילים שהם כותבים.</p><p>זה מאפשר ליצור תוכן שמכסה נושא בצורה מלאה.</p><h2>כמה פעמים צריך לבצע מחקר מילות מפתח?</h2><p>זה לא משהו שעושים פעם אחת ושוכחים.</p><p>העולם משתנה. החיפושים משתנים. המתחרים משתנים.</p><p>בדיקה תקופתית מאפשרת להתאים את האסטרטגיה.</p><p>זה חלק מתהליך מתמשך של שיפור.</p><h2>סיכום – הבסיס לכל קידום חכם</h2><p>מחקר מילות מפתח בגוגל הוא הבסיס לכל פעילות SEO. הוא מאפשר להבין את הקהל, לבחור ביטויים נכונים ולבנות תוכן שמביא תוצאות.</p><p>כאשר עושים מחקר נכון, כל שאר התהליך הופך ברור יותר. התוכן מדויק יותר. התנועה איכותית יותר.</p><p>מי שמשקיע במחקר – חוסך טעויות.</p><h2>שאלות נפוצות</h2><p><strong>האם מחקר מילות מפתח מתאים לכל תחום?</strong><br />כן, בכל תחום יש חיפושים שניתן לנתח.</p><p><strong>כמה ביטויים צריך לבחור?</strong><br />תלוי בעסק, אך עדיף להתמקד באיכות ולא בכמות.</p><p><strong>האם חייבים כלי מקצועי?</strong><br />לא חובה, אך מומלץ מאוד כדי לקבל נתונים מדויקים.</p><p><strong>כמה זמן לוקח לראות תוצאות?</strong><br />זה תלוי בקידום עצמו, אך מחקר נכון מקצר את הדרך.</p><h2>'),
  -- An untouched article, to prove the table UPDATE cannot reach it and that
  -- the anchor UPDATE renames only the link text.
  ('keywords-rankings-test', 'he',
   '<p>לפני</p><table style="min-width:50px"><tbody><tr><th colspan="1" rowspan="1"><p>א</p></th></tr></tbody></table><p>מערכת כמו <a href="https://www.gotopseo.com">Rankings by Go Top</a> עוקבת. Rankings by Go Top בתוך טקסט נשאר.</p>');

update articles
   set content = replace(
                   replace(
                     replace(content,
                       '<p>סוג ביטוי</p><p>תוצאה אפשרית</p><p>ביטוי כללי מדי</p><p>הרבה חשיפה, מעט המרות</p><p>ביטוי מדויק</p><p>פחות תנועה, אך איכותית</p><p>ביטוי לא רלוונטי</p><p>תנועה לא רלוונטית</p>',
                       '<table style="min-width:50px"><colgroup><col style="min-width:25px" /><col style="min-width:25px" /></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>סוג ביטוי</p></th><th colspan="1" rowspan="1"><p>תוצאה אפשרית</p></th></tr><tr><td colspan="1" rowspan="1"><p>ביטוי כללי מדי</p></td><td colspan="1" rowspan="1"><p>הרבה חשיפה, מעט המרות</p></td></tr><tr><td colspan="1" rowspan="1"><p>ביטוי מדויק</p></td><td colspan="1" rowspan="1"><p>פחות תנועה, אך איכותית</p></td></tr><tr><td colspan="1" rowspan="1"><p>ביטוי לא רלוונטי</p></td><td colspan="1" rowspan="1"><p>תנועה לא רלוונטית</p></td></tr></tbody></table>'),
                     '<p>סוג כוונה</p><p>דוגמה</p><p>משמעות</p><p>מידע</p><p>“איך לבחור בושם”</p><p>מחפש ידע</p><p>השוואה</p><p>“בושם X או Y”</p><p>מתלבט</p><p>רכישה</p><p>“לקנות בושם”</p><p>מוכן לפעולה</p>',
                     '<table style="min-width:75px"><colgroup><col style="min-width:25px" /><col style="min-width:25px" /><col style="min-width:25px" /></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>סוג כוונה</p></th><th colspan="1" rowspan="1"><p>דוגמה</p></th><th colspan="1" rowspan="1"><p>משמעות</p></th></tr><tr><td colspan="1" rowspan="1"><p>מידע</p></td><td colspan="1" rowspan="1"><p>“איך לבחור בושם”</p></td><td colspan="1" rowspan="1"><p>מחפש ידע</p></td></tr><tr><td colspan="1" rowspan="1"><p>השוואה</p></td><td colspan="1" rowspan="1"><p>“בושם X או Y”</p></td><td colspan="1" rowspan="1"><p>מתלבט</p></td></tr><tr><td colspan="1" rowspan="1"><p>רכישה</p></td><td colspan="1" rowspan="1"><p>“לקנות בושם”</p></td><td colspan="1" rowspan="1"><p>מוכן לפעולה</p></td></tr></tbody></table>'),
                   '<p>סוג ביטוי</p><p>יתרון</p><p>חיסרון</p><p>נפח גבוה</p><p>הרבה תנועה</p><p>תחרות גבוהה</p><p>נפח נמוך</p><p>תחרות נמוכה</p><p>פחות תנועה</p><p>בינוני</p><p>איזון</p><p>דורש דיוק</p>',
                   '<table style="min-width:75px"><colgroup><col style="min-width:25px" /><col style="min-width:25px" /><col style="min-width:25px" /></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>סוג ביטוי</p></th><th colspan="1" rowspan="1"><p>יתרון</p></th><th colspan="1" rowspan="1"><p>חיסרון</p></th></tr><tr><td colspan="1" rowspan="1"><p>נפח גבוה</p></td><td colspan="1" rowspan="1"><p>הרבה תנועה</p></td><td colspan="1" rowspan="1"><p>תחרות גבוהה</p></td></tr><tr><td colspan="1" rowspan="1"><p>נפח נמוך</p></td><td colspan="1" rowspan="1"><p>תחרות נמוכה</p></td><td colspan="1" rowspan="1"><p>פחות תנועה</p></td></tr><tr><td colspan="1" rowspan="1"><p>בינוני</p></td><td colspan="1" rowspan="1"><p>איזון</p></td><td colspan="1" rowspan="1"><p>דורש דיוק</p></td></tr></tbody></table>'),
       updated_at = now()
 where locale = 'he' and slug = 'seo-keywords-planning-tool';

update articles
   set content = replace(content, '>Rankings by Go Top</a>', '>Go Top SEO</a>'),
       updated_at = now()
 where content like '%>Rankings by Go Top</a>%';

do $$
declare pass int := 0; fail int := 0;
  c_planning text; c_other text;
begin
  select content into c_planning from articles where slug = 'seo-keywords-planning-tool';
  select content into c_other    from articles where slug = 'keywords-rankings-test';

  -- 1..3: each flattened run became a real table
  if (length(c_planning) - length(replace(c_planning, '<table', ''))) / 6 = 3
    then pass := pass + 1; raise notice 'PASS 1. the three tables are back';
    else fail := fail + 1; raise notice 'FAIL 1. tables = %', (length(c_planning) - length(replace(c_planning, '<table', ''))) / 6; end if;

  if c_planning like '%<th colspan="1" rowspan="1"><p>סוג ביטוי</p></th><th colspan="1" rowspan="1"><p>תוצאה אפשרית</p></th>%'
    then pass := pass + 1; raise notice 'PASS 2. table 1 header is a header row';
    else fail := fail + 1; raise notice 'FAIL 2. table 1 header'; end if;

  if c_planning like '%<td colspan="1" rowspan="1"><p>“לקנות בושם”</p></td>%'
    then pass := pass + 1; raise notice 'PASS 3. table 2 kept its curly quotes';
    else fail := fail + 1; raise notice 'FAIL 3. table 2 cell text'; end if;

  -- 4: no cell was left behind as a stray paragraph
  if c_planning not like '%<p>סוג ביטוי</p><p>%'
    then pass := pass + 1; raise notice 'PASS 4. no flattened run left';
    else fail := fail + 1; raise notice 'FAIL 4. a flattened run survived'; end if;

  -- 5: the prose around the tables is untouched
  if c_planning like '%<p>המטרה היא לא רק להביא גולשים, אלא להביא את הגולשים הנכונים.</p>%'
   and c_planning like '%<p>הבחירה הנכונה תלויה באסטרטגיה.</p>%'
    then pass := pass + 1; raise notice 'PASS 5. the prose between the tables is intact';
    else fail := fail + 1; raise notice 'FAIL 5. prose changed'; end if;

  -- 6: the anchor text was renamed, link and href untouched
  if c_other like '%<a href="https://www.gotopseo.com">Go Top SEO</a>%'
    then pass := pass + 1; raise notice 'PASS 6. the anchor text is Go Top SEO';
    else fail := fail + 1; raise notice 'FAIL 6. anchor text'; end if;

  -- 7: the same words OUTSIDE a link are left alone
  if c_other like '%Rankings by Go Top בתוך טקסט נשאר.%'
    then pass := pass + 1; raise notice 'PASS 7. the name in prose is not touched';
    else fail := fail + 1; raise notice 'FAIL 7. prose occurrence was rewritten'; end if;

  -- 8: the other article's own table is still there
  if c_other like '%<table style="min-width:50px">%'
    then pass := pass + 1; raise notice 'PASS 8. an untouched article keeps its table';
    else fail := fail + 1; raise notice 'FAIL 8. the other table was lost'; end if;

  raise notice '% passed, % failed', pass, fail;
  if fail > 0 then raise exception 'probe failed'; end if;
end $$;
