const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "dist/app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "dist/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "dist/styles.css"), "utf8");
assert.ok(html.indexOf('id="problemSearchForm"') > html.indexOf("</header>"));
assert.equal((html.match(/id="newProblemIdInput"/g) || []).length, 1);
assert.equal((html.match(/id="lookupProblemButton"/g) || []).length, 1);
assert.ok(html.includes('role="search" aria-label="查找力扣题目"'));
assert.ok(css.includes(".quick-search { position: fixed;"));
assert.ok(css.includes("@media (max-width: 1839px)"));
assert.ok(fs.existsSync(path.join(root, "dist/icons/search.svg")));
assert.ok(!source.includes('els.newProblemIdInput.addEventListener("keydown"'));
assert.ok(!source.includes('querySelector("#lookupProblemButton").addEventListener("click"'));

const events = [];
const input = { value: "", focus: () => events.push("focus") };
const existing = { id: "49", cn: "字母异位词分组" };
const missing = { id: "LCP 30", title: "魔塔游戏" };
const exact = { kind: "library", rank: 0, problem: existing };
const related = [{ ...exact, rank: 1 }, { kind: "catalog", rank: 2, item: missing }];
let submit;
const context = vm.createContext({
  els: { newProblemIdInput: input },
  findLibraryProblem: (query) => query === "49" ? existing : null,
  findCatalogMatches: (query) => query === "LCP 30" ? [missing] : [],
  findTitleSearchResults: (query) => query === "最小" ? related : query === "最小栈" ? [exact] : [],
  locateLibraryProblem: (problem) => events.push(["locate", problem]),
  showMissingProblemMatches: (matches) => events.push(["missing", matches]),
  showTitleSearchResults: (query, results) => events.push(["results", query, results]),
  showToast: () => events.push("toast"),
  document: { querySelector: (selector) => {
    assert.equal(selector, "#problemSearchForm");
    return { addEventListener: (event, callback) => { assert.equal(event, "submit"); submit = callback; } };
  } },
  saveState: () => { throw new Error("Search must not write progress"); }
});
const start = source.indexOf("  function searchProblemLibrary() {");
const end = source.indexOf("\n  function ", start + 10);
vm.runInContext(source.slice(start, end), context);
const bindingStart = source.indexOf('  document.querySelector("#problemSearchForm").addEventListener');
const bindingEnd = source.indexOf("  els.searchResultsList.addEventListener", bindingStart);
vm.runInContext(source.slice(bindingStart, bindingEnd), context);
function search(query) {
  events.length = 0;
  input.value = query;
  let prevented = false;
  submit({ preventDefault: () => { prevented = true; } });
  assert.ok(prevented);
  assert.equal(input.value, query);
}
search("49");
assert.equal(events.length, 1);
assert.equal(events[0][0], "locate");
assert.equal(events[0][1], existing);
search("最小栈");
assert.equal(events[0][0], "locate");
search("最小");
assert.equal(events[0][0], "results");
assert.equal(events[0][2].length, 2);
search("LCP 30");
assert.equal(events[0][0], "missing");
search("不存在的题目");
assert.deepEqual(events, ["toast"]);
search("  ");
assert.deepEqual(events, ["toast", "focus"]);
console.log("PASS: fixed search placement, one submit handler, number/Chinese/partial lookup, missing results, and read-only search");
