import { readFile } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "sw.js",
  "schema.sql",
  "README.md"
];

const contents = Object.fromEntries(
  await Promise.all(requiredFiles.map(async (file) => [file, await readFile(file, "utf8")]))
);

const assertions = [
  ["index links stylesheet", contents["index.html"].includes('href="./styles.css"')],
  ["index loads app module", contents["index.html"].includes('src="./app.js"')],
  ["app has auth token refresh", contents["app.js"].includes("refreshFcmToken")],
  ["app has OCR matching", contents["app.js"].includes("extractMedicines")],
  ["app has schedule table shape", contents["app.js"].includes("dosage_times")],
  ["app has map guidance", contents["app.js"].includes("map.kakao.com")],
  ["CSS defines coral primary", contents["styles.css"].includes("--primary: #ff7b68")],
  ["SQL defines users", contents["schema.sql"].includes("create table if not exists public.users")],
  ["SQL defines medication schedules", contents["schema.sql"].includes("create table if not exists public.medication_schedules")],
  ["SQL defines medicine cache", contents["schema.sql"].includes("create table if not exists public.medicine_cache")],
  ["SQL defines safe store list", contents["schema.sql"].includes("create table if not exists public.safe_store_list")]
];

const failures = assertions.filter(([, passed]) => !passed);

if (failures.length > 0) {
  for (const [name] of failures) {
    console.error(`FAIL ${name}`);
  }
  process.exit(1);
}

for (const [name] of assertions) {
  console.log(`PASS ${name}`);
}
