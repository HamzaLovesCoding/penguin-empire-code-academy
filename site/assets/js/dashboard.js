/* ============================================================================
   dashboard.js · renders the student dashboard from the course manifest and
   the progress store. Read-only: nothing here writes to localStorage.

   Every number on the page is derived from {lessonId: completedAt} — the same
   record the sidebar ticks come from — so there is no second source of truth
   to drift.
   ============================================================================ */
(function () {
  "use strict";
  const C = window.COURSE;
  const P = window.Progress;
  const svg = window.PEsvg, I = window.PEicons, url = window.PEurl, esc = window.PEesc;
  const DAY = 864e5;

  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

  function relDay(ts) {
    const days = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function model() {
    const rec = P.all();
    const lessons = C.allLessons();
    const ready = lessons.filter((l) => l.ready);
    const done = lessons.filter((l) => rec[l.id]);
    // Timestamps only matter for history views; a malformed one still counts
    // as done everywhere else.
    const stamped = done.filter((l) => Number.isFinite(rec[l.id])).map((l) => ({ ...l, at: rec[l.id] }));
    const next = ready.find((l) => !rec[l.id]) || null;

    const track = (id) => {
      const ls = lessons.filter((l) => l.trackId === id);
      return { total: ls.length, done: ls.filter((l) => rec[l.id]).length,
               ready: ls.filter((l) => l.ready), tr: C.tracks.find((t) => t.id === id) };
    };

    const units = [];
    C.tracks.forEach((tr) => tr.units.forEach((u) => {
      const r = u.lessons.filter((l) => l.ready);
      const n = r.filter((l) => rec[l.id]).length;
      units.push({ ...u, trackId: tr.id, n, total: u.lessons.length,
                   complete: r.length > 0 && n === r.length,
                   current: !!next && u.lessons.some((l) => l.id === next.id) });
    }));

    // Seven calendar days ending today.
    const today = startOfDay(Date.now());
    const week = Array.from({ length: 7 }, (_, i) => {
      const start = today - (6 - i) * DAY;
      return { start, n: stamped.filter((l) => l.at >= start && l.at < start + DAY).length };
    });

    return { rec, lessons, ready, done, stamped, next, units, week,
             java: track("java"), frc: track("frc"),
             currentTrack: next ? next.trackId : "frc" };
  }

  /* ------------------------------------------------------------ pieces -- */
  const arrowLink = (href, label) =>
    `<a class="stat-go" href="${url(href)}" aria-label="${esc(label)}">${svg(I.arrow)}</a>`;
  const up = `<svg viewBox="0 0 10 10" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5 5 3.5l3 3"/></svg>`;

  function statCards(m) {
    const thisWeek = m.week.reduce((a, d) => a + d.n, 0);
    const unitsDone = m.units.filter((u) => u.complete).length;
    const cur = m.units.find((u) => u.current);
    const pct = (t) => Math.round((t.done / Math.max(1, t.total)) * 100);
    return `
      <article class="dcard stat-card is-hero a-s1">
        <div class="stat-top"><span class="stat-t">Lessons completed</span>${arrowLink("/syllabus.html", "Open the curriculum")}</div>
        <div class="stat-n">${m.done.length}<small>/ ${m.lessons.length}</small></div>
        <div class="stat-foot">${thisWeek
          ? `<span class="stat-delta">${thisWeek}${up}</span> this week`
          : m.done.length ? "None yet this week" : "Your first one is waiting"}</div>
      </article>
      <article class="dcard stat-card a-s2">
        <div class="stat-top"><span class="stat-t">Phase 1 · Java</span>${arrowLink("/syllabus.html#java", "Phase 1 in the curriculum")}</div>
        <div class="stat-n">${m.java.done}<small>/ ${m.java.total}</small></div>
        <div class="stat-foot"><span class="stat-delta">${pct(m.java)}%</span> complete</div>
      </article>
      <article class="dcard stat-card a-s3">
        <div class="stat-top"><span class="stat-t">Phase 2 · FRC robot</span>${arrowLink("/syllabus.html#frc", "Phase 2 in the curriculum")}</div>
        <div class="stat-n">${m.frc.done}<small>/ ${m.frc.total}</small></div>
        <div class="stat-foot"><span class="stat-delta">${pct(m.frc)}%</span> complete</div>
      </article>
      <article class="dcard stat-card a-s4">
        <div class="stat-top"><span class="stat-t">Units finished</span>${arrowLink("/syllabus.html", "All units")}</div>
        <div class="stat-n">${unitsDone}<small>/ ${m.units.length}</small></div>
        <div class="stat-foot">${cur ? `Now in Unit ${esc(cur.num)} · ${esc(cur.title)}` : "Every unit finished"}</div>
      </article>`;
  }

  function activity(m) {
    const max = Math.max(1, ...m.week.map((d) => d.n));
    const total = m.week.reduce((a, d) => a + d.n, 0);
    // The busiest day gets the label; ties go to the most recent.
    const peak = total ? m.week.reduce((b, d, i) => (d.n >= m.week[b].n ? i : b), 0) : -1;
    const cols = m.week.map((d, i) => {
      const ratio = d.n / max;
      // Empty days get uneven striped placeholders, so a quiet week still
      // reads as a chart rather than a row of dots.
      const h = d.n ? 40 + ratio * 60 : [46, 62, 38, 70, 52, 80, 44][i];
      const c = ratio > 0.66 ? "var(--ocean-800)" : ratio > 0.33 ? "var(--ocean-600)" : "var(--ice-500)";
      const day = new Date(d.start).toLocaleDateString(undefined, { weekday: "narrow" });
      const full = new Date(d.start).toLocaleDateString(undefined, { weekday: "long" });
      const label = `${full}: ${d.n} lesson${d.n === 1 ? "" : "s"}`;
      return `<div class="act-col${i === 6 ? " is-today" : ""}" title="${esc(label)}">
          <div class="act-well">
            <div class="act-bar${d.n ? "" : " is-empty"}" style="--h:${h}%;--c:${c};--d:${i * 55}ms"></div>
            ${i === peak ? `<span class="act-tip" style="--h:${h}%">${d.n} lesson${d.n === 1 ? "" : "s"}</span>` : ""}
          </div>
          <span class="act-day" aria-hidden="true">${day}</span>
        </div>`;
    }).join("");
    const desc = m.week.map((d) => `${new Date(d.start).toLocaleDateString(undefined, { weekday: "short" })} ${d.n}`).join(", ");
    return `
      <section class="dcard a-ac" aria-labelledby="ac-h">
        <div class="dcard-h"><h2 id="ac-h">This week</h2>
          <span class="chip">${svg(I.signal)} ${total} lesson${total === 1 ? "" : "s"} finished</span></div>
        <div class="act" role="img" aria-label="Lessons finished per day, last 7 days: ${esc(desc)}">${cols}</div>
        ${total ? "" : `<p class="act-note">Finish a lesson and it shows up here. Striped bars are days with nothing finished yet.</p>`}
      </section>`;
  }

  function upNext(m) {
    if (!m.next) {
      const ex = (C.exams || []).find((e) => e.ready);
      return `
        <section class="dcard up-card a-up" aria-labelledby="up-h">
          <div class="dcard-h"><h2 id="up-h">Up next</h2></div>
          <div class="up-body">
            <div class="up-k">Every lesson is done</div>
            <div class="up-t">Prove it on the phase exams</div>
            <p class="up-meta">Twenty-five questions each, scored per section.</p>
          </div>
          ${ex ? `<a class="btn btn--primary" href="${url(ex.href)}">${svg(I.exam)} Open the exam</a>` : ""}
        </section>`;
    }
    const n = m.next;
    const first = !m.done.length;
    return `
      <section class="dcard up-card a-up" aria-labelledby="up-h">
        <div class="dcard-h"><h2 id="up-h">${first ? "Start here" : "Up next"}</h2></div>
        <div class="up-body">
          <div class="up-k">Unit ${esc(n.unitNum)} · ${esc(n.unitTitle)}</div>
          <div class="up-t">${esc(n.t)}</div>
          <p class="up-meta">${[n.dur, n.diff].filter(Boolean).map(esc).join(" · ")}</p>
        </div>
        <a class="btn btn--primary" href="${url(n.href)}">${svg(I.play)} ${first ? "Start lesson 1" : "Continue lesson"}</a>
      </section>`;
  }

  function unitList(m) {
    const inTrack = m.units.filter((u) => u.trackId === m.currentTrack);
    const at = Math.max(0, inTrack.findIndex((u) => u.current));
    // A window around the current unit: one behind for context, then what's ahead.
    const from = Math.max(0, Math.min(at - 1, inTrack.length - 5));
    const show = inTrack.slice(from, from + 5);
    const tr = C.tracks.find((t) => t.id === m.currentTrack);
    const rows = show.map((u) => {
      const state = u.complete ? "is-done" : u.current ? "is-current" : "";
      const nextIn = u.lessons.find((l) => l.ready && !m.rec[l.id]);
      const sub = u.complete ? "Complete"
        : u.current && nextIn ? `<b>${u.n}/${u.total}</b> · next: ${esc(nextIn.t)}`
        : `${u.n}/${u.total} lessons`;
      const first = u.lessons.find((l) => l.ready);
      const href = (u.current && nextIn ? nextIn : first)?.href;
      const inner = `<span class="drow-ic ${state}">${u.complete ? svg(I.check) : esc(u.num)}</span>
          <span class="drow-tx"><span class="drow-t">${esc(u.title)}</span><span class="drow-s">${sub}</span></span>`;
      return `<li>${href ? `<a class="drow" href="${url(href)}">${inner}</a>` : `<div class="drow">${inner}</div>`}</li>`;
    }).join("");
    return `
      <section class="dcard a-un" aria-labelledby="un-h">
        <div class="dcard-h"><h2 id="un-h">${esc(tr.tag)} units</h2><a class="pill-link" href="${url("/syllabus.html#" + tr.id)}">All units</a></div>
        <ul class="dlist">${rows}</ul>
      </section>`;
  }

  function recent(m) {
    const list = [...m.stamped].sort((a, b) => b.at - a.at).slice(0, 4);
    const body = list.length
      ? `<ul class="dlist">${list.map((l) => {
          const when = relDay(l.at);
          const cls = when === "Today" ? "status--good" : when === "Yesterday" ? "status--ocean" : "status--muted";
          return `<li><a class="drow" href="${url(l.href)}">
            <span class="drow-ic is-round">${esc(l.unitNum)}</span>
            <span class="drow-tx"><span class="drow-t">${esc(l.t)}</span><span class="drow-s">Unit ${esc(l.unitNum)} · <b>${esc(l.unitTitle)}</b></span></span>
            <span class="status ${cls}">${when}</span></a></li>`;
        }).join("")}</ul>`
      : `<div class="dempty"><b>Nothing finished yet</b>Press “Mark as complete” at the end of a lesson and it lands here.</div>`;
    return `
      <section class="dcard a-rc" aria-labelledby="rc-h">
        <div class="dcard-h"><h2 id="rc-h">Recently completed</h2><a class="pill-link" href="${url("/syllabus.html")}">Curriculum</a></div>
        ${body}
      </section>`;
  }

  function gauge(m) {
    const total = m.lessons.length;
    const done = m.done.length;
    const cur = m.units.find((u) => u.current);
    const inUnit = cur ? cur.lessons.filter((l) => l.ready && !m.rec[l.id]).length : 0;
    const pct = Math.round((done / Math.max(1, total)) * 100);
    // Segment lengths on a pathLength=100 arc, with a small gap between them.
    const a = (done / total) * 100, b = (inUnit / total) * 100, gap = done && inUnit ? 3 : 0;
    const arc = "M 20 120 A 100 100 0 0 1 220 120";
    return `
      <section class="dcard a-ga" aria-labelledby="ga-h">
        <div class="dcard-h"><h2 id="ga-h">Course progress</h2></div>
        <div class="gauge" role="img" aria-label="${pct}% of the course complete: ${done} lessons done, ${inUnit} left in your current unit">
          <svg viewBox="0 0 240 132" aria-hidden="true">
            <defs><pattern id="gHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.6" height="7" fill="#b7c3c8"/></pattern></defs>
            <path class="g-track" d="${arc}" fill="none" stroke-width="30" pathLength="100"/>
            ${b ? `<path class="g-seg" d="${arc}" fill="none" stroke="var(--ocean-900)" stroke-width="30" stroke-linecap="round" pathLength="100" stroke-dasharray="${Math.max(0.01, b - gap)} 200" stroke-dashoffset="${-(a + gap)}"/>` : ""}
            ${a ? `<path class="g-seg" d="${arc}" fill="none" stroke="var(--ocean-600)" stroke-width="30" stroke-linecap="round" pathLength="100" stroke-dasharray="${a} 200"/>` : ""}
          </svg>
          <div class="gauge-c"><b>${pct}%</b><span>of the course complete</span></div>
        </div>
        <div class="legend">
          <span><i style="--c:var(--ocean-600)"></i>Completed</span>
          <span><i style="--c:var(--ocean-900)"></i>Left in this unit</span>
          <span><i class="hatch"></i>Still ahead</span>
        </div>
      </section>`;
  }

  function examCard(m) {
    const t = m[m.currentTrack];
    const ex = C.examFor(m.currentTrack);
    const left = t.ready.filter((l) => !m.rec[l.id]).length;
    const ready = left === 0;
    return `
      <section class="dcard exam-card a-ex" aria-labelledby="ex-h">
        <div class="dcard-h"><h2 id="ex-h">${esc(t.tr.tag)} exam</h2><span class="exam-ic" aria-hidden="true">${svg(I.exam)}</span></div>
        <div class="exam-body">
          <div class="exam-n">${ready ? "Ready" : left}</div>
          <div class="exam-l">${ready ? "Every lesson in this phase is done." : `lesson${left === 1 ? "" : "s"} to go before you're ready`}<br>25 questions, scored by section</div>
        </div>
        ${ex && ex.ready ? `<a class="btn" href="${url(ex.href)}">${ready ? "Take the exam" : "Preview the exam"} →</a>` : ""}
      </section>`;
  }

  /* ------------------------------------------------------------ render -- */
  function render() {
    const root = document.getElementById("dash-root");
    if (!root) return;
    const m = model();
    const first = !m.done.length;
    root.innerHTML = `
      <header class="dash-head">
        <div>
          <h1>${first ? "Welcome aboard" : "Dashboard"}</h1>
          <p>${first ? `${m.lessons.length} lessons stand between you and the competition robot. Here's where they start.`
                     : "Pick up where you left off, and see how far you've come."}</p>
        </div>
        <div class="dash-actions">
          ${m.next ? `<a class="btn btn--primary" href="${url(m.next.href)}">${svg(I.play)} ${first ? "Start lesson 1" : "Continue"}</a>` : ""}
          <a class="btn btn--ghost" href="${url("/syllabus.html")}">${svg(I.map)} Curriculum</a>
        </div>
      </header>
      <div class="dash-grid">
        ${statCards(m)}
        ${activity(m)}
        ${upNext(m)}
        ${unitList(m)}
        ${recent(m)}
        ${gauge(m)}
        ${examCard(m)}
      </div>`;
  }

  const start = () => {
    render();
    // Another tab finishing a lesson should show up here without a reload.
    window.addEventListener("storage", (e) => { if (e.key === C.meta.storageKey) render(); });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
