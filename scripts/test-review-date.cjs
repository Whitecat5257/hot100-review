const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.resolve(__dirname, "../dist/app.js"), "utf8");
let saves = 0;
let renders = 0;
const state = {};
const problems = [{ id: "1", cn: "两数之和" }];
const els = {
  reviewDateProblem: {}, reviewDateDefault: {}, reviewDateInput: {},
  reviewDateDialog: { showModal: () => {} }
};
const context = vm.createContext({
  state, problems, validIds: new Set(["1"]), els, pendingReviewProblemId: "", CORE_ROUNDS: 5,
  FIXED_DELAYS: [1, 4, 10, 21], RATINGS: { fluent: { days: 5 }, partial: { days: 3 }, none: { days: 1 } },
  getRecord: (id) => state[id], saveState: () => { saves += 1; }, render: () => { renders += 1; }, customProblems: []
});
function load(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
}
load("  function todayISO", "  function problemIdKey");
load("  function normalizeRecord", "  function loadState");
load("  function ensureRound", "  function difficultyText");
load("  function updateRoundDate", "  function downloadBackup");
context.todayISO = () => "2026-10-04";
const old = { rounds: [true], dates: ["2026-10-03"], note: "keep me" };
const oldBefore = JSON.stringify(old);
state["1"] = context.normalizeRecord(old);
assert.equal(state["1"].nextReviewDate, "");
assert.equal(context.reviewInfo(problems[0]).dueDate, "2026-10-04");
assert.equal(context.reviewInfo(problems[0]).due, true);
context.openReviewDateDialog("1");
assert.equal(els.reviewDateInput.value, "2026-10-04");
assert.equal(saves, 0);
const originalHistory = JSON.stringify([state["1"].dates, state["1"].rounds, state["1"].ratings, state["1"].note]);
assert.equal(context.setNextReviewDate("1", "2026-10-10"), true);
assert.equal(context.reviewInfo(problems[0]).due, false);
assert.equal(context.reviewInfo(problems[0]).text, "6 天后");
assert.equal(context.reviewInfo(problems[0]).custom, true);
assert.equal(JSON.stringify([state["1"].dates, state["1"].rounds, state["1"].ratings, state["1"].note]), originalHistory);
const backup = JSON.parse(JSON.stringify(context.backupPayload()));
assert.equal(backup.version, 5);
assert.equal(context.normalizeProgress(backup.progress)["1"].nextReviewDate, "2026-10-10");
context.updateRoundDate("1", 0, "2026-10-02");
assert.equal(context.reviewInfo(problems[0]).dueDate, "2026-10-10");
context.setNextReviewDate("1", "2026-10-01");
assert.equal(context.reviewInfo(problems[0]).text, "已超期 3 天");
context.setNextReviewDate("1", "");
assert.equal(context.reviewInfo(problems[0]).dueDate, "2026-10-03");
context.setNextReviewDate("1", "2026-10-10");
context.updateRoundDate("1", 1, "2026-10-04");
assert.equal(state["1"].nextReviewDate, "");
assert.equal(context.reviewInfo(problems[0]).dueDate, "2026-10-08");
const savesBeforeInvalid = saves;
assert.equal(context.setNextReviewDate("1", "2026-02-30"), false);
assert.equal(context.setNextReviewDate("unknown", "2026-10-10"), false);
assert.equal(saves, savesBeforeInvalid);
state["1"] = context.normalizeRecord({ dates: Array(5).fill("2026-10-04") });
assert.equal(context.reviewInfo(problems[0]).status, "core-complete");
context.setNextReviewDate("1", "2026-10-05");
assert.equal(context.reviewInfo(problems[0]).dueDate, "2026-10-05");
context.updateRoundDate("1", 5, "2026-10-04");
assert.equal(context.reviewInfo(problems[0]).status, "pending");
context.updateRating("1", 5, "fluent");
assert.equal(context.reviewInfo(problems[0]).dueDate, "2026-10-09");
context.setNextReviewDate("1", "2026-10-06");
context.updateRating("1", 5, "none");
assert.equal(context.reviewInfo(problems[0]).dueDate, "2026-10-06");
context.updateRoundDate("1", 5, "");
assert.equal(state["1"].nextReviewDate, "");
assert.equal(context.reviewInfo(problems[0]).status, "core-complete");
state["1"] = context.normalizeRecord({ nextReviewDate: "2026-10-04" });
assert.equal(context.reviewInfo(problems[0]).status, "not-started");
assert.equal(context.setNextReviewDate("1", "2026-10-05"), false);
assert.equal(context.normalizeRecord({ nextReviewDate: "bad" }).nextReviewDate, "");
assert.equal(JSON.stringify(old), oldBefore);
assert.equal(saves, renders);
assert.ok(source.includes('record.nextReviewDate = "";\n          saveState();') || source.includes('record.nextReviewDate = "";\r\n          saveState();'));
console.log("PASS: default/custom due dates, restore, persistence, round lifecycle, rating edits, invalid dates, and unchanged history");
