(() => {
  const STORAGE_KEY = "markupQuest.progress.v1";
  const data = window.GAME_DATA;
  if (!data || !Array.isArray(data.modules)) {
    document.getElementById("main").innerHTML =
      '<div class="panel"><h2>Missing data</h2><p class="lead">Could not load GAME_DATA.</p></div>';
    return;
  }

  const main = document.getElementById("main");
  const btnReset = document.getElementById("btn-reset");
  const btnHow = document.getElementById("btn-how");
  const modalHow = document.getElementById("modal-how");

  /** @type {{ completed: string[], best: Record<string, number> }} */
  let progress = loadProgress();

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { completed: [], best: {} };
      const parsed = JSON.parse(raw);
      return {
        completed: Array.isArray(parsed.completed) ? parsed.completed : [],
        best: parsed.best && typeof parsed.best === "object" ? parsed.best : {},
      };
    } catch {
      return { completed: [], best: {} };
    }
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }

  function isModuleUnlocked(index) {
    if (index === 0) return true;
    const prev = data.modules[index - 1];
    return progress.completed.includes(prev.id);
  }

  function passThreshold() {
    return typeof data.passThreshold === "number" ? data.passThreshold : 0.7;
  }

  /** @type {{ moduleIndex: number, qIndex: number, score: number, state: any, feedbackEl?: HTMLElement | null, lastCheck?: { ok: boolean, qIndex: number } | null } | null} */
  let session = null;

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function renderMenu() {
    btnHow.hidden = false;
    session = null;
    const th = Math.round(passThreshold() * 100);
    main.innerHTML = `
      <section class="panel">
        <h2>Chapter map</h2>
        <p class="lead">
          ${data.modules.length} chapters span HTML and CSS topics from document structure to motion and theming.
          Score at least <strong>${th}%</strong> to unlock the next chapter.
        </p>
        <div class="map-grid" role="list">
          ${data.modules
            .map((m, i) => {
              const unlocked = isModuleUnlocked(i);
              const done = progress.completed.includes(m.id);
              const best = progress.best[m.id];
              const pill = done
                ? `<span class="pill ok">Best ${typeof best === "number" ? Math.round(best * 100) : 0}%</span>`
                : unlocked
                  ? `<span class="pill">Open</span>`
                  : `<span class="pill locked">Locked</span>`;
              return `
                <button
                  type="button"
                  class="chapter-card"
                  role="listitem"
                  data-index="${i}"
                  ${unlocked ? "" : "disabled"}
                >
                  <div class="title">
                    <span>${esc(m.title)}</span>
                    ${pill}
                  </div>
                  <div style="color: var(--muted); font-size: 0.82rem; margin: 0 0 8px;">${esc(m.area)}</div>
                  <ul class="chapter-topics">
                    ${m.topics.slice(0, 4).map((t) => `<li>${esc(t)}</li>`).join("")}
                    ${m.topics.length > 4 ? `<li>+ more…</li>` : ""}
                  </ul>
                </button>`;
            })
            .join("")}
        </div>
      </section>`;

    main.querySelectorAll(".chapter-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-index"));
        if (!Number.isFinite(idx) || !isModuleUnlocked(idx)) return;
        startModule(idx);
      });
    });
  }

  function startModule(moduleIndex) {
    const mod = data.modules[moduleIndex];
    session = {
      moduleIndex,
      qIndex: 0,
      score: 0,
      state: initQuestionState(mod.questions[0]),
    };
    renderPlay();
  }

  function initQuestionState(q) {
    if (q.type === "order") {
      return { type: "order", order: shuffle(q.lines.map(String)), revealed: false };
    }
    if (q.type === "match") {
      const pairs = q.pairs.map((p, i) => ({ i, term: String(p.term), def: String(p.def) }));
      return {
        type: "match",
        terms: shuffle(pairs.map((p) => ({ i: p.i, text: p.term }))),
        defs: shuffle(pairs.map((p) => ({ i: p.i, text: p.def }))),
        pickedTerm: null,
        matched: new Set(),
        mismatches: 0,
        revealed: false,
      };
    }
    if (q.type === "mcq") {
      const perm = shuffle(q.options.map((_, idx) => idx));
      return { type: "mcq", perm, selected: null, revealed: false };
    }
    if (q.type === "tf") {
      return { type: "tf", choice: null, revealed: false };
    }
    if (q.type === "gap") {
      return { type: "gap", value: "", revealed: false };
    }
    return { type: "unknown" };
  }

  function currentModule() {
    return data.modules[session.moduleIndex];
  }

  function currentQuestion() {
    const mod = currentModule();
    return mod.questions[session.qIndex];
  }

  function renderPlay() {
    const mod = currentModule();
    const q = currentQuestion();
    const total = mod.questions.length;
    const pct = Math.round(((session.qIndex + 1) / total) * 100);

    main.innerHTML = `
      <section class="panel">
        <div class="play-head">
          <div>
            <div style="color: var(--muted); font-size: 0.9rem;">${esc(mod.area)} · Chapter ${session.moduleIndex + 1}</div>
            <h2 style="margin: 6px 0 0; font-size: 1.05rem;">${esc(mod.title)}</h2>
          </div>
          <button type="button" class="btn ghost" id="btn-back">Map</button>
        </div>
        <div class="progress" aria-hidden="true"><i style="width:${Math.min(100, pct)}%"></i></div>
        <div class="q-head">
          <h3 class="q-title">${esc(q.prompt)}</h3>
          <p class="q-meta">Question ${session.qIndex + 1} of ${total} · ${esc(q.topic || "Mixed")}</p>
        </div>
        <div id="q-body"></div>
        <div class="row-actions" id="q-actions"></div>
        <div id="q-feedback" class="feedback" hidden></div>
      </section>`;

    document.getElementById("btn-back").addEventListener("click", renderMenu);

    const body = document.getElementById("q-body");
    const actions = document.getElementById("q-actions");
    const feedback = document.getElementById("q-feedback");

    session.feedbackEl = feedback;

    if (q.type === "mcq") renderMCQ(body, actions, q);
    else if (q.type === "tf") renderTF(body, actions, q);
    else if (q.type === "gap") renderGap(body, actions, q);
    else if (q.type === "order") renderOrder(body, actions, q);
    else if (q.type === "match") renderMatch(body, actions, q);
    else {
      body.innerHTML = `<p class="lead">Unsupported question type.</p>`;
      actions.innerHTML = `<button type="button" class="btn primary" id="btn-next">Next</button>`;
      document.getElementById("btn-next").addEventListener("click", advance);
    }

    if (session.lastCheck && session.lastCheck.qIndex === session.qIndex) {
      const ok = session.lastCheck.ok;
      session.lastCheck = null;
      showAnswerFeedback(ok, q);
    }
  }

  function formatCorrectAnswer(q) {
    if (q.type === "mcq") return String(q.options[q.correctIndex]);
    if (q.type === "tf") return q.correct ? "True" : "False";
    if (q.type === "gap") return q.answers.map(String).join(" · ");
    if (q.type === "order") return q.lines.map(String).join("\n");
    if (q.type === "match") return q.pairs.map((p) => `${p.term} → ${p.def}`).join("\n");
    return "";
  }

  function showAnswerFeedback(ok, q) {
    const el = session.feedbackEl;
    if (!el) return;
    const explain = esc(q.explain || "");
    const correct = formatCorrectAnswer(q);
    const multiline = q.type === "order" || q.type === "match";
    el.hidden = false;
    el.style.borderColor = ok ? "rgba(74, 222, 128, 0.35)" : "rgba(251, 113, 133, 0.35)";
    el.innerHTML = `
      <div class="feedback-head"><strong>${ok ? "Nice!" : "Not quite."}</strong></div>
      <p class="feedback-explain">${explain}</p>
      <div class="correct-callout">
        <div class="correct-callout-label">Correct answer</div>
        ${
          multiline
            ? `<pre class="code correct-answer-code">${esc(correct)}</pre>`
            : `<div class="correct-inline">${esc(correct)}</div>`
        }
      </div>`;
  }

  function gradeMCQ(q, st) {
    const chosenOriginalIndex = st.perm[st.selected];
    return chosenOriginalIndex === q.correctIndex;
  }

  function renderMCQ(body, actions, q) {
    const st = session.state;
    const labels = st.perm.map((origIdx) => q.options[origIdx]);
    body.innerHTML = `
      <div class="options" role="radiogroup" aria-label="Choices">
        ${labels
          .map(
            (label, displayIdx) => `
          <button type="button" class="opt ${st.selected === displayIdx ? "selected" : ""} ${
            st.revealed
              ? st.perm[displayIdx] === q.correctIndex
                ? "reveal-correct"
                : st.selected === displayIdx
                  ? "reveal-wrong"
                  : ""
              : ""
          }" data-idx="${displayIdx}" ${st.revealed ? "disabled" : ""}>
            ${esc(label)}
          </button>`
          )
          .join("")}
      </div>`;

    if (!st.revealed) {
      body.querySelectorAll(".opt").forEach((btn) => {
        btn.addEventListener("click", () => {
          st.selected = Number(btn.getAttribute("data-idx"));
          renderPlay();
        });
      });
      actions.innerHTML = `
        <button type="button" class="btn primary" id="btn-check" ${st.selected === null ? "disabled" : ""}>Check</button>
        <span class="sr-only" aria-live="polite">Pick an answer, then check.</span>`;
      document.getElementById("btn-check").addEventListener("click", () => {
        if (st.selected === null) return;
        const ok = gradeMCQ(q, st);
        st.revealed = true;
        if (ok) session.score += 1;
        session.lastCheck = { ok, qIndex: session.qIndex };
        renderPlay();
      });
    } else {
      actions.innerHTML = `<button type="button" class="btn primary" id="btn-next">Next</button>`;
      document.getElementById("btn-next").addEventListener("click", advance);
    }
  }

  function renderTF(body, actions, q) {
    const st = session.state;
    body.innerHTML = `
      <div class="options" role="group" aria-label="True or false">
        <button type="button" class="opt ${st.choice === true ? "selected" : ""} ${
          st.revealed ? (q.correct === true ? "reveal-correct" : st.choice === true ? "reveal-wrong" : "") : ""
        }" data-v="1" ${st.revealed ? "disabled" : ""}>True</button>
        <button type="button" class="opt ${st.choice === false ? "selected" : ""} ${
          st.revealed ? (q.correct === false ? "reveal-correct" : st.choice === false ? "reveal-wrong" : "") : ""
        }" data-v="0" ${st.revealed ? "disabled" : ""}>False</button>
      </div>`;

    if (!st.revealed) {
      body.querySelectorAll(".opt").forEach((btn) => {
        btn.addEventListener("click", () => {
          st.choice = btn.getAttribute("data-v") === "1";
          renderPlay();
        });
      });
      actions.innerHTML = `<button type="button" class="btn primary" id="btn-check" ${
        st.choice === null ? "disabled" : ""
      }>Check</button>`;
      document.getElementById("btn-check").addEventListener("click", () => {
        if (st.choice === null) return;
        const ok = st.choice === q.correct;
        st.revealed = true;
        if (ok) session.score += 1;
        session.lastCheck = { ok, qIndex: session.qIndex };
        renderPlay();
      });
      if (st.choice !== null) {
        document.getElementById("btn-check").disabled = false;
      }
    } else {
      actions.innerHTML = `<button type="button" class="btn primary" id="btn-next">Next</button>`;
      document.getElementById("btn-next").addEventListener("click", advance);
    }
  }

  function normalizeGap(s) {
    return String(s).trim().toLowerCase();
  }

  function gradeGap(q, st) {
    const val = normalizeGap(st.value);
    return q.answers.some((a) => normalizeGap(a) === val);
  }

  function renderGap(body, actions, q) {
    const st = session.state;
    body.innerHTML = `
      <form class="gap-form" id="gap-form">
        <label class="sr-only" for="gap-input">Your answer</label>
        <input id="gap-input" autocomplete="off" ${st.revealed ? "readonly" : ""} value="${esc(st.value)}" />
 </form>`;

    const input = document.getElementById("gap-input");
    if (!st.revealed) {
      input.addEventListener("input", () => {
        st.value = input.value;
      });
      actions.innerHTML = `<button type="button" class="btn primary" id="btn-check">Check</button>`;
      document.getElementById("btn-check").addEventListener("click", () => {
        st.value = input.value;
        const ok = gradeGap(q, st);
        st.revealed = true;
        if (ok) session.score += 1;
        session.lastCheck = { ok, qIndex: session.qIndex };
        renderPlay();
      });
      input.focus();
    } else {
      actions.innerHTML = `<button type="button" class="btn primary" id="btn-next">Next</button>`;
      document.getElementById("btn-next").addEventListener("click", advance);
    }
  }

  function renderOrder(body, actions, q) {
    const st = session.state;
    const lines = st.order;

    const renderList = () => {
      const locked = st.revealed;
      body.innerHTML = `
        <p class="q-meta" style="margin-top:-6px;">${
          locked ? "Final order (read-only)." : "Use the arrows to reorder the lines."
        }</p>
        <div class="order-list" id="order-list">
          ${lines
            .map(
              (line, idx) => `
            <div class="order-item" draggable="false">
              <code>${esc(line)}</code>
              <div class="order-controls">
                <button type="button" class="mini" data-dir="-1" data-idx="${idx}" aria-label="Move up" ${
                  locked || idx === 0 ? "disabled" : ""
                }>↑</button>
                <button type="button" class="mini" data-dir="1" data-idx="${idx}" aria-label="Move down" ${
                  locked || idx === lines.length - 1 ? "disabled" : ""
                }>↓</button>
              </div>
            </div>`
            )
            .join("")}
        </div>`;

      if (!locked) {
        body.querySelectorAll(".mini").forEach((btn) => {
          btn.addEventListener("click", () => {
            const idx = Number(btn.getAttribute("data-idx"));
            const dir = Number(btn.getAttribute("data-dir"));
            const j = idx + dir;
            if (j < 0 || j >= lines.length) return;
            const tmp = lines[idx];
            lines[idx] = lines[j];
            lines[j] = tmp;
            renderList();
          });
        });
      }
    };

    renderList();

    if (!st.revealed) {
      actions.innerHTML = `<button type="button" class="btn primary" id="btn-check">Check order</button>`;
      document.getElementById("btn-check").addEventListener("click", () => {
        const ok = lines.join("\n") === q.lines.join("\n");
        st.revealed = true;
        if (ok) session.score += 1;
        session.lastCheck = { ok, qIndex: session.qIndex };
        renderPlay();
      });
    } else {
      actions.innerHTML = `<button type="button" class="btn primary" id="btn-next">Next</button>`;
      document.getElementById("btn-next").addEventListener("click", advance);
    }
  }

  function renderMatch(body, actions, q) {
    const st = session.state;

    if (st.revealed) {
      const key = q.pairs.map((p) => `${p.term} → ${p.def}`).join("\n");
      body.innerHTML = `
        <p class="q-meta" style="margin-top:-6px;">Answer key</p>
        <pre class="code correct-answer-code">${esc(key)}</pre>`;
      actions.innerHTML = `<button type="button" class="btn primary" id="btn-next">Next</button>`;
      document.getElementById("btn-next").addEventListener("click", advance);
      return;
    }

    const renderBoard = () => {
      body.innerHTML = `
        <div class="match-grid">
          <div class="match-col">
            <h3>Terms</h3>
            ${st.terms
              .map((t) => {
                const done = st.matched.has(`t${t.i}`);
                const picked = st.pickedTerm === t.i;
                return `<button type="button" class="tile ${done ? "matched" : ""} ${picked ? "picked" : ""}" data-side="t" data-id="${t.i}" ${
                  done ? "disabled" : ""
                }>${esc(t.text)}</button>`;
              })
              .join("")}
          </div>
          <div class="match-col">
            <h3>Definitions</h3>
            ${st.defs
              .map((d) => {
                const done = st.matched.has(`d${d.i}`);
                return `<button type="button" class="tile ${done ? "matched" : ""}" data-side="d" data-id="${d.i}" ${
                  done ? "disabled" : ""
                }>${esc(d.text)}</button>`;
              })
              .join("")}
          </div>
        </div>
        <p class="q-meta">Pick a term, then its matching definition. Wrong pairs count against your chapter score threshold as mistakes.</p>`;
    };

    renderBoard();

    function attachHandlers() {
      body.querySelectorAll(".tile").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          const side = btn.getAttribute("data-side");
          const id = Number(btn.getAttribute("data-id"));
          if (side === "t") {
            st.pickedTerm = st.pickedTerm === id ? null : id;
            renderMatch(body, actions, q);
            return;
          }

          if (st.pickedTerm === null) return;

          if (st.pickedTerm === id) {
            st.matched.add(`t${st.pickedTerm}`);
            st.matched.add(`d${id}`);
          } else {
            st.mismatches += 1;
          }
          st.pickedTerm = null;
          renderMatch(body, actions, q);
        });
      });
    }

    attachHandlers();

    const allDone = q.pairs.length * 2 === st.matched.size;
    actions.innerHTML = `
      <button type="button" class="btn primary" id="btn-done" ${allDone ? "" : "disabled"}>Submit matches</button>
      <span style="color: var(--muted); font-size: 0.9rem;">Mismatches: ${st.mismatches}</span>`;
    const doneBtn = document.getElementById("btn-done");
    doneBtn.disabled = !allDone;
    doneBtn.addEventListener("click", () => {
      const ok = st.mismatches === 0;
      st.revealed = true;
      if (ok) session.score += 1;
      session.lastCheck = { ok, qIndex: session.qIndex };
      renderPlay();
    });
  }

  function advance() {
    const mod = currentModule();
    if (session.qIndex >= mod.questions.length - 1) {
      finishModule();
      return;
    }
    session.lastCheck = null;
    session.qIndex += 1;
    session.state = initQuestionState(mod.questions[session.qIndex]);
    renderPlay();
  }

  function finishModule() {
    const mod = currentModule();
    const total = mod.questions.length;
    const ratio = total ? session.score / total : 0;
    const passed = ratio >= passThreshold();

    if (passed) {
      if (!progress.completed.includes(mod.id)) progress.completed.push(mod.id);
    }
    const prev = progress.best[mod.id];
    if (typeof prev !== "number" || ratio > prev) progress.best[mod.id] = ratio;
    saveProgress();

    const next = data.modules[session.moduleIndex + 1];
    const nextUnlocked = next ? isModuleUnlocked(session.moduleIndex + 1) : false;

    main.innerHTML = `
      <section class="panel">
        <h2>Chapter complete</h2>
        <div class="summary">
          <div class="big">${Math.round(ratio * 100)}%</div>
          <div class="kpi">
            <span>${session.score} / ${total} correct</span>
            <span>Threshold ${Math.round(passThreshold() * 100)}%</span>
            <span>${passed ? "Passed" : "Retry recommended"}</span>
          </div>
          <p class="lead">
            ${
              passed
                ? next
                  ? nextUnlocked
                    ? `Unlocked: <strong>${esc(next.title)}</strong>.`
                    : "Great work—keep going through the map."
                  : "You finished the final chapter on this path. Replay any chapter to improve your best score."
                : "You can open the map and replay this chapter anytime. Passing unlocks the next chapter."
            }
          </p>
          <div class="row-actions">
            <button type="button" class="btn primary" id="btn-map">Back to map</button>
            ${
              passed
                ? `<button type="button" class="btn ghost" id="btn-retry">Replay chapter</button>`
                : `<button type="button" class="btn ghost" id="btn-retry">Try again</button>`
            }
          </div>
        </div>
      </section>`;

    document.getElementById("btn-map").addEventListener("click", renderMenu);
    document.getElementById("btn-retry").addEventListener("click", () => startModule(session.moduleIndex));
  }

  btnReset.addEventListener("click", () => {
    if (!confirm("Reset all saved progress for Markup Quest in this browser?")) return;
    progress = { completed: [], best: {} };
    saveProgress();
    renderMenu();
  });

  btnHow.addEventListener("click", () => {
    if (modalHow.showModal) modalHow.showModal();
  });

  renderMenu();
})();
