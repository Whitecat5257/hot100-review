const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../dist/app.js"), "utf8");
const els = {
  searchInput: { value: "" }, categoryFilter: { value: "all" },
  sourceFilter: { value: "all" }, statusFilter: { value: "all" },
  difficultyInputs: ["Easy", "Medium", "Hard"].map((value) => ({ value, checked: true })),
  huaweiTierInputs: ["S", "A", "B", "C"].map((value) => ({ value, checked: true })),
  huaweiTierFilter: {}, problemGroups: {}, filterCategorySummary: {},
  filteredTotal: {}, filteredStarted: {}, filteredUnstarted: {},
  emptyState: { classList: { toggle: (name, hidden) => { els.emptyState.hidden = hidden; } } }
};
const problems = [
  { id: "1", category: "数组与哈希", difficulty: "Easy", completed: 1, isHuawei: true, huaweiTier: "A" },
  { id: "2", category: "数组与哈希", difficulty: "Hard", completed: 2, isHuawei: true, huaweiTier: "B" },
  { id: "3", category: "栈与堆", difficulty: "Medium", completed: 0, isHuawei: true, huaweiTier: "A" },
  { id: "4", category: "栈与堆", difficulty: "Easy", completed: 1 }
].map((problem) => ({ cn: "最小栈", en: "Min Stack", ...problem }));
const context = vm.createContext({
  els, problems, groups: [["数组与哈希"], ["栈与堆"], ["图论"]], CORE_ROUNDS: 5,
  getRecord: (id) => problems.find((problem) => problem.id === id),
  completedRounds: (record) => record.completed,
  reviewInfo: (problem) => ({ due: problem.completed === 2 }),
  escapeHtml: (value) => String(value),
  renderProblemRow: (problem) => `<tr data-problem-id="${problem.id}"></tr>`
});
function load(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
}
load("  function matchesFilters", "  function rowVisualClass");
load("  function filteredGroupStats", "  function render() {");
function check(total, started, categoryCounts) {
  context.renderGroups();
  assert.equal(els.filteredTotal.textContent, total);
  assert.equal(els.filteredStarted.textContent, started);
  assert.equal(els.filteredUnstarted.textContent, total - started);
  const stats = context.filteredGroupStats();
  assert.equal(stats.reduce((sum, group) => sum + group.filtered.length, 0), total);
  stats.forEach((group, index) => {
    assert.equal(group.filtered.length, categoryCounts[index][0]);
    assert.equal(group.started, categoryCounts[index][1]);
    if (group.filtered.length) {
      assert.ok(els.problemGroups.innerHTML.includes(`${group.started}/${group.filtered.length} 题已开始`));
    }
  });
  assert.equal((els.problemGroups.innerHTML.match(/data-problem-id=/g) || []).length, total);
  assert.equal(els.emptyState.hidden, total > 0);
}
check(4, 3, [[2, 2], [2, 1], [0, 0]]);
els.difficultyInputs[2].checked = false;
check(3, 2, [[1, 1], [2, 1], [0, 0]]);
els.sourceFilter.value = "huawei";
check(2, 1, [[1, 1], [1, 0], [0, 0]]);
els.huaweiTierInputs[1].checked = false;
check(0, 0, [[0, 0], [0, 0], [0, 0]]);
els.huaweiTierInputs[1].checked = true;
els.statusFilter.value = "not-started";
check(1, 0, [[0, 0], [1, 0], [0, 0]]);
els.statusFilter.value = "started";
check(1, 1, [[1, 1], [0, 0], [0, 0]]);
els.statusFilter.value = "all";
els.categoryFilter.value = "栈与堆";
check(1, 0, [[0, 0], [1, 0], [0, 0]]);
problems[2].completed = 1;
check(1, 1, [[0, 0], [1, 1], [0, 0]]);
els.searchInput.value = "最小";
check(1, 1, [[0, 0], [1, 1], [0, 0]]);
els.searchInput.value = "不存在";
check(0, 0, [[0, 0], [0, 0], [0, 0]]);
assert.ok(els.filterCategorySummary.innerHTML.includes('class="filter-category-stat is-empty"'));
console.log("PASS: filtered totals, category/header consistency, combined filters, empty results, and record refresh");
