/* ============================================================================
   widgets.js · interactive lesson widgets
   - syntax highlight + copy buttons
   - live Java sandbox (OneCompiler embed, runs real Java)
   - fill-in-the-blank, predict-output / short answer, multiple choice
   - checkpoint quiz (scored), drag-to-order, reveal, mark-complete
   ============================================================================ */
(function () {
  "use strict";
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));
  const svg = window.PEsvg || (() => "");
  const I = window.PEicons || {};
  const reduceMotion = window.PEreduceMotion || (() => false);

  const FB_GOOD = (msg) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>${msg}</span>`;
  const FB_BAD = (msg) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg><span>${msg}</span>`;

  function setFeedback(el, ok, msg) {
    if (!el) return;
    el.className = "feedback show " + (ok ? "good" : "bad");
    el.innerHTML = ok ? FB_GOOD(msg) : FB_BAD(msg);
  }
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

  /* ===================================================== highlight ===== */
  function highlight() {
    if (!window.hljs) return;
    $$(".code pre code").forEach((code) => {
      if (code.dataset.hl) return;
      window.hljs.highlightElement(code);
      code.dataset.hl = "1";
      const block = code.closest(".code");
      if (block && block.classList.contains("with-lines")) addLines(code);
    });
  }
  // Simple, robust line wrapping — relies on samples using // comments (no
  // multi-line tokens), which is the convention used throughout the course.
  function addLines(code) {
    const lines = code.innerHTML.replace(/\n$/, "").split("\n");
    code.innerHTML = lines.map((l) => `<span class="line">${l.length ? l : " "}</span>`).join("\n");
  }

  /* ===================================================== copy =========== */
  function copyButtons() {
    $$(".code").forEach((block) => {
      const head = block.querySelector(".code-head");
      if (!head || head.querySelector(".copy-btn")) return;
      const btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.type = "button";
      btn.innerHTML = `${svg(I.copy || "M9 9h10v10H9zM5 15H4V4a1 1 0 0 1 1-1h10v1")}<span>Copy</span>`;
      btn.addEventListener("click", async () => {
        const text = block.querySelector("pre")?.innerText || "";
        try { await navigator.clipboard.writeText(text); } catch {}
        btn.classList.add("copied");
        btn.querySelector("span").textContent = "Copied!";
        setTimeout(() => { btn.classList.remove("copied"); btn.querySelector("span").textContent = "Copy"; }, 1600);
      });
      head.appendChild(btn);
    });
  }

  /* ===================================================== PenguinSim ==== */
  // WPILib doesn't exist inside OneCompiler, so FRC lessons mark their sandbox
  // <div class="sandbox" data-compiler data-sim> and we prepend a plain-Java
  // teaching shim (fake SparkMax / PIDController / CommandScheduler / ...) so
  // robot-shaped code actually runs. Fetched once, shared by every sandbox.
  const SIM_URL = (window.SITE_BASE || "") + "/assets/js/sim/penguinsim.java.txt";
  let simPromise = null;
  function loadSim() {
    if (!simPromise) {
      simPromise = fetch(SIM_URL)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status))))
        .catch((e) => { console.warn("PenguinSim failed to load:", e.message); return null; });
    }
    return simPromise;
  }

  /* ===================================================== live sandbox == */
  // <div class="sandbox" data-compiler><script type="text/x-java" class="sb-src">CODE</script></div>
  function sandboxes() {
    $$(".sandbox[data-compiler]").forEach((box) => {
      if (box.dataset.ready) return;
      box.dataset.ready = "1";
      const srcEl = box.querySelector(".sb-src");
      const code = srcEl ? srcEl.textContent.replace(/^\n/, "").replace(/\s+$/, "") : "";
      const title = box.dataset.title || "Live Java Sandbox";
      const lang = box.dataset.lang || "java";
      const isSim = box.hasAttribute("data-sim");

      // What actually gets sent to the compiler. For a sim sandbox the shim is
      // prepended once it arrives; until then this is just the lesson's code.
      let payload = code;

      box.innerHTML = `
        <div class="sandbox-head">
          <span class="live-dot" aria-hidden="true"></span>
          <span class="sandbox-title">${title} · <b>real Java, runs here</b></span>
          <span class="code-spacer"></span>
          <button class="copy-btn sb-copy" type="button">${svg("M9 9h10v10H9zM5 15H4V4a1 1 0 0 1 1-1h10v1")}<span>Copy</span></button>
        </div>
        ${isSim ? `<div class="sim-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16v-4M12 8h.01"/><circle cx="12" cy="12" r="9"/></svg>
          <span><b>Simulated for teaching.</b> <code>SparkMax</code>, <code>PIDController</code> and friends here are
          plain-Java stand-ins so this runs in a browser. On a real robot they come from <b>WPILib</b>,
          with the same names and method shapes.</span>
        </div>` : ""}
        <iframe class="sandbox-frame" title="${title}" loading="lazy"
          src="https://onecompiler.com/embed/${lang}?theme=dark&hideTitle=true&hideStdin=true&hideNew=true&hideNewFileOption=true&hideLanguageSelection=true&listenToEvents=true"></iframe>
        <div class="sandbox-bar">
          <span class="grow"><span class="muted">Edit the code, then press</span> <b style="color:#9be7a4">Run ▶</b> <span class="muted">inside the panel.</span></span>
          <a class="sandbox-link" target="_blank" rel="noopener" href="https://onecompiler.com/${lang}">Open in new tab ↗</a>
        </div>`;

      const iframe = box.querySelector(".sandbox-frame");
      const post = () => {
        try {
          iframe.contentWindow.postMessage(
            { eventType: "populateCode", language: lang, files: [{ name: "Main.java", content: payload }] },
            "https://onecompiler.com"
          );
        } catch (e) {}
      };
      iframe.addEventListener("load", () => { post(); setTimeout(post, 600); });
      window.addEventListener("message", (e) => {
        if (typeof e.origin === "string" && e.origin.includes("onecompiler")) post();
      });

      if (isSim) {
        loadSim().then((shim) => {
          if (shim) {
            // Shim first: its classes are package-private top-level classes that
            // sit alongside the lesson's `public class Main` in one file.
            payload = shim + "\n\n" + code;
            post();
          } else {
            const bar = box.querySelector(".sandbox-bar .grow");
            if (bar) bar.innerHTML = `<b style="color:#ff8d85">The simulator didn't load</b>
              <span class="muted">and this code needs it. Reload the page, or use “Open in new tab”.</span>`;
          }
        });
      }

      box.querySelector(".sb-copy").addEventListener("click", async (ev) => {
        const b = ev.currentTarget;
        try { await navigator.clipboard.writeText(payload); } catch {}
        b.classList.add("copied"); b.querySelector("span").textContent = "Copied!";
        setTimeout(() => { b.classList.remove("copied"); b.querySelector("span").textContent = "Copy"; }, 1600);
      });
    });
  }

  /* ===================================================== fill-in-blank = */
  // <div class="challenge" data-kind="fib"> ... <code class="fib"> ...
  //   <span class="blank" data-answer="kBrushless"></span> ... </code>
  //   <div class="challenge-actions"><button class="btn btn--sm check-btn">Check</button>
  //   <div class="feedback"></div></div></div>
  function fillBlanks() {
    $$('.challenge[data-kind="fib"]').forEach((ch) => {
      if (ch.dataset.ready) return; ch.dataset.ready = "1";
      const blanks = $$(".blank", ch);
      blanks.forEach((b) => {
        b.setAttribute("contenteditable", "true");
        b.setAttribute("spellcheck", "false");
        b.setAttribute("role", "textbox");
        if (!b.style.minWidth) b.style.minWidth = Math.max(5, (b.dataset.answer || "").length + 1) + "ch";
        b.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ch.querySelector(".check-btn")?.click(); } });
        b.addEventListener("input", () => b.classList.remove("correct", "wrong"));
      });
      const accept = (raw, ans) => {
        const norms = (s) => s.replace(/\s+/g, "").replace(/;$/, "");
        return (ans || "").split("|").some((a) => norms(raw) === norms(a));
      };
      ch.querySelector(".check-btn")?.addEventListener("click", () => {
        let allRight = true;
        blanks.forEach((b) => {
          const ok = accept(b.textContent, b.dataset.answer);
          b.classList.toggle("correct", ok);
          b.classList.toggle("wrong", !ok);
          if (!ok) allRight = false;
        });
        setFeedback(ch.querySelector(".feedback"), allRight,
          allRight ? (ch.dataset.win || "Perfect. That compiles!") : (ch.dataset.lose || "Not quite. Check the highlighted blanks and the hint."));
      });
      ch.querySelector(".reset-btn")?.addEventListener("click", () => {
        blanks.forEach((b) => { b.textContent = ""; b.classList.remove("correct", "wrong"); });
        const f = ch.querySelector(".feedback"); if (f) f.className = "feedback";
      });
    });
  }

  /* ===================================================== short answer == */
  // <div class="challenge" data-kind="text"> ... <input class="answer-input" data-answer="0.7|.7">
  function shortAnswers() {
    $$('.challenge[data-kind="text"]').forEach((ch) => {
      if (ch.dataset.ready) return; ch.dataset.ready = "1";
      const input = ch.querySelector(".answer-input");
      const check = () => {
        const ans = (input.dataset.answer || "").split("|").map(norm);
        const ci = input.dataset.ci !== "false";
        const val = ci ? norm(input.value).toLowerCase() : norm(input.value);
        const ok = ans.some((a) => (ci ? a.toLowerCase() : a) === val) && val.length > 0;
        input.classList.toggle("correct", ok); input.classList.toggle("wrong", !ok);
        setFeedback(ch.querySelector(".feedback"), ok,
          ok ? (ch.dataset.win || "Correct!") : (ch.dataset.lose || "Try again, and re-read the code carefully."));
      };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); input.classList.remove("correct", "wrong"); });
      ch.querySelector(".check-btn")?.addEventListener("click", check);
    });
  }

  /* ===================================================== single MCQ ==== */
  // <div class="challenge" data-kind="mcq"> ... <div class="options">
  //   <label class="option" data-correct><input type="radio" name="x"> ...</label> ...
  function mcqs() {
    $$('.challenge[data-kind="mcq"]').forEach((ch) => {
      if (ch.dataset.ready) return; ch.dataset.ready = "1";
      const opts = $$(".option", ch);
      opts.forEach((o) => o.addEventListener("change", () => opts.forEach((x) => x.classList.remove("correct", "wrong", "dim"))));
      ch.querySelector(".check-btn")?.addEventListener("click", () => {
        const chosen = opts.find((o) => o.querySelector("input")?.checked);
        if (!chosen) { setFeedback(ch.querySelector(".feedback"), false, "Pick an answer first."); return; }
        const ok = chosen.hasAttribute("data-correct");
        opts.forEach((o) => {
          if (o.hasAttribute("data-correct")) o.classList.add("correct");
          else if (o === chosen) o.classList.add("wrong");
          else o.classList.add("dim");
        });
        const expl = chosen.dataset.explain || ch.dataset[ok ? "win" : "lose"] || (ok ? "Correct!" : "Not quite. The right answer is highlighted.");
        setFeedback(ch.querySelector(".feedback"), ok, expl);
      });
    });
  }

  /* ===================================================== checkpoint ==== */
  // <div class="checkpoint"> ... .cp-q each with .options[data-correct]; one .cp-score; one .check-btn
  function checkpoints() {
    $$(".checkpoint").forEach((cp) => {
      if (cp.dataset.ready) return; cp.dataset.ready = "1";
      const qs = $$(".cp-q", cp);
      $$(".option", cp).forEach((o) =>
        o.addEventListener("change", () => {
          const grp = o.closest(".options");
          $$(".option", grp).forEach((x) => x.classList.remove("correct", "wrong", "dim"));
          const f = o.closest(".cp-q").querySelector(".feedback"); if (f) f.className = "feedback";
        })
      );
      cp.querySelector(".check-btn")?.addEventListener("click", () => {
        let score = 0;
        qs.forEach((q) => {
          const opts = $$(".option", q);
          const chosen = opts.find((o) => o.querySelector("input")?.checked);
          const ok = chosen && chosen.hasAttribute("data-correct");
          if (ok) score++;
          opts.forEach((o) => {
            o.classList.remove("correct", "wrong", "dim");
            if (o.hasAttribute("data-correct")) o.classList.add("correct");
            else if (o === chosen) o.classList.add("wrong");
            else o.classList.add("dim");
          });
          const fb = q.querySelector(".feedback");
          if (fb) setFeedback(fb, ok, ok ? (chosen.dataset.explain || "Correct!") : (chosen?.dataset.explain || q.dataset.lose || "See the highlighted answer."));
        });
        const scoreEl = cp.querySelector(".cp-score");
        if (scoreEl) scoreEl.textContent = `${score} / ${qs.length}`;
      });
    });
  }

  /* ===================================================== drag order ==== */
  // First-Last-Invert-Play. CSS transitions (not a spring library) keep this
  // off the main thread and interruptible — a second drop retargets mid-slide.
  function flip(items, mutate) {
    if (reduceMotion()) { mutate(); return; }
    const first = new Map(items.map((el) => [el, el.getBoundingClientRect().top]));
    mutate();
    items.forEach((el) => {
      const delta = first.get(el) - el.getBoundingClientRect().top;
      if (!delta) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "";        // falls back to the base .order-item transition
        el.style.transform = "";
      });
    });
  }

  function orderers() {
    $$(".order-list").forEach((list) => {
      if (list.dataset.ready) return; list.dataset.ready = "1";
      let dragged = null;
      $$(".order-item", list).forEach((item) => {
        item.draggable = true;
        item.addEventListener("dragstart", () => { dragged = item; item.classList.add("dragging"); });
        item.addEventListener("dragend", () => { dragged = null; item.classList.remove("dragging"); $$(".order-item", list).forEach((i) => i.classList.remove("over")); });
        item.addEventListener("dragover", (e) => { e.preventDefault(); item.classList.add("over"); });
        item.addEventListener("dragleave", () => item.classList.remove("over"));
        item.addEventListener("drop", (e) => {
          e.preventDefault(); item.classList.remove("over");
          if (!dragged || dragged === item) return;
          const items = $$(".order-item", list);
          const di = items.indexOf(dragged), ti = items.indexOf(item);
          // FLIP: measure before the DOM move, invert to the old position, then
          // release — so rows slide to their new slot instead of teleporting.
          flip(items, () => { if (di < ti) item.after(dragged); else item.before(dragged); });
        });
      });
      const ch = list.closest(".challenge");
      ch?.querySelector(".check-btn")?.addEventListener("click", () => {
        const items = $$(".order-item", list);
        let ok = true;
        items.forEach((it, idx) => {
          const right = Number(it.dataset.pos) === idx + 1;
          it.classList.toggle("correct", right); it.classList.toggle("wrong", !right);
          if (!right) ok = false;
        });
        setFeedback(ch.querySelector(".feedback"), ok, ok ? "Right order!" : "Not yet. Drag them so the lifecycle runs top to bottom.");
      });
    });
  }

  /* ===================================================== file tree ===== */
  // <div class="ftree"><button class="ft-row" data-depth="1" data-edit="often"
  //   data-name="RobotContainer.java" data-info="…"></button>…</div>
  // Click a file, read what it is for and whether you should be editing it.
  function fileTrees() {
    $$(".ftree").forEach((tree) => {
      if (tree.dataset.ready) return; tree.dataset.ready = "1";
      const rows = $$(".ft-row", tree);
      const panel = document.createElement("div");
      panel.className = "ft-panel";
      panel.setAttribute("role", "status");
      panel.innerHTML = `<span class="ft-hint">${tree.dataset.hint || "Click any file to see what belongs in it."}</span>`;
      tree.appendChild(panel);

      const EDIT = { often: "You edit this constantly", rarely: "You rarely edit this", never: "Never edit this",
                     folder: "A folder you will fill", copy: "Copy this to make your own" };
      rows.forEach((row) => {
        row.type = "button";
        row.style.setProperty("--ft-depth", row.dataset.depth || 0);
        row.innerHTML = `<span class="ft-name">${row.dataset.name || ""}</span>` +
          (row.dataset.edit ? `<span class="ft-badge ft-${row.dataset.edit}">${EDIT[row.dataset.edit] || ""}</span>` : "");
        row.addEventListener("click", () => {
          rows.forEach((r) => r.classList.remove("sel"));
          row.classList.add("sel");
          panel.className = "ft-panel show";
          panel.innerHTML = `<b>${row.dataset.name || ""}</b><span>${row.dataset.info || ""}</span>`;
        });
      });
    });
  }

  /* ===================================================== CAN ID map ==== */
  // <div class="canid" data-reserved="0,1"><div class="ci-row" data-device="Intake roller"
  //   data-hint="SparkMax + Neo"></div>…<button class="check-btn">…<div class="feedback">
  // Validates the rules rather than one answer key: every device numbered, no
  // duplicates, nothing on a reserved ID, everything inside 0-63.
  function canIdMaps() {
    $$(".canid").forEach((box) => {
      if (box.dataset.ready) return; box.dataset.ready = "1";
      const reserved = (box.dataset.reserved || "0,1").split(",").map((n) => Number(n.trim()));
      const rows = $$(".ci-row", box);
      const fb = box.querySelector(".feedback");

      rows.forEach((row) => {
        row.innerHTML = `
          <span class="ci-name">${row.dataset.device || ""}</span>
          <span class="ci-hint">${row.dataset.hint || ""}</span>
          <input class="ci-input" type="number" min="0" max="63" inputmode="numeric"
                 aria-label="CAN ID for ${row.dataset.device || "this device"}" />`;
        row.querySelector(".ci-input").addEventListener("input", () =>
          rows.forEach((r) => r.classList.remove("bad", "ok"))
        );
      });

      box.querySelector(".check-btn")?.addEventListener("click", () => {
        const vals = rows.map((r) => r.querySelector(".ci-input").value.trim());
        const nums = vals.map((v) => (v === "" ? null : Number(v)));
        const problems = [];
        const seen = new Map();
        rows.forEach((r, i) => {
          r.classList.remove("bad", "ok");
          const n = nums[i];
          const who = r.dataset.device;
          if (n === null || Number.isNaN(n)) { problems.push(`${who} has no ID.`); r.classList.add("bad"); return; }
          if (n < 0 || n > 63) { problems.push(`${n} is outside the valid range of 0 to 63.`); r.classList.add("bad"); return; }
          if (reserved.includes(n)) { problems.push(`ID ${n} is reserved on this team.`); r.classList.add("bad"); return; }
          if (seen.has(n)) {
            problems.push(`${who} and ${seen.get(n)} both use ID ${n}.`);
            r.classList.add("bad");
            rows[vals.indexOf(String(n))]?.classList.add("bad");
            return;
          }
          seen.set(n, who);
          r.classList.add("ok");
        });
        if (problems.length) setFeedback(fb, false, problems.slice(0, 3).join(" "));
        else setFeedback(fb, true, box.dataset.win || "Every device has a unique, non-reserved ID. That map will work.");
      });

      box.querySelector(".reset-btn")?.addEventListener("click", () => {
        rows.forEach((r) => { r.querySelector(".ci-input").value = ""; r.classList.remove("bad", "ok"); });
        if (fb) fb.className = "feedback";
      });
    });
  }

  /* ===================================================== checklist ===== */
  // <ol class="checklist" data-key="wpilib-install"><li>step</li>…</ol>
  // Ticks persist in localStorage, so installing tools across three lessons
  // doesn't lose the student's place.
  function checklists() {
    $$(".checklist").forEach((list) => {
      if (list.dataset.ready) return; list.dataset.ready = "1";
      const key = "pe2551.checklist." + (list.dataset.key || document.body.dataset.lesson || "x");
      let done = [];
      try { done = JSON.parse(localStorage.getItem(key) || "[]"); } catch {}
      const items = $$("li", list);
      const save = () => { try { localStorage.setItem(key, JSON.stringify(done)); } catch {} };
      const bar = list.parentElement?.querySelector(".cl-count");
      const sync = () => { if (bar) bar.textContent = `${done.length} / ${items.length} done`; };

      items.forEach((li, i) => {
        li.classList.add("cl-item");
        const box = document.createElement("button");
        box.type = "button";
        box.className = "cl-box";
        box.setAttribute("aria-label", "Mark step " + (i + 1));
        li.prepend(box);
        const paint = () => {
          const on = done.includes(i);
          li.classList.toggle("checked", on);
          box.setAttribute("aria-pressed", on ? "true" : "false");
        };
        box.addEventListener("click", () => {
          if (done.includes(i)) done = done.filter((n) => n !== i);
          else done.push(i);
          save(); paint(); sync();
        });
        paint();
      });
      sync();
    });
  }

  /* ================================================ driver station ===== */
  // A mock Driver Station bar that runs triage scenarios. Declarative:
  //   <div class="dspanel">
  //     <div class="ds-case" data-comms="green" data-code="red" data-joy="green"
  //          data-enabled="false" data-mode="Teleoperated" data-console="…"
  //          data-answer="code" data-explain="…">the situation</div>
  //   </div>
  // The student reads the lights and says where the problem is. This is the
  // skill the lesson is actually for: triage before you open your code.
  const DS_CHOICES = [
    ["network", "The network"],
    ["code", "Your robot code"],
    ["joystick", "The controller"],
    ["disabled", "The robot is disabled"],
    ["nothing", "Nothing. This is healthy"],
  ];
  function driverStations() {
    $$(".dspanel").forEach((dp) => {
      if (dp.dataset.ready) return; dp.dataset.ready = "1";
      const cases = $$(".ds-case", dp).map((el) => ({ ...el.dataset, text: el.innerHTML }));
      if (!cases.length) return;
      $$(".ds-case", dp).forEach((el) => el.remove());
      let at = 0;

      const led = (state, label) =>
        `<div class="ds-led ${state === "green" ? "on" : "off"}"><i></i><span>${label}</span></div>`;

      dp.innerHTML = `
        <div class="ds-bar">
          <div class="ds-leds"></div>
          <div class="ds-ops">
            <div class="ds-mode"><span class="ds-cap">Mode</span><b class="ds-mode-v"></b></div>
            <div class="ds-state"><span class="ds-cap">Robot</span><b class="ds-state-v"></b></div>
          </div>
        </div>
        <div class="ds-console"><span class="ds-cap">Console</span><pre></pre></div>
        <div class="ds-quiz">
          <p class="ds-situation"></p>
          <div class="ds-choices">${DS_CHOICES.map(
            (c) => `<button type="button" class="ds-choice" data-v="${c[0]}">${c[1]}</button>`
          ).join("")}</div>
          <div class="feedback"></div>
          <div class="ds-nav"><span class="ds-pos"></span><button type="button" class="btn btn--sm btn--ghost ds-next">Next situation</button></div>
        </div>`;

      const fb = dp.querySelector(".feedback");
      function render() {
        const c = cases[at];
        dp.querySelector(".ds-leds").innerHTML =
          led(c.comms, "Communications") + led(c.code, "Robot Code") + led(c.joy, "Joysticks");
        dp.querySelector(".ds-mode-v").textContent = c.mode || "Teleoperated";
        const en = c.enabled === "true";
        const sv = dp.querySelector(".ds-state-v");
        sv.textContent = en ? "Enabled" : "Disabled";
        sv.className = "ds-state-v " + (en ? "en" : "dis");
        dp.querySelector(".ds-console pre").textContent = c.console || "(no messages)";
        dp.querySelector(".ds-situation").innerHTML = c.text || "";
        dp.querySelector(".ds-pos").textContent = `Situation ${at + 1} of ${cases.length}`;
        $$(".ds-choice", dp).forEach((b) => b.classList.remove("picked", "right", "wrong"));
        fb.className = "feedback";
      }

      $$(".ds-choice", dp).forEach((b) => {
        b.addEventListener("click", () => {
          const c = cases[at];
          const ok = b.dataset.v === c.answer;
          $$(".ds-choice", dp).forEach((x) => x.classList.remove("picked", "right", "wrong"));
          b.classList.add(ok ? "right" : "wrong");
          setFeedback(fb, ok, c.explain || (ok ? "Correct." : "Not that one. Read the lights again."));
        });
      });
      dp.querySelector(".ds-next").addEventListener("click", () => {
        at = (at + 1) % cases.length;
        render();
      });
      render();
    });
  }

  /* ===================================================== match pairs === */
  // <div class="challenge" data-kind="match"> ... <div class="match">
  //   <div class="match-col"><button class="match-item" data-match="rev">Neo</button>…</div>
  //   <div class="match-col"><button class="match-item" data-key="rev">REV docs</button>…</div>
  // Several left items may share one right key (two REV devices, one manual),
  // so right items never lock -- only left items do.
  function matchers() {
    $$('.challenge[data-kind="match"]').forEach((ch) => {
      if (ch.dataset.ready) return; ch.dataset.ready = "1";
      const lefts = $$(".match-item[data-match]", ch);
      const rights = $$(".match-item[data-key]", ch);
      const fb = ch.querySelector(".feedback");
      let picked = null;

      const clearPick = () => { lefts.forEach((l) => l.classList.remove("picked")); picked = null; };
      const remaining = () => lefts.filter((l) => !l.classList.contains("locked")).length;

      lefts.forEach((l) => {
        l.type = "button";
        l.addEventListener("click", () => {
          if (l.classList.contains("locked")) return;
          const was = l.classList.contains("picked");
          clearPick();
          if (!was) { l.classList.add("picked"); picked = l; }
        });
      });

      rights.forEach((r) => {
        r.type = "button";
        r.addEventListener("click", () => {
          if (!picked) { setFeedback(fb, false, "Pick something on the left first."); return; }
          const left = picked;
          if (left.dataset.match === r.dataset.key) {
            left.classList.add("locked");
            left.classList.remove("picked");
            r.classList.add("hit");
            setTimeout(() => r.classList.remove("hit"), 500);
            picked = null;
            if (!remaining()) setFeedback(fb, true, ch.dataset.win || "All matched.");
            else if (fb) fb.className = "feedback";
          } else {
            left.classList.add("miss"); r.classList.add("miss");
            setTimeout(() => { left.classList.remove("miss"); r.classList.remove("miss"); }, 450);
            clearPick();
            setFeedback(fb, false, ch.dataset.lose || "Not that one. Try again.");
          }
        });
      });

      ch.querySelector(".reset-btn")?.addEventListener("click", () => {
        lefts.forEach((l) => l.classList.remove("locked", "picked", "miss"));
        rights.forEach((r) => r.classList.remove("hit", "miss"));
        picked = null;
        if (fb) fb.className = "feedback";
      });
    });
  }

  /* ===================================================== signal path === */
  // Unit 1's hardware interactive. Declarative markup only:
  //   <div class="sigpath">
  //     <div class="sp-chain">
  //       <div class="sp-node" data-info="...">…</div>
  //       <button class="sp-wire" data-label="CAN" data-symptom="…"></button>
  //       …
  //     </div>
  //   </div>
  // Clicking a node explains it. Clicking a wire cuts it, and everything
  // downstream of the cut goes dark -- which is the whole lesson: a break is
  // diagnosed by what still answers, not by re-reading your code.
  function signalPaths() {
    $$(".sigpath").forEach((sp) => {
      if (sp.dataset.ready) return; sp.dataset.ready = "1";
      const chain = sp.querySelector(".sp-chain");
      if (!chain) return;
      const parts = Array.from(chain.children);
      const nodes = $$(".sp-node", chain);
      const wires = $$(".sp-wire", chain);

      const panel = document.createElement("div");
      panel.className = "sp-panel";
      panel.setAttribute("role", "status");
      const bar = document.createElement("div");
      bar.className = "sp-actions";
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "btn btn--sm btn--ghost sp-reset";
      reset.textContent = "Repair all";
      bar.appendChild(reset);
      sp.appendChild(panel);
      sp.appendChild(bar);

      const hint = sp.dataset.hint || "Click any part to see what it does. Click a wire to cut it.";
      const say = (title, body, bad) => {
        panel.className = "sp-panel show" + (bad ? " bad" : "");
        panel.innerHTML = `<b>${title}</b><span>${body}</span>`;
      };
      const idle = () => { panel.className = "sp-panel"; panel.innerHTML = `<span class="sp-hint">${hint}</span>`; };

      // Everything after a cut wire stops answering the RoboRIO.
      function applyDamage() {
        let dead = false;
        parts.forEach((el) => {
          if (el.classList.contains("sp-wire")) {
            if (el.classList.contains("cut")) dead = true;
            el.classList.toggle("dead", dead && !el.classList.contains("cut"));
          } else {
            el.classList.toggle("dead", dead);
          }
        });
      }

      nodes.forEach((n) => {
        n.tabIndex = 0;
        const fire = () => {
          const name = n.querySelector(".sp-name")?.textContent || "This part";
          if (n.classList.contains("dead")) {
            say(name, "This device is downstream of your cut, so the RoboRIO cannot reach it. Repair the wire to bring it back.", true);
          } else {
            say(name, n.dataset.info || "", false);
          }
        };
        n.addEventListener("click", fire);
        n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); } });
      });

      wires.forEach((w) => {
        w.type = "button";
        w.addEventListener("click", () => {
          const cut = !w.classList.contains("cut");
          wires.forEach((x) => x.classList.remove("cut"));
          if (cut) w.classList.add("cut");
          applyDamage();
          if (cut) say("Break: " + (w.dataset.label || "this link"), w.dataset.symptom || "", true);
          else idle();
        });
      });

      reset.addEventListener("click", () => {
        wires.forEach((x) => x.classList.remove("cut"));
        applyDamage();
        idle();
      });

      idle();
    });
  }

  /* ===================================================== mark complete = */
  function markComplete() {
    const id = document.body.dataset.lesson;
    if (!id || !window.Progress) return;
    $$(".complete-btn").forEach((btn) => {
      const sync = () => {
        const done = window.Progress.isDone(id);
        btn.classList.toggle("done", done);
        btn.querySelector("span").textContent = done ? "Completed" : "Mark as complete";
      };
      btn.addEventListener("click", () => {
        window.Progress.toggle(id);
        sync();
        // Pop the check only on the click that completes the lesson — never on
        // load, so returning to a finished lesson stays calm.
        if (btn.classList.contains("done") && !reduceMotion()) {
          btn.classList.remove("just-done");
          void btn.offsetWidth;                 // restart the animation on re-complete
          btn.classList.add("just-done");
        }
      });
      btn.addEventListener("animationend", () => btn.classList.remove("just-done"));
      window.Progress.onChange(sync);
      sync();
    });
  }

  /* ===================================================== init =========== */
  function init() {
    highlight(); copyButtons(); sandboxes();
    fillBlanks(); shortAnswers(); mcqs(); checkpoints(); orderers();
    matchers(); signalPaths(); checklists(); driverStations(); canIdMaps(); fileTrees(); markComplete();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
