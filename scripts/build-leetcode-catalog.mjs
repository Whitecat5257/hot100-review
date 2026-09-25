import fs from "node:fs/promises";

const API_URL = "https://leetcode.cn/api/problems/all/";
const GRAPHQL_URL = "https://leetcode.cn/graphql/";
const OUTPUT_URL = new URL("../dist/leetcode-catalog.js", import.meta.url);
const BATCH_SIZE = 60;

const categoryRules = [
  ["回溯", ["backtracking"]],
  ["图论", ["graph", "union-find", "shortest-path", "topological-sort", "minimum-spanning-tree", "biconnected-component"]],
  ["二叉树", ["tree", "binary-tree", "binary-search-tree", "trie"]],
  ["链表", ["linked-list", "doubly-linked-list"]],
  ["二分查找", ["binary-search"]],
  ["矩阵", ["matrix"]],
  ["双指针与滑动窗口", ["sliding-window", "two-pointers"]],
  ["动态规划与贪心", ["dynamic-programming", "greedy", "memoization"]],
  ["栈与堆", ["stack", "monotonic-stack", "heap-priority-queue", "queue", "monotonic-queue"]]
];

function recommendedCategory(tags) {
  const tagSet = new Set(tags);
  return categoryRules.find(([, slugs]) => slugs.some((slug) => tagSet.has(slug)))?.[0] || "数组与哈希";
}

async function fetchJson(url, options, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 900));
    }
  }
  throw lastError;
}

const listing = await fetchJson(API_URL);
const questions = listing.stat_status_pairs.map((item) => ({
  id: String(item.stat.frontend_question_id),
  title: String(item.stat.question__title),
  slug: String(item.stat.question__title_slug),
  level: Number(item.difficulty.level)
}));

const tagsBySlug = new Map();
const batches = [];
for (let start = 0; start < questions.length; start += BATCH_SIZE) {
  batches.push(questions.slice(start, start + BATCH_SIZE));
}

let completed = 0;
async function fetchTagBatch(batch) {
  const fields = batch.map((question, index) =>
    `q${index}: question(titleSlug: ${JSON.stringify(question.slug)}) { titleSlug topicTags { slug } }`
  ).join(" ");
  const result = await fetchJson(GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: `query { ${fields} }` })
  });
  for (const value of Object.values(result.data || {})) {
    if (value?.titleSlug) tagsBySlug.set(value.titleSlug, (value.topicTags || []).map((tag) => tag.slug));
  }
  completed += batch.length;
  process.stdout.write(`\rFetched tags for ${completed}/${questions.length}`);
}

for (let start = 0; start < batches.length; start += 6) {
  await Promise.all(batches.slice(start, start + 6).map(fetchTagBatch));
}

const catalog = questions.map((question) => [
  question.id,
  question.title,
  question.slug,
  question.level,
  recommendedCategory(tagsBySlug.get(question.slug) || [])
]);

await fs.writeFile(OUTPUT_URL, `window.LEETCODE_CATALOG = ${JSON.stringify(catalog)};\n`, "utf8");
console.log(`\nWrote ${catalog.length} questions to ${OUTPUT_URL.pathname}`);
