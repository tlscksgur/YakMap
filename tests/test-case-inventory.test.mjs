import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const docs = await readFile("docs/test-cases.md", "utf8");

const expectedIds = [
  ...ids("AUTH", [2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40]),
  ...ids("MED", range(1, 40)),
  ...ids("LOC", range(1, 40)),
  ...ids("SCH", range(1, 40))
];

for (const id of expectedIds) {
  assert.match(docs, new RegExp(`\\| ${id} \\|`), `${id} is missing from docs/test-cases.md`);
}

for (const status of ["Automated", "Manual", "Gap"]) {
  assert.match(docs, new RegExp(`\\| ${status} \\|`), `${status} status should be represented`);
}

const documentedIds = Array.from(docs.matchAll(/\| ((AUTH|MED|LOC|SCH)-\d{2}) \|/g), (match) => match[1]);
const uniqueDocumentedIds = new Set(documentedIds);
assert.equal(uniqueDocumentedIds.size, expectedIds.length, "test case inventory should not contain missing or duplicate IDs");
assert.equal(expectedIds.length, 155);

console.log("PASS test case inventory");

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function ids(prefix, numbers) {
  return numbers.map((number) => `${prefix}-${String(number).padStart(2, "0")}`);
}
