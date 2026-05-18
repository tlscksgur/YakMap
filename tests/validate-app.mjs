import { readFile } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "sw.js",
  "schema.sql",
  "README.md",
  "server.js",
  "lib/api-providers.mjs"
];

const contents = Object.fromEntries(
  await Promise.all(requiredFiles.map(async (file) => [file, await readFile(file, "utf8")]))
);

const assertions = [
  ["index links stylesheet", contents["index.html"].includes('href="./styles.css"')],
  ["index loads app module", contents["index.html"].includes('src="./app.js"')],
  ["index initializes tabbar hidden", contents["index.html"].includes('id="appTabbar"') && contents["index.html"].includes("hidden")],
  ["app has auth token refresh", contents["app.js"].includes("refreshFcmToken")],
  ["app toggles tabbar hidden state", contents["app.js"].includes("appTabbar.hidden = !user")],
  ["app calls runtime config API", contents["app.js"].includes("/api/config")],
  ["app calls medicine API", contents["app.js"].includes("/api/medicine/search")],
  ["app calls OCR API", contents["app.js"].includes("/api/ocr")],
  ["app calls pharmacy API", contents["app.js"].includes("/api/pharmacies")],
  ["app calls hospital API", contents["app.js"].includes("/api/hospitals")],
  ["app has OCR file input", contents["app.js"].includes('type="file"')],
  ["app has API status display", contents["app.js"].includes("renderApiStatus")],
  ["app has Kakao SDK hook", contents["app.js"].includes("loadKakaoMapSdk")],
  ["app has OCR matching", contents["app.js"].includes("extractMedicines")],
  ["app has schedule table shape", contents["app.js"].includes("dosage_times")],
  ["app has map guidance", contents["app.js"].includes("map.kakao.com")],
  ["CSS defines coral primary", contents["styles.css"].includes("--primary: #ff7b68")],
  ["SQL defines users", contents["schema.sql"].includes("create table if not exists public.users")],
  ["SQL defines medication schedules", contents["schema.sql"].includes("create table if not exists public.medication_schedules")],
  ["SQL defines medicine cache", contents["schema.sql"].includes("create table if not exists public.medicine_cache")],
  ["SQL defines safe store list", contents["schema.sql"].includes("create table if not exists public.safe_store_list")],
  ["server exposes config route", contents["server.js"].includes('url.pathname === "/api/config"')],
  ["providers include Google Vision", contents["lib/api-providers.mjs"].includes("GOOGLE_VISION_URL")]
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
