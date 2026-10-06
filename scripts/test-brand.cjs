const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("dist/index.html");
const app = read("dist/app.js");
assert.ok(html.includes("<title>知序 · 算法练习</title>"));
assert.ok(html.includes("<h1>知序</h1>"));
assert.ok(!html.includes("Hot 100 复习台"));
assert.ok(html.includes('media="(max-width: 700px)"'));
assert.ok(html.includes('id="quoteText"'));
assert.ok(app.includes('const STORAGE_KEY = "hot100-review-studio-progress-v1"'));
assert.ok(app.includes('app: "hot100-review-studio"'));
assert.ok(app.includes('addEventListener("error", () => document.querySelector("#quoteSheet").classList.remove("art-ready"))'));
assert.ok(fs.existsSync(path.join(root, "dist/icons/zhixu.svg")));
const context = vm.createContext({ window: {} });
vm.runInContext(read("dist/quotes.js"), context);
for (let index = 1; index <= context.window.REVIEW_INSPIRATION.quotes.length; index += 1) {
  for (const mode of ["desktop", "mobile"]) {
    const png = fs.readFileSync(path.join(root, "dist/quote-art", `${String(index).padStart(3, "0")}-${mode}.png`));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), mode === "desktop" ? 1872 : 1200);
    assert.ok(png.readUInt32BE(20) >= 126);
  }
}
console.log("PASS: rebrand, original storage/backup compatibility, 200 quote artworks, responsive sources and image fallback");
