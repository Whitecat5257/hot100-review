const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.resolve(__dirname, "../dist/app.js"), "utf8");
const problems = [
  { id: "1", cn: "两数之和", category: "数组与哈希" },
  { id: "49", cn: "字母异位词分组", category: "数组与哈希" },
  { id: "LCP 30", cn: "魔塔游戏", category: "动态规划与贪心" }
];
const records = {
  "1": { rounds: [true, true, false, true, true], dates: ["2026-10-02", "2026-10-02", "2026-10-02", "2026-02-30", ""], ratings: [] },
  "49": { rounds: [true, true, true, true, true, true], dates: ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-09-27", "2026-10-02"], ratings: ["", "", "", "", "", "partial"] },
  "LCP 30": { rounds: [true], dates: ["2026-09-30"], ratings: [] }
};
const before = JSON.stringify(records);
const els = Object.fromEntries(["calendarMonth", "calendarMonthSummary", "calendarGrid", "calendarDayTitle", "calendarDaySummary", "calendarDayProblems"].map((name) => [name, {}]));
const context = vm.createContext({ problems, els, CORE_ROUNDS: 5, calendarSelectedDate: "", RATINGS: { partial: { label: "思路了解但写不出来" } }, getRecord: (id) => records[id] });
function load(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
}
load("  function todayISO", "  function problemIdKey");
load("  function calendarHistory", "  function render() {");
context.todayISO = () => "2026-10-02";
const history = context.calendarHistory();
assert.equal(history.get("2026-10-02").size, 2);
assert.equal(history.get("2026-10-02").get("1").attempts.length, 2);
assert.equal(history.get("2026-10-02").get("49").attempts[0].rating, "partial");
assert.equal(history.has("2026-02-30"), false);
assert.equal(history.has(""), false);
context.selectCalendarDate("2026-10-02");
assert.equal(els.calendarMonth.value, "2026-10");
assert.equal(els.calendarMonthSummary.textContent, "本月 1 天有记录 · 2 道题 · 3 次完成");
assert.equal(els.calendarDaySummary.textContent, "2 道题 · 3 次完成");
assert.ok(els.calendarDayProblems.innerHTML.includes("思路了解但写不出来"));
assert.ok(els.calendarDayProblems.innerHTML.includes('data-problem-id="49"'));
assert.ok(!els.calendarDayProblems.innerHTML.includes("leetcode.cn"));
assert.equal((els.calendarGrid.innerHTML.match(/data-date=/g) || []).length, 42);
assert.ok(els.calendarGrid.innerHTML.includes('aria-label="2026-10-02，2 道题，今天" aria-pressed="true"'));
const days = context.calendarMonthDays("2024-02");
assert.equal(days[0], "2024-01-29");
assert.ok(days.includes("2024-02-29"));
assert.equal(new Set(days).size, 42);
context.selectCalendarDate("2026-10-03");
assert.equal(els.calendarDaySummary.textContent, "这一天还没有做题记录。");
assert.equal(els.calendarDayProblems.innerHTML, "");
context.changeCalendarMonth("2026-12");
context.moveCalendarMonth(1);
assert.equal(els.calendarMonth.value, "2027-01");
context.moveCalendarMonth(-1);
assert.equal(els.calendarMonth.value, "2026-12");
els.calendarMonth.value = "";
context.changeCalendarMonth("");
assert.equal(els.calendarMonth.value, "2026-12");
context.selectCalendarDate("2026-09-30");
assert.ok(els.calendarDayProblems.innerHTML.includes("魔塔游戏"));
context.selectCalendarDate("invalid");
assert.equal(context.calendarSelectedDate, "2026-09-30");
assert.equal(JSON.stringify(records), before);
console.log("PASS: daily deduplication, attempt details, invalid dates, leap month, year navigation, empty days, and read-only history");
