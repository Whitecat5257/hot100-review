const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../dist/app.js"), "utf8");
const difficulties = ["Easy", "Medium", "Hard"];
const els = {
  searchInput: { value: "" }, categoryFilter: { value: "all" },
  sourceFilter: { value: "all" }, statusFilter: { value: "all" },
  difficultyInputs: difficulties.map((value) => ({ value, checked: true })),
  huaweiTierInputs: ["S", "A", "B", "C"].map((value) => ({ value, checked: true }))
};
const problems = difficulties.map((difficulty, index) => ({
  id: String(index + 1), cn: `最小栈${index}`, en: "Min Stack", difficulty,
  category: "栈与堆", isHuawei: true, huaweiTier: "B", huaweiTierLabel: "常考",
  completed: index, due: index === 1
}));
const context = vm.createContext({
  els, CORE_ROUNDS: 5,
  getRecord: (id) => problems.find((problem) => problem.id === id),
  completedRounds: (record) => record.completed,
  reviewInfo: (problem) => ({ due: problem.due })
});
const start = source.indexOf("  function matchesFilters(problem) {");
const end = source.indexOf("  function syncHuaweiTierFilter", start);
assert.ok(start > 0 && end > start);
vm.runInContext(source.slice(start, end), context);
for (let mask = 0; mask < 8; mask += 1) {
  els.difficultyInputs.forEach((input, index) => { input.checked = Boolean(mask & (1 << index)); });
  problems.forEach((problem, index) => {
    assert.equal(context.matchesFilters(problem), Boolean(mask & (1 << index)));
  });
}
els.sourceFilter.value = "huawei";
els.huaweiTierInputs[2].checked = false;
assert.equal(context.matchesFilters(problems[1]), false);
els.huaweiTierInputs[2].checked = true;
assert.equal(context.matchesFilters(problems[1]), true);
els.categoryFilter.value = "图论";
assert.equal(context.matchesFilters(problems[1]), false);
els.categoryFilter.value = "all";
els.searchInput.value = "最小栈";
els.statusFilter.value = "due";
assert.equal(context.matchesFilters(problems[1]), true);
assert.equal(context.matchesFilters(problems[0]), false);
els.searchInput.value = "不存在";
assert.equal(context.matchesFilters(problems[1]), false);

// Search and due-list navigation must reveal a target excluded by difficulty.
els.difficultyInputs.forEach((input) => { input.checked = false; });
const target = problems[1];
let renderCount = 0;
let focusCount = 0;
let scrolled = false;
const classes = new Set();
const row = {
  dataset: { problemId: target.id },
  classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
  scrollIntoView: () => { scrolled = true; }, focus: () => { focusCount += 1; }
};
els.problemGroups = { querySelectorAll: () => [row] };
Object.assign(context, {
  renderGroups: () => { renderCount += 1; assert.ok(els.difficultyInputs.every((input) => input.checked)); },
  requestAnimationFrame: (callback) => callback(), setTimeout: () => 1,
  problemIdKey: (value) => String(value), showToast: () => {}
});
const locateStart = source.indexOf("  function locateLibraryProblem(problem) {");
const locateEnd = source.indexOf("  function locateDueProblem", locateStart);
assert.ok(locateStart > 0 && locateEnd > locateStart);
vm.runInContext(source.slice(locateStart, locateEnd), context);
context.locateLibraryProblem(target);
assert.equal(renderCount, 1);
assert.equal(focusCount, 1);
assert.equal(scrolled, true);
assert.ok(classes.has("search-target"));
assert.equal(context.matchesFilters(target), true);
assert.equal(els.sourceFilter.value, "all");
assert.equal(els.statusFilter.value, "all");
assert.equal(els.searchInput.value, "");
assert.ok(source.includes('els.difficultyInputs.forEach((input) => input.addEventListener("change", renderGroups))'));
console.log("PASS: all 8 difficulty combinations, combined filters, and navigation resetting difficulty");
