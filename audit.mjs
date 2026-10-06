// Lesson QA gate for the Penguin Empire 2551 site.
//
//   node audit.mjs                     # audit every ready lesson + home + syllabus
//   node audit.mjs /lessons/java/foo   # audit one path
//   node audit.mjs --all               # audit every manifest lesson, ready or not
//
// Checks, per page: console errors, page errors, failed network requests,
// broken internal links, and the widget-markup contract that widgets.js relies
// on. A widget whose markup is subtly wrong fails silently in the browser --
// the student just clicks "Check" and nothing happens -- so we assert it here.
//
// Exits nonzero if anything fails, so it can gate a batch.
import puppeteer from "puppeteer-core";
import { createRequire } from "node:module";

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE || "http://localhost:4321";

/* ---- load the manifest (it assigns to `window`) ------------------------- */
const require = createRequire(import.meta.url);
global.window = {};
require("./site/assets/js/course.js");
const COURSE = global.window.COURSE;

const args = process.argv.slice(2);
const wantAll = args.includes("--all");
const explicit = args.filter((a) => !a.startsWith("--"));

let targets;
if (explicit.length) {
  targets = explicit;
} else {
  const lessons = wantAll ? COURSE.allLessons() : COURSE.readyList();
  // Reference pages and exams live outside the lesson sequence, so they are
  // not in readyList() — audit them explicitly or they never get checked.
  const extras = [
    ...(COURSE.resources || []).filter((r) => wantAll || r.ready),
    ...(COURSE.exams || []).filter((e) => wantAll || e.ready),
  ];
  targets = [
    "/", "/syllabus.html",
    ...lessons.map((l) => l.href || `/lessons/${l.id}`),
    ...extras.map((e) => e.href),
  ];
}

const validLessonIds = new Set(COURSE.allLessons().map((l) => l.id));

