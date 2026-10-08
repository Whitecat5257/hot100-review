const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const [archive, python = "python"] = process.argv.slice(2);
if (!archive) throw new Error("Pass the local calligraphy TTF/OTF path or ZIP archive; the font is not redistributed.");
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(root, "dist/quotes.js"), "utf8"), context);
process.stdout.write(execFileSync(python, [path.join(__dirname, "render-quote-art.py"), archive, path.join(root, "dist/quote-art")], {
  input: JSON.stringify(context.window.REVIEW_INSPIRATION.quotes), encoding: "utf8"
}));
