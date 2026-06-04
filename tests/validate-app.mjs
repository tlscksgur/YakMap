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
  ["SQL excludes safe store list", !contents["schema.sql"].includes("safe_store_list")],
  ["SQL enables users RLS", contents["schema.sql"].includes("alter table public.users enable row level security")],
  ["SQL allows users own insert", contents["schema.sql"].includes('create policy "users_insert_own"')],
  ["server exposes config route", contents["server.js"].includes('url.pathname === "/api/config"')],
  ["providers include OpenRouter OCR", contents["lib/api-providers.mjs"].includes("OPENROUTER_CHAT_URL")],
  ["app excludes Kakao login mock", !contents["app.js"].includes("kakaoMockButton")],
  ["app excludes demo login", !contents["app.js"].includes("startDemoSession")],
  ["app excludes install app action", !contents["app.js"].includes("installAppButton")],
  ["app requests signup verification email", contents["app.js"].includes("/api/auth/signup-code")],
  ["app preserves pending signup credentials", contents["app.js"].includes("pendingSignup?.password")],
  ["app submits signup verification code", contents["app.js"].includes("verificationCode: normalizeVerificationCode(verificationCode)")],
  ["server normalizes pasted verification codes", contents["server.js"].includes("normalizeVerificationCode")],
  ["server sends signup verification email", contents["server.js"].includes('url.pathname === "/api/auth/signup-code"')],
  ["app surfaces Kakao map errors", contents["app.js"].includes("renderMapStatus")]
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