/* ---- the widget-markup contract, evaluated in the page ------------------ */
function auditMarkup(validIds) {
  const problems = [];
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const near = (el) => {
    const h = el.closest("section, .challenge, .checkpoint, .exercise");
    const t = h?.querySelector(".ch-title, h2, h3")?.textContent?.trim();
    return t ? ` (near "${t.slice(0, 48)}")` : "";
  };

  // data-lesson must resolve to a real manifest id, or progress silently breaks.
  const lessonId = document.body.dataset.lesson;
  if (document.body.dataset.page === "lesson") {
    if (!lessonId) problems.push('body[data-page="lesson"] has no data-lesson');
    else if (!validIds.includes(lessonId))
      problems.push(`data-lesson="${lessonId}" is not in the course manifest`);
  }

  $$('.challenge[data-kind="fib"]').forEach((ch) => {
    if (!$$(".blank[data-answer]", ch).length)
      problems.push("fill-in-blank with no .blank[data-answer]" + near(ch));
    $$(".blank", ch).forEach((b) => {
      if (!b.dataset.answer) problems.push("a .blank is missing data-answer" + near(ch));
    });
    if (!ch.querySelector(".check-btn")) problems.push("fill-in-blank has no .check-btn" + near(ch));
    if (!ch.querySelector(".feedback")) problems.push("fill-in-blank has no .feedback" + near(ch));
  });

  $$('.challenge[data-kind="text"]').forEach((ch) => {
    const input = ch.querySelector(".answer-input");
    if (!input) problems.push("short-answer with no .answer-input" + near(ch));
    else if (!input.dataset.answer)
      problems.push(".answer-input is missing data-answer" + near(ch));
    if (!ch.querySelector(".check-btn")) problems.push("short-answer has no .check-btn" + near(ch));
    if (!ch.querySelector(".feedback")) problems.push("short-answer has no .feedback" + near(ch));
  });

  $$('.challenge[data-kind="mcq"]').forEach((ch) => {
    const opts = $$(".option", ch);
    if (opts.length < 2) problems.push(`mcq has ${opts.length} option(s)` + near(ch));
    const correct = opts.filter((o) => o.hasAttribute("data-correct"));
    if (correct.length !== 1)
      problems.push(`mcq has ${correct.length} options marked data-correct (need exactly 1)` + near(ch));
    opts.forEach((o) => {
      if (!o.querySelector('input[type="radio"]'))
        problems.push("an .option has no radio input" + near(ch));
    });
    const names = new Set(opts.map((o) => o.querySelector("input")?.name).filter(Boolean));
    if (names.size > 1) problems.push("mcq options span multiple radio groups" + near(ch));
    if (!names.size) problems.push("mcq radios have no name attribute" + near(ch));
    if (!ch.querySelector(".check-btn")) problems.push("mcq has no .check-btn" + near(ch));
    if (!ch.querySelector(".feedback")) problems.push("mcq has no .feedback" + near(ch));
  });

  $$(".checkpoint").forEach((cp) => {
    const qs = $$(".cp-q", cp);
    if (!qs.length) problems.push("checkpoint has no .cp-q");
    if (!cp.querySelector(".cp-score")) problems.push("checkpoint has no .cp-score");
    if (!cp.querySelector(".check-btn")) problems.push("checkpoint has no .check-btn");
    qs.forEach((q, i) => {
      const opts = $$(".option", q);
      if (opts.length < 2) problems.push(`checkpoint Q${i + 1} has ${opts.length} option(s)`);
      if (opts.filter((o) => o.hasAttribute("data-correct")).length !== 1)
        problems.push(`checkpoint Q${i + 1} needs exactly one data-correct option`);
      // Wrong answers must teach -- every option carries an explanation.
      opts.forEach((o) => {
        if (!o.dataset.explain) problems.push(`checkpoint Q${i + 1} has an option with no data-explain`);
      });
      const names = new Set(opts.map((o) => o.querySelector("input")?.name).filter(Boolean));
      if (names.size !== 1) problems.push(`checkpoint Q${i + 1} radio group name is missing or split`);
    });
    // A score readout that says "0 / 4" over 3 questions is a real bug students see.
    const score = cp.querySelector(".cp-score")?.textContent?.match(/\/\s*(\d+)/);
    if (score && Number(score[1]) !== qs.length)
      problems.push(`checkpoint .cp-score says "/ ${score[1]}" but there are ${qs.length} questions`);
  });

  // widgets.js consumes the .sb-src <script> when it replaces the box's
  // innerHTML, so by now a healthy sandbox shows .sandbox-frame instead.
  // Only a box with neither is genuinely broken.
  $$(".sandbox[data-compiler]").forEach((box) => {
    if (!box.querySelector(".sb-src") && !box.querySelector(".sandbox-frame"))
      problems.push("sandbox[data-compiler] never rendered (no .sb-src source and no iframe)");
  });

  // Line numbering splits on newlines, so block comments break the rendering.
  $$(".code.with-lines pre code").forEach((code) => {
    if (code.textContent.includes("/*"))
      problems.push("a .code.with-lines block uses /* */ comments (use // -- see README)");
  });

  $$(".order-list").forEach((list) => {
    const items = $$(".order-item", list);
    const pos = items.map((i) => Number(i.dataset.pos));
    const expected = items.map((_, i) => i + 1);
    if (pos.some(Number.isNaN)) problems.push("an .order-item is missing data-pos");
    else if ([...pos].sort((a, b) => a - b).join() !== expected.join())
      problems.push(`.order-list data-pos values are not 1..${items.length}`);
  });

  const links = $$("a[href]")
    .map((a) => a.getAttribute("href"))
    .filter((h) => h && !/^(https?:|mailto:|tel:|#)/.test(h));

  return { problems, links };
}

/* ---- run ---------------------------------------------------------------- */
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

const linkCache = new Map();
async function linkOk(page, href) {
  const url = new URL(href, BASE).toString();
  if (linkCache.has(url)) return linkCache.get(url);
  const ok = await page
    .evaluate(async (u) => {
      try {
        const r = await fetch(u, { method: "GET" });
        return r.ok;
      } catch {
        return false;
      }
    }, url)
    .catch(() => false);
  linkCache.set(url, ok);
  return ok;
}

let failed = 0;
for (const target of targets) {
  const url = target.startsWith("http") ? target : BASE + target;
  const page = await browser.newPage();
  const consoleErrors = [];
  const netErrors = [];

  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => {
    // The OneCompiler iframe is third-party; don't fail a lesson on their network.
    if (!/onecompiler\.com/.test(r.url())) netErrors.push(`${r.url()} — ${r.failure()?.errorText}`);
  });

  const resp = await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 500));

  const issues = [];
  if (!resp || !resp.ok()) issues.push(`page returned ${resp ? resp.status() : "no response"}`);

  let links = [];
  if (resp && resp.ok()) {
    const res = await page.evaluate(auditMarkup, [...validLessonIds]);
    issues.push(...res.problems);
    links = res.links;
  }

  for (const href of new Set(links)) {
    if (!(await linkOk(page, href))) issues.push(`broken link → ${href}`);
  }

  // Mobile pass: the page body must never scroll sideways. Wide content
  // (code, tables) has to scroll inside its own container instead.
  if (resp && resp.ok()) {
    await page.setViewport({ width: 390, height: 800, isMobile: true, deviceScaleFactor: 2 });
    await page.reload({ waitUntil: "networkidle2" }).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const sw = document.documentElement.scrollWidth;
      if (sw <= vw + 1) return null;
      const worst = [...document.querySelectorAll("*")]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter((x) => x.r.right > vw + 1 && getComputedStyle(x.el).overflowX === "visible")
        .sort((a, b) => b.r.right - a.r.right)[0];
      return {
        vw, sw,
        who: worst ? `<${worst.el.tagName.toLowerCase()} class="${(worst.el.className || "").toString().slice(0, 40)}">` : "unknown",
      };
    });
    if (m) issues.push(`horizontal overflow at 390px: page is ${m.sw}px wide — widest offender ${m.who}`);
  }

  issues.push(...consoleErrors.map((e) => `console error: ${e}`));
  issues.push(...netErrors.map((e) => `failed request: ${e}`));

  if (issues.length) {
    failed++;
    console.log(`\n✗ ${target}`);
    issues.forEach((i) => console.log(`    ${i}`));
  } else {
    console.log(`✓ ${target}`);
  }
  await page.close();
}

await browser.close();
console.log(
  `\n${targets.length - failed}/${targets.length} pages clean` + (failed ? ` — ${failed} FAILED` : "")
);
process.exit(failed ? 1 : 0);
