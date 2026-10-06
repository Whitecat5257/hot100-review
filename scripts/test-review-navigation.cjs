const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "dist/app.js"), "utf8");
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(root, "dist/quotes.js"), "utf8"), context);
const inspiration = context.window.REVIEW_INSPIRATION;
assert.equal(inspiration.quotes.length, 100);
assert.equal(new Set(inspiration.quotes.map((quote) => quote.text)).size, 100);
for (let cycle = -3; cycle < 30; cycle += 1) {
  const bag = Array.from({ length: 100 }, (_, offset) => inspiration.forHour(cycle * 100 + offset));
  assert.equal(new Set(bag).size, 100);
  assert.notEqual(inspiration.forHour(cycle * 100 - 1), bag[0]);
  assert.equal(inspiration.forHour(cycle * 100), bag[0]);
}
assert.equal(inspiration.forHour(NaN), null);

// Exercise the actual rendering functions without a browser or user records.
const start = source.indexOf("  function renderDueList() {");
const end = source.indexOf("  function matchesFilters", start);
assert.ok(start > 0 && end > start);
let sections = [];
let now = new Date("2026-10-02T15:59:59+08:00").getTime();
let timer;
let renderCount = 0;
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const dueList = { innerHTML: "", querySelectorAll: () => sections };
const subjects = ["数组与哈希", "二叉树", "图论"];
const problems = Array.from({ length: 10 }, (_, index) => ({
  id: String(index + 1), cn: `题目${index + 1}`, order: index,
  category: subjects[index < 7 ? 0 : index < 9 ? 1 : 2],
  info: { due: index < 9, dueDate: index < 3 ? "2026-10-01" : "2026-10-02", nextRound: 2, text: "今天" }
}));
Object.assign(context, {
  Date: TestDate, Intl, problems, groups: subjects.map((subject) => [subject]),
  document: { querySelector: () => ({ classList: { remove() {} } }) },
  els: { dueList, todayLabel: {}, quoteText: {}, quoteSource: {}, backToTopButton: {} },
  openDueCategories: new Set(), quoteTimer: 0, displayedQuoteHour: null, displayedDay: "",
  reviewInfo: (problem) => problem.info,
  todayISO: () => new Date(now).toLocaleDateString("en-CA"),
  escapeHtml: (value) => String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]),
  renderHuaweiBadge: () => "", render: () => { renderCount += 1; },
  clearTimeout: () => { timer = undefined; },
  setTimeout: (callback, delay) => { timer = { callback, delay }; return 1; }
});
vm.runInContext(source.slice(start, end), context);
context.renderDueList();
assert.equal((dueList.innerHTML.match(/data-due-problem-id=/g) || []).length, 9);
assert.equal((dueList.innerHTML.match(/class="due-problem-button" type="button"/g) || []).length, 9);
assert.ok(!dueList.innerHTML.includes('href="https://leetcode.cn/'));
assert.equal((dueList.innerHTML.match(/<details /g) || []).length, 2);
assert.ok(dueList.innerHTML.includes("逾期 3 题"));
assert.ok(dueList.innerHTML.includes("今日 4 题"));
assert.ok(!dueList.innerHTML.includes('data-due-category="图论"'));
sections = [{ open: true, dataset: { dueCategory: subjects[0] } }];
context.renderDueList();
assert.ok(dueList.innerHTML.includes('data-due-category="数组与哈希" open'));
sections[0].open = false;
context.renderDueList();
assert.ok(!dueList.innerHTML.includes('data-due-category="数组与哈希" open'));
sections = [];
problems.forEach((problem) => { problem.info.due = false; });
context.renderDueList();
assert.ok(dueList.innerHTML.includes("due-empty"));
assert.ok(!dueList.innerHTML.includes("<details"));

const locateStart = source.indexOf("  function locateDueProblem(event) {");
const locateEnd = source.indexOf("  function searchProblemLibrary()", locateStart);
assert.ok(locateStart > 0 && locateEnd > locateStart);
let located;
context.findLibraryProblem = (id) => problems.find((problem) => problem.id === id);
context.locateLibraryProblem = (problem) => { located = problem; };
vm.runInContext(source.slice(locateStart, locateEnd), context);
context.locateDueProblem({ target: { closest: () => ({ dataset: { dueProblemId: "7" } }) } });
assert.equal(located, problems[6]);
located = undefined;
context.locateDueProblem({ target: { closest: () => null } });
assert.equal(located, undefined);
context.locateDueProblem({ target: { closest: () => ({ dataset: { dueProblemId: "missing" } }) } });
assert.equal(located, undefined);
assert.ok(source.includes('els.dueList.addEventListener("click", locateDueProblem)'));

context.scheduleQuoteRefresh();
assert.equal(timer.delay, 1050);
const firstQuote = context.els.quoteText.textContent;
context.refreshHeaderClock();
assert.equal(context.els.quoteText.textContent, firstQuote);
now += 1050;
timer.callback();
assert.notEqual(context.els.quoteText.textContent, firstQuote);
assert.ok(context.els.quoteSource.href.startsWith("https://zh.wikisource.org/"));
now = new Date("2026-10-03T00:00:01+08:00").getTime();
context.scheduleQuoteRefresh();
assert.equal(renderCount, 1);
context.window.scrollY = 0;
context.updateBackToTop();
assert.equal(context.els.backToTopButton.hidden, true);
context.window.scrollY = 200;
context.updateBackToTop();
assert.equal(context.els.backToTopButton.hidden, false);
context.window.scrollY = 0;
context.updateBackToTop();
assert.equal(context.els.backToTopButton.hidden, true);
console.log("PASS: 100 quotations, hourly rotation, grouped complete due list, expansion, midnight refresh, back-to-top visibility");
