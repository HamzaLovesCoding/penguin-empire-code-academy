/* ============================================================================
   site.js · builds shared chrome, mobile drawer, reading-progress bar,
   prev-next, lesson search, and the localStorage progress store.
   Pages only need: <body data-page="home|dashboard|syllabus|lesson|exam|reference"
   data-lesson="id"> and a <main id="main"> with their content.

   Two shells: the home page gets the marketing header + footer; every other
   page is wrapped in the portal (floating sidebar, top bar, white panel).
   ============================================================================ */
(function () {
  "use strict";
  const C = window.COURSE;
  const BASE = (window.SITE_BASE || "").replace(/\/$/, ""); // optional sub-path support
  const url = (p) => BASE + p;

  /* ---------------------------------------------------- icon library ---- */
  const I = {
    menu: 'M4 7h16M4 12h16M4 17h16',
    check: 'M20 6 9 17l-5-5',
    chevron: 'M9 6l6 6-6 6',
    lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
    book: 'M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM18 3v16',
    map: 'M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2z M9 4v14 M15 6v14',
    clock: 'M12 8v4l3 2 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    signal: 'M3 20h2v-4H3zM9 20h2V10H9zM15 20h2V4h-2z',
    spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
    dash: 'M4 4h6v7H4z M14 4h6v4h-6z M14 12h6v8h-6z M4 15h6v5H4z',
    home: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4',
    arrow: 'M7 17 17 7 M8 7h9v9',
    play: 'M8 5l11 7-11 7z',
    exam: 'M9 11l3 3 8-8 M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    code: 'M8 7l-5 5 5 5 M16 7l5 5-5 5',
    chip: 'M7 7h10v10H7z M10 3v4 M14 3v4 M10 17v4 M14 17v4 M3 10h4 M3 14h4 M17 10h4 M17 14h4',
    glossary: 'M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z',
    link: 'M14 4h6v6 M10 14 20 4 M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  };
  function svg(d, cls) {
    return `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${
      d.split('M').filter(Boolean).map((seg) => `<path d="M${seg.trim()}"/>`).join('')
    }</svg>`;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Manifest titles are authored as plain text ("Variables & Data Types"), but
  // a few may already carry entities, so decode once before escaping.
  const plain = (s) => { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; };

  /* ---------------------------------------------------- theme ---------- */
  // Each page's <head> sets data-theme before first paint (saved choice, else
  // the OS setting). This only handles the toggle and live OS changes.
  const THEME_KEY = "pe-theme";
  const Theme = {
    saved() { try { return localStorage.getItem(THEME_KEY); } catch { return null; } },
    apply(t) {
      document.documentElement.dataset.theme = t;
      document.querySelectorAll(".theme-toggle").forEach((b) => {
        b.setAttribute("aria-pressed", String(t === "dark"));
        b.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
      });
    },
    toggle() {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem(THEME_KEY, next); } catch {}
      Theme.apply(next);
    },
  };
  const themeButton = (cls) =>
    `<button class="tb-icon theme-toggle ${cls || ''}" type="button" aria-label="Dark mode" aria-pressed="false">${svg(I.moon, 'ic-moon')}${svg(I.sun, 'ic-sun')}</button>`;
  document.addEventListener("click", (e) => { if (e.target.closest(".theme-toggle")) Theme.toggle(); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!Theme.saved()) Theme.apply(e.matches ? "dark" : "light");
  });

  /* ---------------------------------------------------- sidebar collapse - */
  // Desktop only: the menu button folds the sidebar away and the panel takes
  // the width. Below the drawer breakpoint the same button opens the drawer.
  const SIDEBAR_KEY = "pe-sidebar";
  const wideMQ = matchMedia("(min-width: 1025px)");
  const sidebarCollapsed = () => document.documentElement.dataset.sidebar === "collapsed";
  function setCollapsed(c) {
    document.documentElement.dataset.sidebar = c ? "collapsed" : "open";
    try { localStorage.setItem(SIDEBAR_KEY, c ? "collapsed" : "open"); } catch {}
    syncMenuToggle();
  }
  function syncMenuToggle() {
    const b = document.querySelector(".topbar .menu-toggle");
    if (!b) return;
    const open = wideMQ.matches ? !sidebarCollapsed() : document.body.classList.contains("nav-open");
    b.setAttribute("aria-expanded", String(open));
    b.setAttribute("aria-label", open ? "Hide course menu" : "Show course menu");
    b.title = b.getAttribute("aria-label");
  }
  wideMQ.addEventListener("change", syncMenuToggle);

  /* ---------------------------------------------------- progress store -- */
  // The storage key and the {lessonId: completedAt} shape are a contract with
  // every student's browser. Changing either wipes their progress.
  const KEY = C.meta.storageKey;
  const Progress = {
    _read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    _write(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} },
    isDone(id) { return !!this._read()[id]; },
    set(id, v) { const o = this._read(); if (v) o[id] = Date.now(); else delete o[id]; this._write(o); this._emit(); },
    toggle(id) { this.set(id, !this.isDone(id)); return this.isDone(id); },
    doneCount() { const o = this._read(); return C.allLessons().filter((l) => o[l.id]).length; },
    total() { return C.allLessons().length; },
    pct() { return Math.round((this.doneCount() / Math.max(1, this.total())) * 100); },
    // Read-only copy of {lessonId: completedAt}, for the dashboard's history views.
    all() { return { ...this._read() }; },
    _subs: [],
    onChange(fn) { this._subs.push(fn); },
    _emit() { this._subs.forEach((fn) => fn()); },
  };
  window.Progress = Progress;

  // First ready lesson the student hasn't finished, or null when they're done.
  const nextLesson = () => C.readyList().find((l) => !Progress.isDone(l.id)) || null;
  window.PEnext = nextLesson;

  // Rank shown in the top bar, tied to curriculum milestones rather than an
  // arbitrary percentage so it means something on the team.
  function rankTitle() {
    const done = (trackId) => C.allLessons().filter((l) => l.trackId === trackId && l.ready).every((l) => Progress.isDone(l.id));
    if (!Progress.doneCount()) return "New recruit";
    if (done("java") && done("frc")) return "Lead programmer";
    if (done("java")) return "Robot programmer";
    return "Java rookie";
  }

  // Path of the page we're on, normalised to match manifest hrefs.
  const herePath = () => {
    let p = location.pathname;
    if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length) || "/";
    return p.replace(/\.html$/, "").replace(/\/index$/, "/");
  };
  const samePath = (href) => href.replace(/\.html$/, "") === herePath();

  /* ---------------------------------------------------- HOME HEADER ----- */
  function buildHeader(page) {
    const h = document.createElement("header");
    h.className = "site-header";
    const next = Progress.doneCount() ? nextLesson() : null;
    const cta = next
      ? `<a class="btn btn--sm btn--primary" href="${url(next.href)}">Continue</a>`
      : `<a class="btn btn--sm btn--primary" href="${url('/lessons/java/what-is-programming.html')}">Start learning</a>`;
    h.innerHTML = `
      <a class="brand-lockup" href="${url('/')}" aria-label="Home — Penguin Empire 2551">
        <img src="${url('/assets/img/logo-2551.png')}" alt="" width="40" height="40">
        <span class="brand-name">Penguin <b>Empire</b><span class="brand-sub">2551 · Code Academy</span></span>
      </a>
      <span class="header-spacer"></span>
      <nav class="header-nav">
        <a href="${url('/')}" data-nav="home">Home</a>
        <a href="${url('/dashboard.html')}" data-nav="dashboard">Dashboard</a>
        <a href="${url('/syllabus.html')}" data-nav="syllabus">Curriculum</a>
        ${themeButton()}
        ${cta}
      </nav>`;
    h.querySelector(`[data-nav="${page}"]`)?.classList.add("is-active");
    return h;
  }

  /* ---------------------------------------------------- SIDEBAR --------- */
  function buildSidebar(currentId, page) {
    const aside = document.createElement("aside");
    aside.className = "sidebar";
    aside.id = "course-nav";
    aside.setAttribute("aria-label", "Course navigation");

    // Off a lesson page, open the unit the student is working through.
    const focusId = currentId || nextLesson()?.id;

    const menu = [
      { t: "Dashboard", href: "/dashboard.html", ic: I.dash, on: page === "dashboard" },
      { t: "Curriculum", href: "/syllabus.html", ic: I.map, on: page === "syllabus" },
    ];
    const refIcons = { "ref-java": I.code, "ref-wpilib": I.chip, "ref-glossary": I.glossary, "ref-docs": I.link };

    let html = `
      <a class="sb-brand" href="${url('/')}" aria-label="Penguin Empire 2551 — back to the home page">
        <img src="${url('/assets/img/logo-2551.png')}" alt="" width="42" height="42">
        <span class="sb-brand-name">Penguin <b>Empire</b><span class="sb-brand-sub">2551 · Code Academy</span></span>
      </a>
      <div class="sb-scroll">
        <div class="sb-label">Menu</div>
        <nav class="sb-nav">
          ${menu.map((m) => `<a class="sb-link${m.on ? " is-active" : ""}" href="${url(m.href)}"${m.on ? ' aria-current="page"' : ""}>${svg(m.ic)}<span>${m.t}</span></a>`).join("")}
        </nav>`;

    C.tracks.forEach((tr) => {
      html += `<div class="nav-track"><div class="nav-track-title">${tr.tag} · ${tr.id === "java" ? "Java & OOP" : "FRC Robot"}<span class="rule"></span></div>`;
      tr.units.forEach((u) => {
        const hasCurrent = u.lessons.some((l) => l.id === focusId);
        html += `<div class="nav-unit${hasCurrent ? " has-current" : ""}" data-unit="${u.id}" aria-expanded="${hasCurrent ? "true" : "false"}">
          <button class="nav-unit-btn" type="button">
            <span class="nav-unit-num">${u.num}</span>
            <span class="nav-unit-name">${u.title}</span>
            <span class="nav-unit-meta" data-unit-meta></span>
            ${svg(I.chevron, "chev")}
          </button>
          <ul class="nav-lessons">`;
        u.lessons.forEach((l) => {
          const done = Progress.isDone(l.id);
          const cur = l.id === currentId;
          const cls = [l.ready ? "" : "is-locked", done ? "is-done" : "", cur ? "is-current" : ""].join(" ").trim();
          const href = l.ready ? url(l.href) : null;
          const tail = l.ready
            ? `<span class="nav-check">${svg(I.check)}</span>`
            : svg(I.lock, "nav-lock");
          html += href
            ? `<li><a href="${href}" class="${cls}" data-lesson-link="${l.id}"${cur ? ' aria-current="page"' : ""}><span class="nav-lesson-t">${l.t}</span>${tail}</a></li>`
            : `<li><a class="${cls}" aria-disabled="true" title="Locked"><span class="nav-lesson-t">${l.t}</span>${tail}</a></li>`;
        });
        html += `</ul></div>`;
      });
      // The phase exam closes out the track, outside the lesson count.
      const ex = C.examFor(tr.id);
      if (ex && ex.ready) {
        const on = samePath(ex.href);
        html += `<div class="nav-unit" aria-expanded="true"><ul class="nav-lessons" style="margin-left:12px;border-left:0">
          <li><a class="nav-exam${on ? " is-current" : ""}" href="${url(ex.href)}"${on ? ' aria-current="page"' : ""}>${svg(I.exam)}<span class="nav-lesson-t">${tr.tag} exam</span></a></li></ul></div>`;
      }
      html += `</div>`;
    });

    const refs = C.readyResources();
    if (refs.length) {
      html += `<div class="sb-label">Library</div><nav class="sb-nav">`;
      refs.forEach((r) => {
        const on = samePath(r.href);
        html += `<a class="sb-link${on ? " is-active" : ""}" href="${url(r.href)}"${on ? ' aria-current="page"' : ""}>${svg(refIcons[r.id] || I.book)}<span>${r.t.replace(" Cheat-Sheet", " cheat-sheet")}</span></a>`;
      });
      html += `</nav>`;
    }
    html += `</div>`;

    html += `
      <div class="sb-card">
        <div class="sb-card-top"><span class="sb-card-k">Your progress</span></div>
        <div class="sb-card-pct"><span data-prog-text>0%</span><small data-sb-count></small></div>
        <div class="progress-track"><div class="progress-fill" data-prog-fill></div></div>
      </div>`;

    aside.innerHTML = html;
    aside.querySelectorAll(".nav-unit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const unit = btn.closest(".nav-unit");
        unit.setAttribute("aria-expanded", unit.getAttribute("aria-expanded") === "true" ? "false" : "true");
      });
    });
    return aside;
  }

  // Unit counts, completion ticks and the progress card all follow Progress.
  function refreshSidebar() {
    const side = document.getElementById("course-nav");
    if (!side) return;
    C.tracks.forEach((tr) => tr.units.forEach((u) => {
      const el = side.querySelector(`[data-unit="${u.id}"]`);
      if (!el) return;
      const ready = u.lessons.filter((l) => l.ready);
      const n = ready.filter((l) => Progress.isDone(l.id)).length;
      el.querySelector("[data-unit-meta]").textContent = `${n}/${u.lessons.length}`;
      el.classList.toggle("is-complete", ready.length > 0 && n === ready.length);
    }));

    side.querySelector("[data-sb-count]").textContent = `${Progress.doneCount()} of ${Progress.total()}`;
  }

  /* ---------------------------------------------------- TOP BAR --------- */
  function buildTopbar() {
    const bar = document.createElement("header");
    bar.className = "topbar";
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    bar.innerHTML = `
      <button class="menu-toggle" type="button" aria-label="Open course menu" aria-controls="course-nav" aria-expanded="false">${svg(I.menu)}</button>
      <div class="tb-search" role="search">
        <label class="tb-search-field">
          ${svg(I.search)}
          <span class="visually-hidden">Search lessons</span>
          <input type="search" placeholder="Search lessons, units, reference…" autocomplete="off" spellcheck="false"
                 role="combobox" aria-expanded="false" aria-controls="tb-results" aria-autocomplete="list">
          <kbd class="tb-kbd">${isMac ? "⌘" : "Ctrl"} K</kbd>
        </label>
        <div class="tb-results" id="tb-results" role="listbox" aria-label="Search results"></div>
      </div>
      <span class="tb-spacer"></span>
      ${themeButton()}
      <a class="tb-icon tb-icon--home" href="${url('/')}" aria-label="Back to the home page" title="Home">${svg(I.home)}</a>
      <a class="tb-me" href="${url('/dashboard.html')}" aria-label="Your progress — open the dashboard">
        <span class="tb-ring">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <defs><linearGradient id="tbRingGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34c8e8"/><stop offset="1" stop-color="#06768f"/></linearGradient></defs>
            <circle class="ring-bg" cx="24" cy="24" r="21" fill="none" stroke-width="4"/>
            <circle class="ring-fg" cx="24" cy="24" r="21" fill="none" stroke-width="4" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" data-ring/>
          </svg>
          <img src="${url('/assets/img/logo-2551.png')}" alt="" width="30" height="30">
        </span>
        <span class="tb-me-t"><b data-rank></b><span data-me-count></span></span>
      </a>`;

    const toggle = bar.querySelector(".menu-toggle");
    toggle.addEventListener("click", () => {
      if (wideMQ.matches) setCollapsed(!sidebarCollapsed());
      else setDrawer(!document.body.classList.contains("nav-open"));
    });
    initSearch(bar.querySelector(".tb-search"));
    return bar;
  }

  function refreshTopbar() {
    const ring = document.querySelector("[data-ring]");
    if (ring) ring.setAttribute("stroke-dashoffset", String(100 - Progress.pct()));
    const rank = document.querySelector("[data-rank]");
    if (rank) rank.textContent = rankTitle();
    const cnt = document.querySelector("[data-me-count]");
    if (cnt) cnt.textContent = `${Progress.doneCount()} of ${Progress.total()} lessons`;
  }

  function setDrawer(open) {
    document.body.classList.toggle("nav-open", open);
    syncMenuToggle();
  }

  /* ---------------------------------------------------- SEARCH ---------- */
  // Everything a student might look for, from the manifest. Locked lessons
  // are findable on purpose: "is PathPlanner covered?" deserves an answer.
  function searchIndex() {
    const items = C.allLessons().map((l) => ({
      t: plain(l.t), s: `Unit ${l.unitNum} · ${plain(l.unitTitle)}`, href: l.ready ? l.href : null,
      badge: l.unitNum, kind: "lesson", id: l.id,
    }));
    C.readyResources().forEach((r) => items.push({ t: plain(r.t), s: plain(r.sub), href: r.href, kind: "ref" }));
    (C.exams || []).filter((e) => e.ready).forEach((e) => items.push({ t: plain(e.t), s: plain(e.sub), href: e.href, kind: "exam" }));
    return items;
  }

  function initSearch(box) {
    const input = box.querySelector("input");
    const list = box.querySelector(".tb-results");
    let index = null, hits = [], sel = 0;

    const open = (v) => {
      box.classList.toggle("is-open", v);
      input.setAttribute("aria-expanded", v);
    };
    const mark = (text, terms) => {
      let out = esc(text);
      terms.forEach((t) => {
        const re = new RegExp(`(${esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
        out = out.replace(re, "<mark>$1</mark>");
      });
      return out;
    };
    const render = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { open(false); list.innerHTML = ""; return; }
      index = index || searchIndex();
      const terms = q.split(/\s+/).filter(Boolean);
      hits = index
        .map((it) => {
          const hay = (it.t + " " + it.s).toLowerCase();
          if (!terms.every((t) => hay.includes(t))) return null;
          const title = it.t.toLowerCase();
          // title hits outrank unit-name hits; prefix hits outrank both
          const score = (title.startsWith(terms[0]) ? 0 : title.includes(terms[0]) ? 1 : 2) + (it.href ? 0 : 3);
          return { ...it, score };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score)
        .slice(0, 8);
      sel = 0;
      if (!hits.length) {
        list.innerHTML = `<div class="tb-empty">Nothing matches “${esc(input.value.trim())}”.</div>`;
      } else {
        list.innerHTML = hits.map((h, i) => {
          const ic = h.kind === "lesson" ? `<span class="tb-result-ic">${esc(h.badge)}</span>`
            : `<span class="tb-result-ic ref">${svg(h.kind === "exam" ? I.exam : I.book)}</span>`;
          const tag = h.kind !== "lesson" ? (h.kind === "exam" ? "Exam" : "Reference")
            : !h.href ? "Locked" : Progress.isDone(h.id) ? "Done" : "";
          const tagCls = tag === "Done" ? " done" : "";
          return `<a class="tb-result${i === sel ? " is-sel" : ""}" role="option" id="tbr-${i}"${h.href ? ` href="${url(h.href)}"` : ' aria-disabled="true"'}>
            ${ic}<span><span class="tb-result-t">${mark(h.t, terms)}</span><span class="tb-result-s">${esc(h.s)}</span></span>
            ${tag ? `<span class="tb-result-tag${tagCls}">${tag}</span>` : ""}</a>`;
        }).join("");
      }
      open(true);
    };
    const move = (d) => {
      if (!hits.length) return;
      sel = (sel + d + hits.length) % hits.length;
      list.querySelectorAll(".tb-result").forEach((el, i) => el.classList.toggle("is-sel", i === sel));
      list.querySelector(".is-sel")?.scrollIntoView({ block: "nearest" });
      input.setAttribute("aria-activedescendant", "tbr-" + sel);
    };

    input.addEventListener("input", render);
    input.addEventListener("focus", () => { if (input.value.trim()) render(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") {
        const h = hits[sel];
        if (h && h.href) { e.preventDefault(); location.href = url(h.href); }
      } else if (e.key === "Escape") { input.value = ""; open(false); input.blur(); }
    });
    document.addEventListener("click", (e) => { if (!box.contains(e.target)) open(false); });

    // ⌘K / Ctrl+K anywhere; "/" only when the student isn't typing — lessons
    // are full of inputs and contenteditable blanks.
    document.addEventListener("keydown", (e) => {
      const typing = e.target.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); input.focus(); input.select();
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); input.focus();
      } else if (e.key === "Escape" && document.body.classList.contains("nav-open")) {
        setDrawer(false);
      }
    });
  }

  /* ---------------------------------------------------- PORTAL FOOT ----- */
  function buildPortalFoot() {
    const f = document.createElement("footer");
    f.className = "portal-foot";
    f.innerHTML = `
      <span>© <span class="u-mono">2551</span> Penguin Empire Robotics · Built for new programmers</span>
      <span><a href="https://docs.wpilib.org/" target="_blank" rel="noopener">WPILib docs ↗</a> · <a href="${url('/')}">About the academy</a></span>`;
    return f;
  }

  /* ---------------------------------------------------- HOME FOOTER ----- */
  function buildFooter() {
    const f = document.createElement("footer");
    f.className = "site-footer";
    f.innerHTML = `
      <div class="container">
        <div class="footer-brand">
          <img src="${url('/assets/img/logo-2551.png')}" alt="Penguin Empire Robotics 2551 logo">
          <div>
            <h3>Penguin Empire Robotics</h3>
            <p>FRC Team 2551 · The programming onboarding academy. Learn Java, then learn to make a robot move.</p>
          </div>
        </div>
        <div class="footer-col">
          <h4>Learn</h4>
          <a href="${url('/dashboard.html')}">Your dashboard</a>
          <a href="${url('/syllabus.html')}">Full curriculum</a>
          <a href="${url('/lessons/java/what-is-programming.html')}">Phase 1 · Java &amp; OOP</a>
          <a href="${url('/lessons/frc/moving-a-motor.html')}">Phase 2 · FRC Robot</a>
        </div>
        <div class="footer-col">
          <h4>Reference</h4>
          <a href="https://docs.wpilib.org/" target="_blank" rel="noopener">WPILib Docs ↗</a>
          <a href="https://docs.revrobotics.com/" target="_blank" rel="noopener">REV Robotics ↗</a>
          <a href="https://docs.limelightvision.io/" target="_blank" rel="noopener">Limelight ↗</a>
          <a href="https://pathplanner.dev/" target="_blank" rel="noopener">PathPlanner ↗</a>
        </div>
      </div>
      <div class="container footer-bottom">
        <span>© <span class="u-mono">2551</span> Penguin Empire Robotics · Built for new programmers.</span>
        <span class="u-mono">Java · WPILib · Command-Based</span>
      </div>`;
    return f;
  }

  /* ---------------------------------------------------- READING BAR ----- */
  function initReadingProgress() {
    const bar = document.querySelector(".topbar");
    const main = document.getElementById("main");
    if (!bar || !main) return;
    const onScroll = () => {
      const top = main.offsetTop;
      const total = main.offsetHeight - window.innerHeight;
      const pct = Math.min(100, Math.max(0, ((window.scrollY - top) / Math.max(1, total)) * 100));
      bar.style.setProperty("--read-progress", pct.toFixed(2));
    };
    document.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------------------------------------------------- TOC RAIL -------- */
  // On wide screens the lesson's "On this page" list moves into a sticky rail
  // that tracks the section you're reading. The inline copy stays in the
  // markup and takes over again below the breakpoint.
  function initTocRail(main) {
    const toc = main.querySelector(".toc");
    if (!toc) return;
    const links = Array.from(toc.querySelectorAll('a[href^="#"]'));
    if (links.length < 3) return;

    const rail = document.createElement("aside");
    rail.className = "toc-rail";
    rail.setAttribute("aria-label", "On this page");
    const ol = toc.querySelector("ol").cloneNode(true);
    rail.innerHTML = `<div class="toc-rail-k">On this page</div>`;
    rail.appendChild(ol);
    main.appendChild(rail);
    main.classList.add("has-rail");

    const railLinks = Array.from(rail.querySelectorAll('a[href^="#"]'));
    const targets = railLinks.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
    if (!targets.length) return;

    // The active section is the last heading that has scrolled past the top
    // third. Measured on scroll (once per frame) rather than with an
    // IntersectionObserver, which misses jumps that land mid-section.
    let current = null, queued = false;
    const update = () => {
      queued = false;
      let id = targets[0].id;
      for (const t of targets) { if (t.getBoundingClientRect().top < window.innerHeight * 0.35) id = t.id; }
      if (id === current) return;
      current = id;
      railLinks.forEach((a) => a.classList.toggle("is-active", decodeURIComponent(a.hash.slice(1)) === id));
    };
    document.addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ---------------------------------------------------- CONTINUE STATE -- */
  // A returning student should not be greeted like a stranger. Progress has
  // been tracked in localStorage all along; this is the first thing that reads
  // it on the homepage. Silent for first-time visitors — the hero keeps its
  // original "Start Lesson 1" CTA untouched.
  function initContinue() {
    if ((document.body.dataset.page || "home") !== "home") return;
    const cta = document.querySelector(".hero-cta .btn--primary");
    if (!cta) return;
    const doneCount = Progress.doneCount();
    if (!doneCount) return;

    const next = nextLesson();
    if (next) {
      cta.href = url(next.href);
      cta.textContent = `Continue → ${next.t}`;
    } else {
      cta.href = url("/syllabus.html");
      cta.textContent = "You're all caught up →";
    }

    const strip = document.createElement("div");
    strip.className = "hero-resume";
    strip.innerHTML = `
      <div class="hr-line">
        <span class="hr-label">${next ? `Unit ${next.unitNum} · ${next.unitTitle}` : "Lessons Completed"}</span>
        <span class="hr-count"><b>${doneCount}</b> of ${Progress.total()} lessons · <a href="${url('/dashboard.html')}">Dashboard →</a></span>
      </div>
      <div class="progress-track"><div class="progress-fill" data-prog-fill></div></div>`;
    cta.closest(".hero-cta").after(strip);
    refreshProgressUI();
  }

  /* ---------------------------------------------------- REDUCED MOTION -- */
  /* The global CSS rule in brand.css zeroes transition/animation durations,
     but it cannot stop a rAF loop or an IntersectionObserver callback — so
     every JS-driven animation checks this first. Read live, not cached, so a
     mid-session OS preference change is respected. */
  const reduceMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.PEreduceMotion = reduceMotion;

  /* ---------------------------------------------------- STATS TICKER ---- */
  // The band under the hero ships as one static row. Only once we know the
  // set is wider than the viewport (i.e. there is actually something to
  // reveal by scrolling it) do we clone it and switch to ticker mode — a
  // marquee that fits on screen with room to spare just jitters for nothing.
  // The clone is aria-hidden so each stat is announced exactly once.
  function initStatTicker() {
    const band = document.querySelector(".statband");
    if (!band) return;
    const track = band.querySelector(".statband-track");
    const set = band.querySelector(".statband-set");
    if (!track || !set) return;

    let clone = null;
    const off = () => {
      band.classList.remove("is-marquee");
      if (clone) { clone.remove(); clone = null; }
    };

    const sync = () => {
      if (reduceMotion()) { off(); return; }
      // Measure in ticker mode: the static row wraps, so its scrollWidth is
      // always the container width and would never look like an overflow.
      // Nothing paints between this class flip and the decision below.
      band.classList.add("is-marquee");
      if (set.scrollWidth <= band.clientWidth) { off(); return; }
      if (!clone) {
        clone = set.cloneNode(true);
        clone.setAttribute("aria-hidden", "true");
        track.appendChild(clone);
      }
      // Constant travel speed (~52px/s) whatever the width, so the ticker
      // reads the same on a phone as on a wide desktop.
      band.style.setProperty("--marq-dur", Math.round(set.scrollWidth / 52) + "s");
    };

    sync();
    let t;
    window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(sync, 150); }, { passive: true });
  }

  /* ---------------------------------------------------- SCROLL REVEAL --- */
  function countUp(el) {
    const target = Number(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    if (!Number.isFinite(target)) return;
    const DUR = 900;
    const t0 = performance.now();
    el.textContent = "0" + suffix;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / DUR);
      const eased = 1 - Math.pow(1 - p, 3);        // ease-out cubic, matches --ease-out's feel
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function initReveal() {
    const items = Array.from(document.querySelectorAll(".reveal-on-scroll"));
    const stats = Array.from(document.querySelectorAll("[data-count]"));
    if (!items.length && !stats.length) return;

    // Reduced motion, or no observer support: settle everything immediately.
    // Stats keep their server-rendered values — nothing counts, nothing moves.
    if (reduceMotion() || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("in-view"));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        io.unobserve(el);                          // one-shot; never re-hides on scroll up
        if (el.dataset.count !== undefined) { countUp(el); return; }
        // Stagger only inside an explicit [data-stagger] row, where siblings
        // cross the threshold together. Vertical lists reveal one-by-one on
        // their own and would just feel laggy with an added delay.
        const parent = el.parentElement;
        if (parent && parent.dataset.stagger !== undefined) {
          const group = Array.from(parent.children).filter((c) =>
            c.classList.contains("reveal-on-scroll"));
          el.style.transitionDelay = group.indexOf(el) * 60 + "ms";
        }
        el.classList.add("in-view");
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0 });

    items.forEach((el) => io.observe(el));
    stats.forEach((el) => io.observe(el));
  }

  /* ---------------------------------------------------- PREV / NEXT ----- */
  function buildPrevNext(currentId) {
    const all = C.allLessons().filter((l) => l.ready);
    const i = all.findIndex((l) => l.id === currentId);
    if (i < 0) return null;
    const prev = all[i - 1], next = all[i + 1];
    const wrap = document.createElement("nav");
    wrap.className = "lesson-nav";
    wrap.setAttribute("aria-label", "Lesson navigation");
    const card = (l, dir) => {
      if (!l) return `<span class="disabled"></span>`;
      const cls = dir === "next" ? "next" : "prev";
      const dis = l.ready ? "" : " disabled";
      const href = l.ready ? ` href="${url(l.href)}"` : "";
      const label = dir === "next" ? "Next →" : "← Previous";
      const title = l.ready ? l.t : l.t + " · locked";
      return `<a class="${cls}${dis}"${href}><span class="ln-dir">${label}</span><span class="ln-title">${title}</span></a>`;
    };
    wrap.innerHTML = card(prev, "prev") + card(next, "next");
    return wrap;
  }

  /* ---------------------------------------------------- ASSEMBLE -------- */
  function refreshProgressUI() {
    document.querySelectorAll("[data-prog-fill]").forEach((e) => (e.style.width = Progress.pct() + "%"));
    document.querySelectorAll("[data-prog-text]").forEach((e) => (e.textContent = Progress.pct() + "%"));
    document.querySelectorAll("[data-lesson-link]").forEach((a) => {
      a.classList.toggle("is-done", Progress.isDone(a.dataset.lessonLink));
    });
    document.querySelectorAll("[data-syl-link]").forEach((a) => {
      a.classList.toggle("is-done", Progress.isDone(a.dataset.sylLink));
    });
    refreshSidebar();
    refreshTopbar();
  }

  function init() {
    const page = document.body.dataset.page || "home";
    const lessonId = document.body.dataset.lesson || null;
    const main = document.getElementById("main");

    // skip link
    const skip = document.createElement("a");
    skip.className = "skip-link"; skip.href = "#main"; skip.textContent = "Skip to content";
    document.body.prepend(skip);

    if (page === "home") {
      document.body.classList.add("layout-page");
      skip.after(buildHeader(page));
      document.body.appendChild(buildFooter());
    } else {
      document.body.classList.add("layout-portal");
      // Set before the shell exists so a saved collapse doesn't animate in.
      let sb = null;
      try { sb = localStorage.getItem(SIDEBAR_KEY); } catch {}
      document.documentElement.dataset.sidebar = sb === "collapsed" ? "collapsed" : "open";
      const shell = document.createElement("div");
      shell.className = "portal";
      const col = document.createElement("div");
      col.className = "portal-main";
      main.parentNode.insertBefore(shell, main);
      shell.appendChild(buildSidebar(lessonId, page));
      shell.appendChild(col);
      col.appendChild(buildTopbar());
      syncMenuToggle();
      col.appendChild(main);
      col.appendChild(buildPortalFoot());
      main.classList.add("panel");
      if (page === "dashboard") main.classList.add("panel--bare");

      const scrim = document.createElement("div");
      scrim.className = "scrim";
      scrim.addEventListener("click", () => setDrawer(false));
      document.body.appendChild(scrim);

      if (page === "lesson") {
        const inner = main.querySelector(".content-inner") || main;
        const pn = buildPrevNext(lessonId);
        if (pn) inner.appendChild(pn);
        initTocRail(main);
      }
      initReadingProgress();

      // Bring the open unit into view inside the sidebar's own scroller —
      // never scroll the page itself on load.
      const sc = document.querySelector(".sb-scroll");
      const cur = sc?.querySelector(".nav-lessons a.is-current") || sc?.querySelector(".nav-unit.has-current");
      if (sc && cur) {
        const off = cur.getBoundingClientRect().top - sc.getBoundingClientRect().top;
        if (off > sc.clientHeight * 0.6) sc.scrollTop = off - sc.clientHeight * 0.35;
      }
    }

    Progress.onChange(refreshProgressUI);
    refreshProgressUI();
    Theme.apply(document.documentElement.dataset.theme || "light");
    initContinue();
    initStatTicker();
    initReveal();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.PEsvg = svg; window.PEicons = I; window.PEurl = url; window.PEesc = esc;
})();
