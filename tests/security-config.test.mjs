import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const envExample = await readFile(".env.example", "utf8");
const gitignore = await readFile(".gitignore", "utf8");

const secretPatterns = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /sb_publishable_[0-9A-Za-z_-]+/,
  /https:\/\/[a-z0-9]+\.supabase\.co/,
  /[A-Za-z0-9+/]{40,}={0,2}/
];

for (const pattern of secretPatterns) {
  assert.equal(pattern.test(envExample), false, `.env.example contains a real-looking secret: ${pattern}`);
}

assert.match(envExample, /SUPABASE_URL=/);
assert.match(envExample, /SMTP_HOST=/);
assert.match(envExample, /SMTP_USER=/);
assert.match(envExample, /SMTP_PASS=/);
assert.match(envExample, /SMTP_FROM=/);
assert.match(envExample, /OPENROUTER_API_KEY=/);
assert.match(envExample, /OPENROUTER_OCR_MODEL=baidu\/qianfan-ocr-fast:free/);
assert.match(envExample, /MFDS_EYAK_SERVICE_KEY=/);
assert.match(envExample, /NMC_PHARMACY_SERVICE_KEY=/);
assert.match(gitignore, /^\.env$/m);
assert.match(gitignore, /^\.env\..*$/m);

console.log("PASS security config");
