(() => {
  "use strict";

  const STORAGE_KEY = "hot100-review-studio-progress-v1";
  const PRE_IMPORT_BACKUP_KEY = "hot100-review-studio-pre-import-backup-v1";
  const PRE_DELETE_BACKUP_KEY = "hot100-review-studio-pre-delete-backup-v1";
  const CUSTOM_PROBLEMS_KEY = "hot100-review-studio-custom-problems-v1";
  const CORE_ROUNDS = 5;
  const FIXED_DELAYS = [1, 4, 10, 21];
  const RATINGS = {
    fluent: { label: "思路清晰 + 熟练写出", short: "熟练写出 · 5天", days: 5 },
    partial: { label: "思路了解但写不出来", short: "思路了解 · 3天", days: 3 },
    none: { label: "完全没思路", short: "完全没思路 · 1天", days: 1 }
  };

  const baseGroups = Array.isArray(window.QUESTION_GROUPS) ? window.QUESTION_GROUPS : [];
  const baseCategories = baseGroups.map(([category]) => category);
  const leetcodeCatalog = (Array.isArray(window.LEETCODE_CATALOG)
    ? window.LEETCODE_CATALOG
    : Object.entries(window.LEETCODE_CATALOG || {}).map(([id, item]) => [id, ...item]))
    .map(([id, title, slug, level, category]) => ({
      id: String(id),
      title: String(title),
      slug: String(slug),
      level: Number(level),
      category: baseCategories.includes(category) ? category : baseCategories[0]
    }))
    .filter((item) => item.id && item.title && item.slug);
  const baseProblems = baseGroups.flatMap(([category, items]) => items.map((item, index) => ({
    category,
    categoryOrder: index + 1,
    id: String(item[0]),
    cn: item[1],
    en: item[2],
    difficulty: item[3],
    slug: item[4],
    isCustom: false
  }))).map((problem, index) => ({ ...problem, order: index + 1 }));
  const baseIds = new Set(baseProblems.map((problem) => problem.id));
  let customProblems = loadCustomProblems();
  let groups = baseGroups;
  let problems = [];
  let validIds = new Set();
  refreshProblemCatalog();

  const els = {
    todayLabel: document.querySelector("#todayLabel"),
    startedMetric: document.querySelector("#startedMetric"),
    startedTotal: document.querySelector("#startedTotal"),
    coreMetric: document.querySelector("#coreMetric"),
    coreTotal: document.querySelector("#coreTotal"),
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
    newProblemIdInput: document.querySelector("#newProblemIdInput"),
    addProblemDialog: document.querySelector("#addProblemDialog"),
    addProblemForm: document.querySelector("#addProblemForm"),
    newProblemCategory: document.querySelector("#newProblemCategory"),
    categoryRecommendation: document.querySelector("#categoryRecommendation"),
    newProblemChineseTitle: document.querySelector("#newProblemChineseTitle"),
    lookupHint: document.querySelector("#lookupHint"),
    lookupCandidates: document.querySelector("#lookupCandidates"),
    lookupResult: document.querySelector("#lookupResult"),
    lookupProblemNumber: document.querySelector("#lookupProblemNumber"),
    lookupProblemTitle: document.querySelector("#lookupProblemTitle"),
    lookupProblemDifficulty: document.querySelector("#lookupProblemDifficulty"),
    confirmAddProblemButton: document.querySelector("#confirmAddProblemButton"),
    deleteProblemDialog: document.querySelector("#deleteProblemDialog"),
    deleteProblemName: document.querySelector("#deleteProblemName"),
    toast: document.querySelector("#toast")
  };

  let state = loadState();
  let toastTimer = 0;
  let pendingProblem = null;
  let pendingMatches = [];
  let pendingDeleteProblemId = "";

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

  function problemIdKey(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function hasProblemId(id) {
    const key = problemIdKey(id);
    return problems.some((problem) => problemIdKey(problem.id) === key);
  }

  function normalizeCustomProblem(raw) {
    const id = String(raw?.id || "").trim();
    const category = String(raw?.category || "");
    const difficulty = ["Easy", "Medium", "Hard"].includes(raw?.difficulty) ? raw.difficulty : "Medium";
    if (!id || id.length > 40 || baseIds.has(id) || !baseCategories.includes(category)) return null;
    if (!raw?.slug || (!raw?.cn && !raw?.en)) return null;
    return {
      id,
      cn: String(raw.cn || raw.en).trim(),
      en: String(raw.en || "").trim(),
      slug: String(raw.slug).trim(),
      difficulty,
      category,
      addedAt: String(raw.addedAt || ""),
      isCustom: true
    };
  }

  function normalizeCustomProblems(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw.map(normalizeCustomProblem).filter((problem) => {
      const key = problemIdKey(problem?.id);
      if (!problem || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function loadCustomProblems() {
    try {
      return normalizeCustomProblems(JSON.parse(localStorage.getItem(CUSTOM_PROBLEMS_KEY) || "[]"));
    } catch {
      return [];
    }
  }

  function saveCustomProblems() {
    localStorage.setItem(CUSTOM_PROBLEMS_KEY, JSON.stringify(customProblems));
  }

  function refreshProblemCatalog() {
    const categoryCounts = new Map();
    const extras = customProblems.map((problem) => {
      const customOrder = (categoryCounts.get(problem.category) || 0) + 1;
      categoryCounts.set(problem.category, customOrder);
      return { ...problem, customOrder };
    });
    problems = [...baseProblems, ...extras];
    validIds = new Set(problems.map((problem) => problem.id));
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

  function normalizeProgress(rawProgress, allowedIds = validIds) {
    const normalized = {};
    if (!rawProgress || typeof rawProgress !== "object" || Array.isArray(rawProgress)) return normalized;
    Object.entries(rawProgress).forEach(([id, record]) => {
      if (allowedIds.has(String(id))) normalized[String(id)] = normalizeRecord(record);
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
    els.startedTotal.textContent = problems.length;
    els.coreMetric.textContent = coreDone;
    els.coreTotal.textContent = problems.length;
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

  function rowVisualClass(record, info) {
    const completed = completedRounds(record);
    if (completed === 0) return "state-not-started";

    if (info.due && info.dueDate) {
      const overdueDays = Math.max(0, -daysBetween(todayISO(), info.dueDate));
      const level = overdueDays === 0 ? 1
        : overdueDays <= 2 ? 2
          : overdueDays <= 6 ? 3
            : overdueDays <= 13 ? 4
              : 5;
      return `state-overdue overdue-${level}`;
    }

    if (completed <= CORE_ROUNDS) {
      return `state-core core-${completed}`;
    }

    const ratingLevel = { none: 1, partial: 2, fluent: 3 }[record.ratings[completed - 1]] || 1;
    return `state-adaptive mastery-${ratingLevel}`;
  }

  function renderProblemRow(problem) {
    const record = getRecord(problem.id);
    const completed = completedRounds(record);
    const info = reviewInfo(problem);
    const visualClass = rowVisualClass(record, info);
    const visibleRounds = Math.max(CORE_ROUNDS, completed + 1);
    const nextClass = info.status === "pending" ? "next-review pending" : "next-review";
    const nextDetail = info.dueDate
      ? `计划日期 ${info.dueDate}`
      : completed === CORE_ROUNDS
        ? "可继续记录第 6 次"
        : completed > CORE_ROUNDS
          ? "选择掌握程度后生成"
          : "";
    const displayOrder = problem.isCustom ? `补${problem.customOrder}` : problem.order;
    const englishTitle = problem.en ? `<div class="problem-en">${escapeHtml(problem.en)}</div>` : "";
    const customBadge = problem.isCustom ? `<span class="custom-badge">补充</span>` : "";
    const customActions = problem.isCustom ? `
      <div class="custom-manage">
        <label><span class="sr-only">调整 ${escapeHtml(problem.id)} 的专题</span><select data-action="custom-category" aria-label="调整 ${escapeHtml(problem.id)} 的专题">${baseCategories.map((category) => `<option value="${escapeHtml(category)}"${category === problem.category ? " selected" : ""}>${escapeHtml(category)}</option>`).join("")}</select></label>
        <button class="delete-problem-button" type="button" data-action="delete-custom" aria-label="删除 ${escapeHtml(problem.id)}">删除</button>
      </div>` : "";
    return `
      <tr data-problem-id="${escapeHtml(problem.id)}" class="problem-row ${visualClass}">
        <td class="col-order">${displayOrder}</td>
        <td class="col-problem"><a class="problem-link" href="https://leetcode.cn/problems/${escapeHtml(problem.slug)}/" target="_blank" rel="noopener"><span>${escapeHtml(problem.id)}</span> ${escapeHtml(problem.cn)} ${customBadge}</a>${englishTitle}</td>
        <td class="col-level"><span class="difficulty ${problem.difficulty.toLowerCase()}">${difficultyText(problem.difficulty)}</span></td>
        <td class="col-dates"><div class="round-grid">${Array.from({ length: visibleRounds }, (_, round) => renderRoundCell(record, round)).join("")}</div></td>
        <td class="col-next"><div class="${nextClass}"><span>${escapeHtml(info.text)}</span>${nextDetail ? `<small>${escapeHtml(nextDetail)}</small>` : ""}</div></td>
        <td class="col-note"><input class="note-input" data-action="note" type="text" value="${escapeHtml(record.note)}" placeholder="错因 / 模板 / 下次注意">${customActions}</td>
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
      const standardRows = filtered.filter((problem) => !problem.isCustom).map(renderProblemRow).join("");
      const customRows = filtered.filter((problem) => problem.isCustom).map(renderProblemRow).join("");
      const customDivider = customRows ? `<tr class="custom-divider"><td colspan="6"><span>补充题目</span></td></tr>` : "";
      return `
        <section class="category-section">
          <div class="category-head"><h3>${escapeHtml(category)}</h3><span>${started}/${categoryProblems.length} 题已开始</span></div>
          <div class="table-wrap">
            <table class="problem-table">
              <thead><tr><th class="col-order">顺序</th><th class="col-problem">题目</th><th class="col-level">难度</th><th class="col-dates">完成日期与掌握程度</th><th class="col-next">建议复习</th><th class="col-note">备注</th></tr></thead>
              <tbody>${standardRows}${customDivider}${customRows}</tbody>
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
      version: 4,
      app: "hot100-review-studio",
      exportedAt: new Date().toISOString(),
      reviewPolicy: { fixedDelays: FIXED_DELAYS, adaptiveAfterRound: CORE_ROUNDS, ratings: RATINGS },
      customProblems,
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
      const importedCustomProblems = Array.isArray(payload.customProblems)
        ? normalizeCustomProblems(payload.customProblems)
        : null;
      const importIds = importedCustomProblems
        ? new Set([...baseIds, ...importedCustomProblems.map((problem) => problem.id)])
        : validIds;
      const imported = normalizeProgress(payload.progress || payload, importIds);
      if (!Object.keys(imported).length && !importedCustomProblems?.length) {
        throw new Error("文件中没有可识别的题目记录");
      }
      localStorage.setItem(PRE_IMPORT_BACKUP_KEY, JSON.stringify(backupPayload()));
      if (Array.isArray(payload.customProblems)) {
        customProblems = importedCustomProblems;
        saveCustomProblems();
        refreshProblemCatalog();
      }
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

  function difficultyFromLevel(level) {
    return Number(level) === 1 ? "Easy" : Number(level) === 3 ? "Hard" : "Medium";
  }

  function trailingProblemNumber(id) {
    return String(id).match(/(\d+(?:\.\d+)?)$/)?.[1] || "";
  }

  function findCatalogMatches(query) {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const key = problemIdKey(trimmed);
    if (/^\d+$/.test(trimmed)) {
      const number = Number(trimmed);
      return leetcodeCatalog.filter((item) => {
        const suffix = trailingProblemNumber(item.id);
        return suffix && !suffix.includes(".") && Number(suffix) === number;
      }).sort((a, b) => {
        const aExact = /^\d+$/.test(a.id) ? 0 : 1;
        const bExact = /^\d+$/.test(b.id) ? 0 : 1;
        return aExact - bExact || a.id.localeCompare(b.id, "zh-CN", { numeric: true });
      });
    }
    return leetcodeCatalog.filter((item) => problemIdKey(item.id) === key);
  }

  function selectLookupCandidate(index) {
    const candidate = pendingMatches[index];
    if (!candidate || hasProblemId(candidate.id)) return;
    pendingProblem = {
      id: candidate.id,
      title: candidate.title,
      slug: candidate.slug,
      difficulty: difficultyFromLevel(candidate.level),
      category: candidate.category
    };
    els.lookupCandidates.querySelectorAll(".candidate-button").forEach((button, buttonIndex) => {
      button.classList.toggle("selected", buttonIndex === index);
      button.setAttribute("aria-pressed", String(buttonIndex === index));
    });
    els.lookupProblemNumber.textContent = pendingProblem.id;
    els.lookupProblemTitle.textContent = pendingProblem.title;
    els.lookupProblemDifficulty.textContent = difficultyText(pendingProblem.difficulty);
    els.newProblemCategory.value = pendingProblem.category;
    els.categoryRecommendation.textContent = `已根据力扣算法标签推荐“${pendingProblem.category}”，加入后仍可调整。`;
    els.lookupResult.classList.remove("hidden");
    els.confirmAddProblemButton.disabled = false;
  }

  function renderLookupCandidates(matches) {
    els.lookupHint.textContent = matches.length > 1
      ? `“${els.newProblemIdInput.value.trim()}” 对应 ${matches.length} 道系列题，请确认你要录入的题目。`
      : "已从力扣公开题库中找到以下题目。";
    els.lookupCandidates.innerHTML = matches.map((item, index) => {
      const exists = hasProblemId(item.id);
      return `<button class="candidate-button${exists ? " exists" : ""}" type="button" data-candidate-index="${index}" ${exists ? "disabled" : ""} aria-pressed="false">
        <span>${escapeHtml(item.id)}</span><strong>${escapeHtml(item.title)}</strong><small>${difficultyText(difficultyFromLevel(item.level))} · 推荐 ${escapeHtml(item.category)}${exists ? " · 已在题库" : ""}</small>
      </button>`;
    }).join("");
  }

  function lookupNewProblem() {
    const query = els.newProblemIdInput.value.trim();
    if (!query) {
      showToast("请输入力扣题号");
      els.newProblemIdInput.focus();
      return;
    }
    const matches = findCatalogMatches(query);
    if (!matches.length) {
      showToast("暂未在力扣公开题库中找到该题号");
      return;
    }
    pendingMatches = matches;
    pendingProblem = null;
    els.lookupResult.classList.add("hidden");
    els.confirmAddProblemButton.disabled = true;
    els.newProblemChineseTitle.value = "";
    els.newProblemCategory.value = baseCategories[0];
    els.categoryRecommendation.textContent = "选择题目后将自动推荐专题。";
    renderLookupCandidates(matches);
    els.addProblemDialog.showModal();
    if (matches.length === 1 && !hasProblemId(matches[0].id)) selectLookupCandidate(0);
  }

  function addPendingProblem() {
    if (!pendingProblem) return;
    const chineseTitle = els.newProblemChineseTitle.value.trim();
    customProblems.push({
      id: pendingProblem.id,
      cn: chineseTitle || pendingProblem.title,
      en: chineseTitle ? pendingProblem.title : "",
      slug: pendingProblem.slug,
      difficulty: pendingProblem.difficulty,
      category: els.newProblemCategory.value,
      addedAt: new Date().toISOString(),
      isCustom: true
    });
    saveCustomProblems();
    refreshProblemCatalog();
    render();
    els.addProblemDialog.close();
    els.newProblemIdInput.value = "";
    showToast(`已加入 ${pendingProblem.id}. ${chineseTitle || pendingProblem.title}`);
    pendingProblem = null;
    pendingMatches = [];
  }

  function updateCustomProblemCategory(problemId, category) {
    const problem = customProblems.find((item) => problemIdKey(item.id) === problemIdKey(problemId));
    if (!problem || !baseCategories.includes(category) || problem.category === category) return;
    problem.category = category;
    saveCustomProblems();
    refreshProblemCatalog();
    render();
    showToast(`${problem.id} 已调整到“${category}”`);
  }

  function requestDeleteCustomProblem(problemId) {
    const problem = customProblems.find((item) => problemIdKey(item.id) === problemIdKey(problemId));
    if (!problem) return;
    pendingDeleteProblemId = problem.id;
    els.deleteProblemName.textContent = `${problem.id}. ${problem.cn}`;
    els.deleteProblemDialog.showModal();
  }

  function deletePendingCustomProblem() {
    const problem = customProblems.find((item) => problemIdKey(item.id) === problemIdKey(pendingDeleteProblemId));
    if (!problem) return;
    localStorage.setItem(PRE_DELETE_BACKUP_KEY, JSON.stringify(backupPayload()));
    customProblems = customProblems.filter((item) => problemIdKey(item.id) !== problemIdKey(problem.id));
    delete state[problem.id];
    saveCustomProblems();
    saveState();
    refreshProblemCatalog();
    render();
    els.deleteProblemDialog.close();
    showToast(`已删除 ${problem.id}. ${problem.cn}`);
    pendingDeleteProblemId = "";
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
      els.newProblemCategory.appendChild(option.cloneNode(true));
    });
  }

  els.problemGroups.addEventListener("click", (event) => {
    const deleteButton = event.target.closest('[data-action="delete-custom"]');
    if (deleteButton) {
      requestDeleteCustomProblem(deleteButton.closest("tr[data-problem-id]")?.dataset.problemId || "");
      return;
    }
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
    if (event.target.matches('[data-action="custom-category"]')) updateCustomProblemCategory(row.dataset.problemId, event.target.value);
  });

  els.problemGroups.addEventListener("input", (event) => {
    if (!event.target.matches('[data-action="note"]')) return;
    const row = event.target.closest("tr[data-problem-id]");
    getRecord(row.dataset.problemId).note = event.target.value;
    saveState();
  });

  [els.searchInput, els.categoryFilter, els.statusFilter].forEach((control) => control.addEventListener(control === els.searchInput ? "input" : "change", renderGroups));
  document.querySelector("#showAllDueButton").addEventListener("click", () => { els.statusFilter.value = "due"; renderGroups(); document.querySelector("#problemListTitle").scrollIntoView({ behavior: "smooth" }); });
  document.querySelector("#lookupProblemButton").addEventListener("click", lookupNewProblem);
  els.newProblemIdInput.addEventListener("keydown", (event) => { if (event.key === "Enter") lookupNewProblem(); });
  els.lookupCandidates.addEventListener("click", (event) => {
    const button = event.target.closest("[data-candidate-index]");
    if (button) selectLookupCandidate(Number(button.dataset.candidateIndex));
  });
  els.addProblemForm.addEventListener("submit", (event) => { event.preventDefault(); addPendingProblem(); });
  document.querySelector("#closeAddProblemButton").addEventListener("click", () => els.addProblemDialog.close());
  document.querySelector("#cancelAddProblemButton").addEventListener("click", () => els.addProblemDialog.close());
  document.querySelector("#cancelDeleteProblemButton").addEventListener("click", () => { pendingDeleteProblemId = ""; els.deleteProblemDialog.close(); });
  document.querySelector("#confirmDeleteProblemButton").addEventListener("click", deletePendingCustomProblem);
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
