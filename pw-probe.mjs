import { chromium } from 'playwright-core';
const url = process.argv[2];
const b = await chromium.launch({ executablePath: process.env.PW_EXEC || undefined, args:['--no-sandbox'] });
const p = await b.newPage({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' });
try {
  await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
} catch(e) { console.log('NAVWARN', e.message); }
await p.waitForTimeout(3000);
const data = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('input,select,textarea,label,button').forEach(el=>{
    const t = el.tagName.toLowerCase();
    let s = `${t}` + (el.type?`[${el.type}]`:'') + (el.name?` name=${el.name}`:'') + (el.id?` id=${el.id}`:'');
    if (el.placeholder) s += ` ph="${el.placeholder}"`;
    if (t==='label'||t==='button') s += ` text="${(el.innerText||'').trim().slice(0,80)}"`;
    if (t==='select') s += ' opts=' + [...el.options].map(o=>o.text.trim()).join(' | ');
    if (el.required) s += ' REQUIRED';
    out.push(s);
  });
  return { fields: out, text: document.body.innerText.slice(0, 3000) };
});
console.log('--FIELDS--'); console.log(data.fields.join('\n'));
console.log('--TEXT--'); console.log(data.text);
await b.close();
