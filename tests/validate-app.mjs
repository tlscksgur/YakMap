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
  ["app explains Kakao map local service setup", contents["app.js"].includes("카카오맵/로컬 서비스 활성화")],
  ["app hides fallback map pins when live Kakao map is configured", contents["app.js"].includes("shouldRenderFallbackPins")],
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
  ["app validates signup password confirmation", contents["app.js"].includes("비밀번호 확인이 일치하지 않습니다.")],
  ["app requires signup terms agreement", contents["app.js"].includes("필수 약관에 동의해야 회원가입할 수 있습니다.")],
  ["app submits signup verification code", contents["app.js"].includes("verificationCode: normalizeVerificationCode(verificationCode)")],
  ["app blocks invalid schedule date range", contents["app.js"].includes("종료일은 시작일보다 빠를 수 없습니다.")],
  ["app blocks taking zero remaining pills", contents["app.js"].includes("남은 약이 0개라 복용 체크를 할 수 없습니다.")],
  ["app supports store phone calls", contents["app.js"].includes("tel:${phone}")],
  ["app supports nickname profile edits", contents["app.js"].includes("닉네임을 저장했습니다.")],
  ["app blocks direct email profile edits", contents["app.js"].includes("이메일 변경은 추가 인증이 필요해 현재 제한됩니다.")],
  ["app handles expired sessions", contents["app.js"].includes("만료된 세션입니다. 다시 로그인하세요.")],
  ["app shows offline network state", contents["app.js"].includes("오프라인 상태입니다. 저장 작업은 로컬 대기열에 보관됩니다.")],
  ["app supports password reset email requests", contents["app.js"].includes("/api/auth/password-reset-code")],
  ["app handles unknown password reset email", contents["app.js"].includes("가입 정보가 없는 이메일입니다.")],
  ["app supports password changes", contents["app.js"].includes("비밀번호를 변경했습니다.")],
  ["app blocks reusing the same password", contents["app.js"].includes("기존과 동일한 비밀번호는 사용할 수 없습니다.")],
  ["app rejects invalid auth tokens", contents["app.js"].includes("잘못된 토큰입니다. 다시 로그인하세요.")],
  ["app recovers Supabase unconfirmed email accounts", contents["app.js"].includes("Supabase 이메일 미확인 계정입니다. 방금 보낸 인증코드를 입력하면 앱 계정을 복구합니다.")],
  ["app creates local auth user for Supabase already registered recovery", contents["app.js"].includes("makeLocalAuthUser") && contents["app.js"].includes("isAlreadyRegisteredAuthError")],
  ["app shows similar medicine candidates", contents["app.js"].includes("유사한 약 후보")],
  ["app supports selecting one medicine from candidates", contents["app.js"].includes("data-select-medicine")],
  ["app sorts stores by distance", contents["app.js"].includes("sortStoresByDistance")],
  ["app supports region map search", contents["app.js"].includes("regionSearchInput")],
  ["app supports store name map search", contents["app.js"].includes("storeSearchInput")],
  ["app shows no map search results", contents["app.js"].includes("검색 조건에 맞는 판매처가 없습니다.")],
  ["app prioritizes convenience stores on holidays", contents["app.js"].includes("공휴일에는 상비약 판매 편의점을 우선 안내합니다.")],
  ["app supports editing schedule times", contents["app.js"].includes("data-edit-schedule")],
  ["app supports editing schedule date range", contents["app.js"].includes("스케줄 수정 완료")],
  ["app handles camera permission denial", contents["app.js"].includes("카메라 권한이 필요합니다.")],
  ["app persists newly fetched medicines", contents["app.js"].includes("persistMedicineCache")],
  ["app queues offline schedule saves", contents["app.js"].includes("pending_mutations")],
  ["app stores FCM tokens per device", contents["app.js"].includes("fcm_tokens") && contents["schema.sql"].includes("user_fcm_tokens")],
  ["app documents concurrent login as allowed", contents["app.js"].includes("동시 로그인 허용")],
  ["app deactivates accounts instead of deleting", contents["app.js"].includes("is_active = false") && contents["app.js"].includes("deleted_at")],
  ["app blocks deactivated account login", contents["app.js"].includes("탈퇴 처리된 계정은 로그인할 수 없습니다.")],
  ["app confirms schedule deletion", contents["app.js"].includes("스케줄을 삭제했습니다.")],
  ["app prevents duplicate dose checks", contents["app.js"].includes("이미 오늘 복용 기록이 있습니다.")],
  ["app supports missed dose records", contents["app.js"].includes("미복용 기록")],
  ["app stores dose records by date", contents["app.js"].includes("dose_records")],
  ["app renders dose history", contents["app.js"].includes("renderDoseHistory")],
  ["app renders adherence rate", contents["app.js"].includes("복약 성공률")],
  ["app logs notification failures", contents["app.js"].includes("notification_failures") && contents["app.js"].includes("알림 발송 실패 로그")],
  ["server normalizes pasted verification codes", contents["server.js"].includes("normalizeVerificationCode")],
  ["server sends signup verification email", contents["server.js"].includes('url.pathname === "/api/auth/signup-code"')],
  ["server sends password reset email", contents["server.js"].includes('url.pathname === "/api/auth/password-reset-code"')],
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
