import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  classifyMedicine,
  extractMedicineNames,
  extractTextFromImage,
  getRuntimeConfig,
  listPharmacies,
  registerFcmToken,
  unregisterFcmToken
} from "../lib/api-providers.mjs";

const config = getRuntimeConfig({ USE_LIVE_APIS: "false" });
const app = await readFile("app.js", "utf8");
const server = await readFile("server.js", "utf8");
const sw = await readFile("sw.js", "utf8");
const schema = await readFile("schema.sql", "utf8");

assert.match(app, /이미 가입된 이메일입니다/);
assert.match(app, /이메일 또는 비밀번호가 올바르지 않습니다/);
assert.match(app, /localStorage\.setItem/);
assert.match(app, /로그아웃했고 FCM 토큰을 비활성화했습니다/);
assert.match(app, /닉네임을 저장했습니다/);
assert.match(app, /이메일 변경은 추가 인증이 필요해 현재 제한됩니다/);
assert.match(app, /동시 로그인 허용/);
assert.match(app, /is_active = false/);
assert.match(app, /deleted_at/);
assert.match(app, /탈퇴 처리된 계정은 로그인할 수 없습니다/);
assert.match(app, /만료된 세션입니다\. 다시 로그인하세요/);
assert.match(app, /오프라인 상태입니다\. 저장 작업은 로컬 대기열에 보관됩니다/);
assert.match(app, /\/api\/auth\/password-reset-code/);
assert.match(app, /가입 정보가 없는 이메일입니다/);
assert.match(app, /비밀번호를 변경했습니다/);
assert.match(app, /기존과 동일한 비밀번호는 사용할 수 없습니다/);
assert.match(app, /잘못된 토큰입니다\. 다시 로그인하세요/);
assert.match(app, /Supabase 이메일 미확인 계정입니다\. 방금 보낸 인증코드를 입력하면 앱 계정을 복구합니다/);
assert.match(app, /makeLocalAuthUser/);
assert.match(app, /isAlreadyRegisteredAuthError/);
assert.doesNotMatch(app, /로그인 없이 둘러보기/);
assert.doesNotMatch(app, /카카오로 계속하기/);
assert.match(app, /인증코드 이메일 발송/);
assert.match(app, /인증하고 회원가입/);
assert.match(app, /다른 이메일로 가입/);
assert.match(app, /비밀번호 확인이 일치하지 않습니다/);
assert.match(app, /필수 약관에 동의해야 회원가입할 수 있습니다/);
assert.match(app, /\/api\/auth\/signup-code/);
assert.match(app, /pendingSignup\?\.password/);
assert.match(app, /normalizeVerificationCode/);
assert.match(app, /verificationCode: normalizeVerificationCode\(verificationCode\)/);
assert.match(server, /SMTP_HOST/);
assert.match(server, /sendSignupVerificationCode/);
assert.match(server, /normalizeVerificationCode/);
assert.match(server, /canFallbackAfterVerifiedSignup/);
assert.match(server, /Supabase 인증 요청 제한으로 앱 로컬 계정으로 가입을 완료했습니다/);
assert.match(app, /renderMapStatus/);
assert.match(server, /\/api\/fcm\/unregister/);
assert.match(app, /fcm_tokens/);
assert.match(schema, /user_fcm_tokens/);

const token = await registerFcmToken({ userId: "u1", token: "fcm_test" }, config);
assert.equal(token.active, true);
const inactiveToken = await unregisterFcmToken({ userId: "u1" }, config);
assert.equal(inactiveToken.active, false);

const ocr = await extractTextFromImage("", config);
assert.match(ocr.text, /타이레놀/);
assert.ok(extractMedicineNames(ocr.text).length > 0);
assert.match(app, /인식 실패 또는 재촬영이 필요합니다/);
assert.match(app, /카메라 권한이 필요합니다/);

const general = await classifyMedicine("타이레놀", config);
assert.equal(general.category, "일반");
assert.equal(general.is_prescription, false);
const prescription = await classifyMedicine("아목시실린", config);
assert.equal(prescription.category, "전문");
assert.equal(prescription.is_prescription, true);
assert.match(app, /약국에서 구매 가능/);
assert.match(app, /처방이 필요한 약입니다/);
assert.match(app, /유사한 약 후보/);
assert.match(app, /data-select-medicine/);
assert.match(app, /검색 결과 없음/);

const pharmacies = await listPharmacies({ region1: "서울특별시", region2: "중구" }, config);
assert.ok(pharmacies.items.some((item) => item.type === "pharmacy" && item.open));
assert.match(app, /위치 권한이 없어 샘플 위치를 사용합니다/);
assert.match(app, /store\.phone/);
assert.match(app, /tel:\$\{phone\}/);
assert.match(app, /map\.kakao\.com\/link\/search/);
assert.match(app, /sortStoresByDistance/);
assert.match(app, /regionSearchInput/);
assert.match(app, /storeSearchInput/);
assert.match(app, /검색 조건에 맞는 판매처가 없습니다/);
assert.match(app, /공휴일에는 상비약 판매 편의점을 우선 안내합니다/);
assert.match(app, /prioritizeHolidayConvenienceStores/);
assert.match(app, /영업 중인 약국이 부족합니다/);

assert.match(app, /dosage_times/);
assert.match(app, /remaining_pills/);
assert.match(app, /종료일은 시작일보다 빠를 수 없습니다/);
assert.match(app, /data-edit-schedule/);
assert.match(app, /스케줄 수정 완료/);
assert.match(app, /남은 약이 0개라 복용 체크를 할 수 없습니다/);
assert.match(app, /이미 오늘 복용 기록이 있습니다/);
assert.match(app, /미복용 기록/);
assert.match(app, /dose_records/);
assert.match(app, /renderDoseHistory/);
assert.match(app, /복약 성공률/);
assert.match(app, /new Notification/);
assert.match(app, /notification_failures/);
assert.match(app, /알림 발송 실패 로그/);
assert.match(app, /isWithinSchedule/);
assert.match(sw, /showNotification/);
assert.match(schema, /create table if not exists public\.medicine_cache/);
assert.doesNotMatch(schema, /safe_store_list/);
assert.match(app, /state\.medicine_cache/);
assert.match(app, /persistMedicineCache/);
assert.match(app, /source === "mfds"/);
assert.match(app, /pending_mutations/);
assert.match(app, /재시도 대기열/);

console.log("PASS yak-map TC coverage");
