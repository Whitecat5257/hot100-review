const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.resolve(__dirname, "../dist/app.js"), "utf8");
const html = fs.readFileSync(path.resolve(__dirname, "../dist/index.html"), "utf8");
const categories = ["数组与哈希", "双指针与滑动窗口", "矩阵", "二分查找", "链表", "栈与堆", "二叉树", "图论", "回溯", "动态规划与贪心"];
const els = {
  categoryInputs: categories.map((value) => ({ value, checked: true })),
  categoryFilterLabel: {}, categorySelectionCount: {},
  searchInput: { value: "" }, sourceFilter: { value: "all" }, statusFilter: { value: "all" },
  huaweiTierInputs: ["S", "A", "B", "C"].map((value) => ({ value, checked: true })),
  difficultyInputs: ["Easy", "Medium", "Hard"].map((value) => ({ value, checked: true }))
};
const problems = categories.map((category, index) => ({ id: String(index), category, cn: "题目", en: "Problem", difficulty: index % 2 ? "Medium" : "Easy", isHuawei: index % 2 === 0, huaweiTier: "A", completed: index % 3 }));
const context = vm.createContext({ els, CORE_ROUNDS: 5,
  getRecord: (id) => problems.find((problem) => problem.id === id),
  completedRounds: (record) => record.completed, reviewInfo: () => ({ due: false })
});
function load(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
}
load("  function matchesFilters", "  function syncHuaweiTierFilter");
load("  function syncCategorySelection", "  function positionCategoryPanel");
for (let mask = 0; mask < 1024; mask += 1) {
  els.categoryInputs.forEach((input, index) => { input.checked = Boolean(mask & (1 << index)); });
  context.syncCategorySelection();
  problems.forEach((problem, index) => assert.equal(context.matchesFilters(problem), Boolean(mask & (1 << index))));
  const count = els.categoryInputs.filter((input) => input.checked).length;
  assert.equal(els.categorySelectionCount.textContent, `已选 ${count} / 10`);
  assert.equal(els.categoryFilterLabel.textContent, count === 10 ? "全部专题" : count === 0 ? "未选择专题" : count === 1 ? els.categoryInputs.find((input) => input.checked).value : `已选 ${count} 个专题`);
}
context.setCategorySelection(false);
assert.ok(problems.every((problem) => !context.matchesFilters(problem)));
context.setCategorySelection(true);
assert.ok(problems.every((problem) => context.matchesFilters(problem)));
els.sourceFilter.value = "huawei";
els.statusFilter.value = "started";
assert.equal(context.matchesFilters(problems[2]), true);
els.categoryInputs[2].checked = false;
assert.equal(context.matchesFilters(problems[2]), false);
assert.ok(html.includes('<details id="categoryFilter"'));
assert.ok(html.includes('id="selectAllCategoriesButton"'));
assert.ok(html.includes('id="clearCategoriesButton"'));
assert.ok(!source.includes('els.categoryFilter.value'));
console.log("PASS: all 1024 topic combinations, selection labels, select/clear all, and combined filters");
