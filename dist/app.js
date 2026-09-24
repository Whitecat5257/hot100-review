(() => {
  "use strict";

  const STORAGE_KEY = "hot100-review-studio-progress-v1";
  const PRE_IMPORT_BACKUP_KEY = "hot100-review-studio-pre-import-backup-v1";
  const CORE_ROUNDS = 5;
  const FIXED_DELAYS = [1, 4, 10, 21];
  const RATINGS = {
    fluent: { label: "思路清晰 + 熟练写出", short: "熟练写出 · 5天", days: 5 },
    partial: { label: "思路了解但写不出来", short: "思路了解 · 3天", days: 3 },
    none: { label: "完全没思路", short: "完全没思路 · 1天", days: 1 }
  };

  const groups = Array.isArray(window.QUESTION_GROUPS) ? window.QUESTION_GROUPS : [];
  const problems = groups.flatMap(([category, items]) => items.map((item, index) => ({
    category,
    categoryOrder: index + 1,
    id: String(item[0]),
    cn: item[1],
    en: item[2],
    difficulty: item[3],
    slug: item[4]
  }))).map((problem, index) => ({ ...problem, order: index + 1 }));
  const validIds = new Set(problems.map((problem) => problem.id));

  const els = {
    todayLabel: document.querySelector("#todayLabel"),
    startedMetric: document.querySelector("#startedMetric"),
    coreMetric: document.querySelector("#coreMetric"),
    attemptMetric: document.querySelector("#attemptMetric"),
    dueMetric: document.querySelector("#dueMetric"),
    progressText: document.querySelector("#progressText"),
    progressBar: document.querySelector("#progressBar"),
    dueList: document.querySelector("#dueList"),
    problemGroups: document.querySelector("#problemGroups"),
    emptyState: document.querySelector("#emptyState"),
    searchInput: document.querySelector("#searchInput"),
    categoryFilter: document.querySelector("#categoryFilter"),
    statusFilter: document.querySelector("#statusFilter"),
    dataDialog: document.querySelector("#dataDialog"),
    clearDialog: document.querySelector("#clearDialog"),
    fileInput: document.querySelector("#fileInput"),
    dataMessage: document.querySelector("#dataMessage"),
    toast: document.querySelector("#toast")
  };

  let state = loadState();
  let toastTimer = 0;

  function todayISO() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function parseISO(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function addDays(value, days) {
    const date = parseISO(value);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function daysBetween(from, to) {
    return Math.round((parseISO(to) - parseISO(from)) / 86400000);
  }

  function normalizeDate(value) {
    const text = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
    const date = parseISO(text);
    const [year, month, day] = text.split("-").map(Number);
    return Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day ? "" : text;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeRecord(raw = {}) {
    const sourceRounds = Array.isArray(raw.rounds) ? raw.rounds : [];
    const sourceDates = Array.isArray(raw.dates) ? raw.dates : [];
    const sourceRatings = Array.isArray(raw.ratings) ? raw.ratings : Array.isArray(raw.reviewRatings) ? raw.reviewRatings : [];
    const length = Math.max(CORE_ROUNDS, sourceRounds.length, sourceDates.length, sourceRatings.length);
    const rounds = Array.from({ length }, (_, index) => Boolean(sourceRounds[index] || sourceDates[index]));
    const dates = Array.from({ length }, (_, index) => rounds[index] ? normalizeDate(sourceDates[index]) : "");
    const ratings = Array.from({ length }, (_, index) => index >= CORE_ROUNDS && rounds[index] && RATINGS[sourceRatings[index]] ? sourceRatings[index] : "");
    return { rounds, dates, ratings, note: typeof raw.note === "string" ? raw.note : "" };
  }

  function normalizeProgress(rawProgress) {
    const normalized = {};
    if (!rawProgress || typeof rawProgress !== "object" || Array.isArray(rawProgress)) return normalized;
    Object.entries(rawProgress).forEach(([id, record]) => {
      if (validIds.has(String(id))) normalized[String(id)] = normalizeRecord(record);
    });
    return normalized;
  }

  function loadState() {
    try {
      return normalizeProgress(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch {
      return {};
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getRecord(id) {
    if (!state[id]) state[id] = normalizeRecord();
    return state[id];
  }

  function ensureRound(record, round) {
    while (record.rounds.length <= round) record.rounds.push(false);
    while (record.dates.length <= round) record.dates.push("");
    while (record.ratings.length <= round) record.ratings.push("");
  }

  function completedRounds(record) {
    return record.rounds.filter(Boolean).length;
  }

  function reviewInfo(problem) {
    const record = getRecord(problem.id);
    const completed = completedRounds(record);
    if (completed === 0) return { status: "not-started", text: "尚未开始", due: false, nextRound: 0 };

    const lastDate = record.dates[completed - 1];
    if (!lastDate) return { status: "pending", text: "请补充完成日期", due: false, nextRound: completed };

    let delay = null;
    if (completed < CORE_ROUNDS) {
      delay = FIXED_DELAYS[completed - 1];
    } else if (completed === CORE_ROUNDS) {
      return { status: "core-complete", text: "五轮已完成", due: false, nextRound: completed };
    } else {
      delay = RATINGS[record.ratings[completed - 1]]?.days || null;
    }

    if (!delay) {
      return { status: "pending", text: `请评价第 ${completed} 次掌握程度`, due: false, nextRound: completed };
    }

    const dueDate = addDays(lastDate, delay);
    const diff = daysBetween(todayISO(), dueDate);
    const text = diff < 0 ? `已超期 ${Math.abs(diff)} 天` : diff === 0 ? "今天" : `${diff} 天后`;
    return { status: completed >= CORE_ROUNDS ? "long-term" : "reviewing", text, due: diff <= 0, dueDate, nextRound: completed };
  }

  function difficultyText(value) {
    return value === "Easy" ? "简单" : value === "Medium" ? "中等" : "困难";
  }

  function ratingOptions(selected) {
    return `<option value="">选择掌握程度</option>${Object.entries(RATINGS).map(([value, item]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${item.label} · ${item.days}天后</option>`).join("")}`;
  }

  function renderRoundCell(record, round) {
    const date = record.dates[round] || "";
    const showRating = round >= CORE_ROUNDS && Boolean(date);
    return `
      <div class="round-cell">
        <span class="round-label">第${round + 1}次</span>
        <button class="date-button ${date ? "done" : ""}" type="button" data-action="pick-date" data-round="${round}">${date || "选择日期"}</button>
        <input class="date-input" type="date" data-action="date-input" data-round="${round}" value="${escapeHtml(date)}" tabindex="-1">
        ${showRating ? `<select class="rating-select" data-action="set-rating" data-round="${round}" aria-label="第${round + 1}次掌握程度">${ratingOptions(record.ratings[round] || "")}</select>` : ""}
      </div>`;
  }

  function renderStats() {
    const records = problems.map((problem) => getRecord(problem.id));
    const started = records.filter((record) => completedRounds(record) > 0).length;
    const coreDone = records.filter((record) => completedRounds(record) >= CORE_ROUNDS).length;
    const attempts = records.reduce((sum, record) => sum + completedRounds(record), 0);
    const coreChecks = records.reduce((sum, record) => sum + Math.min(CORE_ROUNDS, completedRounds(record)), 0);
    const due = problems.filter((problem) => reviewInfo(problem).due).length;
    const percent = Math.round(coreChecks / (problems.length * CORE_ROUNDS) * 100) || 0;
    els.startedMetric.textContent = started;
    els.coreMetric.textContent = coreDone;
    els.attemptMetric.textContent = attempts;
    els.dueMetric.textContent = due;
    els.progressText.textContent = `${percent}%`;
    els.progressBar.style.width = `${percent}%`;
  }

  function renderDueList() {
    const dueItems = problems
      .map((problem) => ({ problem, info: reviewInfo(problem) }))
      .filter((item) => item.info.due)
      .sort((a, b) => a.info.dueDate.localeCompare(b.info.dueDate) || a.problem.order - b.problem.order);

    els.dueList.innerHTML = dueItems.length ? dueItems.slice(0, 6).map(({ problem, info }) => `
      <article class="due-card">
        <div>
          <a href="https://leetcode.cn/problems/${problem.slug}/" target="_blank" rel="noopener">${problem.id}. ${escapeHtml(problem.cn)}</a>
          <p>下一次：第 ${info.nextRound + 1} 次 · ${escapeHtml(problem.category)}</p>
        </div>
        <span class="due-date">${escapeHtml(info.text)}</span>
      </article>`).join("") : `<div class="due-empty">今天没有到期题目。保持节奏就好。</div>`;
  }

  function matchesFilters(problem) {
    const query = els.searchInput.value.trim().toLowerCase();
    const category = els.categoryFilter.value;
    const status = els.statusFilter.value;
    const record = getRecord(problem.id);
    const completed = completedRounds(record);
    const info = reviewInfo(problem);
    const haystack = `${problem.id} ${problem.cn} ${problem.en} ${problem.category}`.toLowerCase();
    const queryMatch = !query || haystack.includes(query);
    const categoryMatch = category === "all" || category === problem.category;
    const statusMatch = status === "all"
      || (status === "not-started" && completed === 0)
      || (status === "started" && completed > 0)
      || (status === "due" && info.due)
      || (status === "core-done" && completed >= CORE_ROUNDS);
    return queryMatch && categoryMatch && statusMatch;
  }

  function renderProblemRow(problem) {
    const record = getRecord(problem.id);
    const completed = completedRounds(record);
    const info = reviewInfo(problem);
    const visibleRounds = Math.max(CORE_ROUNDS, completed + 1);
    const nextClass = info.status === "pending" ? "next-review pending" : "next-review";
    const nextDetail = info.dueDate
      ? `计划日期 ${info.dueDate}`
      : completed === CORE_ROUNDS
        ? "可继续记录第 6 次"
        : completed > CORE_ROUNDS
          ? "选择掌握程度后生成"
          : "";
    return `
      <tr data-problem-id="${problem.id}" class="${info.due ? "due-row" : ""}">
        <td class="col-order">${problem.order}</td>
        <td class="col-problem"><a class="problem-link" href="https://leetcode.cn/problems/${problem.slug}/" target="_blank" rel="noopener"><span>${problem.id}</span> ${escapeHtml(problem.cn)}</a><div class="problem-en">${escapeHtml(problem.en)}</div></td>
        <td class="col-level"><span class="difficulty ${problem.difficulty.toLowerCase()}">${difficultyText(problem.difficulty)}</span></td>
        <td class="col-dates"><div class="round-grid">${Array.from({ length: visibleRounds }, (_, round) => renderRoundCell(record, round)).join("")}</div></td>
        <td class="col-next"><div class="${nextClass}"><span>${escapeHtml(info.text)}</span>${nextDetail ? `<small>${escapeHtml(nextDetail)}</small>` : ""}</div></td>
        <td class="col-note"><input class="note-input" data-action="note" type="text" value="${escapeHtml(record.note)}" placeholder="错因 / 模板 / 下次注意"></td>
      </tr>`;
  }

  function renderGroups() {
    let rendered = 0;
    els.problemGroups.innerHTML = groups.map(([category]) => {
      const categoryProblems = problems.filter((problem) => problem.category === category);
      const filtered = categoryProblems.filter(matchesFilters);
      if (!filtered.length) return "";
      rendered += filtered.length;
      const started = categoryProblems.filter((problem) => completedRounds(getRecord(problem.id)) > 0).length;
      return `
        <section class="category-section">
          <div class="category-head"><h3>${escapeHtml(category)}</h3><span>${started}/${categoryProblems.length} 题已开始</span></div>
          <div class="table-wrap">
            <table class="problem-table">
              <thead><tr><th class="col-order">顺序</th><th class="col-problem">题目</th><th class="col-level">难度</th><th class="col-dates">完成日期与掌握程度</th><th class="col-next">建议复习</th><th class="col-note">备注</th></tr></thead>
              <tbody>${filtered.map(renderProblemRow).join("")}</tbody>
            </table>
          </div>
        </section>`;
    }).join("");
    els.emptyState.classList.toggle("hidden", rendered > 0);
  }

  function render() {
    renderStats();
    renderDueList();
    renderGroups();
  }

  function updateRoundDate(problemId, round, value) {
    const record = getRecord(problemId);
    ensureRound(record, round);
    if (value) {
      for (let index = 0; index <= round; index += 1) {
        record.rounds[index] = true;
        if (!record.dates[index]) record.dates[index] = value;
      }
      record.dates[round] = value;
    } else {
      for (let index = round; index < record.rounds.length; index += 1) {
        record.rounds[index] = false;
        record.dates[index] = "";
        record.ratings[index] = "";
      }
    }
    saveState();
    render();
  }

  function updateRating(problemId, round, rating) {
    const record = getRecord(problemId);
    ensureRound(record, round);
    record.ratings[round] = RATINGS[rating] ? rating : "";
    saveState();
    render();
  }

  function backupPayload() {
    return {
      version: 2,
      app: "hot100-review-studio",
      exportedAt: new Date().toISOString(),
      reviewPolicy: { fixedDelays: FIXED_DELAYS, adaptiveAfterRound: CORE_ROUNDS, ratings: RATINGS },
      progress: state
    };
  }

  function downloadBackup(silent = false) {
    const blob = new Blob([JSON.stringify(backupPayload(), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `hot100-progress-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    if (!silent) showToast("当前记录已导出");
  }

  async function importFile(file) {
    try {
      const payload = JSON.parse(await file.text());
      const imported = normalizeProgress(payload.progress || payload);
      if (!Object.keys(imported).length) throw new Error("文件中没有可识别的 Hot 100 记录");
      localStorage.setItem(PRE_IMPORT_BACKUP_KEY, JSON.stringify(backupPayload()));
      state = imported;
      saveState();
      render();
      const count = Object.values(state).filter((record) => completedRounds(record) > 0).length;
      els.dataMessage.textContent = `导入成功，已接续 ${count} 道题的记录。`;
      showToast("旧记录已安全接续");
    } catch (error) {
      els.dataMessage.textContent = `导入失败：${error.message}`;
    } finally {
      els.fileInput.value = "";
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  function registerWebMcpTools() {
    const context = document.modelContext;
    if (!context?.registerTool) return;

    const tools = [
      {
        name: "get_due_reviews",
        title: "读取今日到期复习",
        description: "读取当前 Hot 100 记录中今天已经到期的复习题目。",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute() {
          return {
            date: todayISO(),
            reviews: problems.map((problem) => ({ problem, info: reviewInfo(problem) }))
              .filter(({ info }) => info.due)
              .map(({ problem, info }) => ({ id: problem.id, title: problem.cn, nextRound: info.nextRound + 1, dueDate: info.dueDate }))
          };
        }
      },
      {
        name: "record_problem_attempt",
        title: "记录一次做题完成",
        description: "为指定题目记录下一次完成日期；第 6 次及以后必须同时提供掌握程度。",
        inputSchema: {
          type: "object",
          properties: {
            problemId: { type: "string" },
            date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            rating: { type: "string", enum: ["fluent", "partial", "none"] }
          },
          required: ["problemId", "date"],
          additionalProperties: false
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          const id = String(input?.problemId || "");
          const date = normalizeDate(input?.date);
          if (!validIds.has(id)) throw new Error("题号不在 Hot 100 列表中");
          if (!date) throw new Error("日期格式无效");
          const record = getRecord(id);
          const round = completedRounds(record);
          if (round >= CORE_ROUNDS && !RATINGS[input?.rating]) throw new Error("第 6 次及以后必须选择掌握程度");
          ensureRound(record, round);
          record.rounds[round] = true;
          record.dates[round] = date;
          record.ratings[round] = round >= CORE_ROUNDS ? input.rating : "";
          saveState();
          render();
          const problem = problems.find((item) => item.id === id);
          const info = reviewInfo(problem);
          return { id, completedRound: round + 1, nextReviewDate: info.dueDate || null, nextReviewText: info.text };
        }
      }
    ];

    tools.forEach((tool) => {
      try { void Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch { /* Unsupported preview implementation. */ }
    });
  }

  function initFilters() {
    groups.forEach(([category]) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      els.categoryFilter.appendChild(option);
    });
  }

  els.problemGroups.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="pick-date"]');
    if (!button) return;
    const row = button.closest("tr[data-problem-id]");
    const input = row.querySelector(`input[data-action="date-input"][data-round="${button.dataset.round}"]`);
    if (input?.showPicker) input.showPicker(); else input?.click();
  });

  els.problemGroups.addEventListener("change", (event) => {
    const row = event.target.closest("tr[data-problem-id]");
    if (!row) return;
    const round = Number(event.target.dataset.round);
    if (event.target.matches('[data-action="date-input"]')) updateRoundDate(row.dataset.problemId, round, normalizeDate(event.target.value));
    if (event.target.matches('[data-action="set-rating"]')) updateRating(row.dataset.problemId, round, event.target.value);
  });

  els.problemGroups.addEventListener("input", (event) => {
    if (!event.target.matches('[data-action="note"]')) return;
    const row = event.target.closest("tr[data-problem-id]");
    getRecord(row.dataset.problemId).note = event.target.value;
    saveState();
  });

  [els.searchInput, els.categoryFilter, els.statusFilter].forEach((control) => control.addEventListener(control === els.searchInput ? "input" : "change", renderGroups));
  document.querySelector("#showAllDueButton").addEventListener("click", () => { els.statusFilter.value = "due"; renderGroups(); document.querySelector("#problemListTitle").scrollIntoView({ behavior: "smooth" }); });
  document.querySelector("#dataButton").addEventListener("click", () => { els.dataMessage.textContent = ""; els.dataDialog.showModal(); });
  document.querySelector("#exportButton").addEventListener("click", () => downloadBackup());
  document.querySelector("#dialogExportButton").addEventListener("click", () => downloadBackup());
  document.querySelector("#importButton").addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", () => { if (els.fileInput.files[0]) importFile(els.fileInput.files[0]); });
  document.querySelector("#clearButton").addEventListener("click", () => els.clearDialog.showModal());
  document.querySelector("#confirmClearButton").addEventListener("click", () => { state = {}; saveState(); render(); els.clearDialog.close(); els.dataDialog.close(); showToast("当前浏览器记录已清空"); });

  const now = new Date();
  els.todayLabel.textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now);
  initFilters();
  render();
  registerWebMcpTools();
})();
