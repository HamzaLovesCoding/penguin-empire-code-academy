// Functional widget smoke test: does clicking Check actually grade correctly?
import puppeteer from "puppeteer-core";
import { createRequire } from "node:module";
const CHROME=process.env.CHROME_PATH||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE="http://localhost:4321";
// Default to every ready lesson in the manifest, so this can't drift out of
// sync as lessons are flipped live.
const require = createRequire(import.meta.url);
global.window = {};
require("./site/assets/js/course.js");
// Exams carry scored checkpoints and challenges too, so they belong in the
// smoke run. Reference pages have no widgets and are skipped.
const C = global.window.COURSE;
const page_paths = process.argv.slice(2).length ? process.argv.slice(2)
  : [...C.readyList().map((l) => l.href),
     ...(C.exams || []).filter((e) => e.ready).map((e) => e.href)];
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
let fails=0;
for (const p of page_paths) {
  const pg=await b.newPage();
  await pg.setViewport({width:1440,height:1000});
  // The lesson pages embed third-party compiler iframes that keep loading and
  // can detach a frame mid-evaluate. domcontentloaded plus a settle beat is
  // enough for the widgets, which are wired on DOMContentLoaded.
  await pg.goto(BASE+p,{waitUntil:"domcontentloaded"}).catch(()=>{});
  await new Promise(r=>setTimeout(r,900));
  const evaluateWidgets = () => pg.evaluate(() => {
    const out=[];
    const $$=(s,r=document)=>[...r.querySelectorAll(s)];
    // --- short answer: correct then wrong ---
    $$('.challenge[data-kind="text"]').forEach((ch,i)=>{
      const inp=ch.querySelector(".answer-input"), btn=ch.querySelector(".check-btn");
      const ans=(inp.dataset.answer||"").split("|")[0];
      inp.value=ans; btn.click();
      const good=ch.querySelector(".feedback")?.classList.contains("good");
      inp.value="___definitely wrong___"; btn.click();
      const bad=ch.querySelector(".feedback")?.classList.contains("bad");
      out.push({w:`text#${i+1}`, ok: good&&bad, detail:`correct→${good?"good":"BAD"} wrong→${bad?"bad":"GOOD?!"}`});
    });
    // --- fill in blank ---
    $$('.challenge[data-kind="fib"]').forEach((ch,i)=>{
      const blanks=$$(".blank",ch), btn=ch.querySelector(".check-btn");
      blanks.forEach(bl=>bl.textContent=(bl.dataset.answer||"").split("|")[0]);
      btn.click();
      const good=ch.querySelector(".feedback")?.classList.contains("good");
      blanks.forEach(bl=>bl.textContent="zzz"); btn.click();
      const bad=ch.querySelector(".feedback")?.classList.contains("bad");
      out.push({w:`fib#${i+1}`, ok:good&&bad, detail:`correct→${good?"good":"BAD"} wrong→${bad?"bad":"GOOD?!"}`});
    });
    // --- mcq ---
    $$('.challenge[data-kind="mcq"]').forEach((ch,i)=>{
      const opts=$$(".option",ch), btn=ch.querySelector(".check-btn");
      const right=opts.find(o=>o.hasAttribute("data-correct"));
      right.querySelector("input").checked=true;
      right.dispatchEvent(new Event("change",{bubbles:true}));
      right.querySelector("input").checked=true;
      btn.click();
      const good=ch.querySelector(".feedback")?.classList.contains("good");
      out.push({w:`mcq#${i+1}`, ok:good, detail:`correct→${good?"good":"BAD"}`});
    });
    // --- checkpoint: answer all correctly, expect full score ---
    $$(".checkpoint").forEach((cp,i)=>{
      const qs=$$(".cp-q",cp);
      qs.forEach(q=>{ const r=$$(".option",q).find(o=>o.hasAttribute("data-correct"));
        r.querySelector("input").checked=true; });
      cp.querySelector(".check-btn").click();
      const txt=cp.querySelector(".cp-score")?.textContent||"";
      out.push({w:`checkpoint#${i+1}`, ok: txt.trim()===`${qs.length} / ${qs.length}`, detail:`score reads "${txt.trim()}" for ${qs.length} questions`});
    });
    return out;
  });
  let res;
  try {
    res = await evaluateWidgets();
  } catch (e) {
    await new Promise(r=>setTimeout(r,1200));
    res = await evaluateWidgets();          // one retry after a detached frame
  }
  const bad=res.filter(r=>!r.ok);
  console.log(`${bad.length?"✗":"✓"} ${p}  (${res.length} widgets)`);
  bad.forEach(r=>{ console.log(`    ${r.w}: ${r.detail}`); fails++; });
  await pg.close();
}
await b.close();
console.log(fails?`\n${fails} widget(s) misbehaving`:"\nAll widgets grade correctly");
process.exit(fails?1:0);
