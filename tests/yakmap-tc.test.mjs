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
assert.match(app, /로그인 없이 둘러보기/);
assert.match(app, /startDemoSession/);
assert.match(server, /\/api\/fcm\/unregister/);

const token = await registerFcmToken({ userId: "u1", token: "fcm_test" }, config);
assert.equal(token.active, true);
const inactiveToken = await unregisterFcmToken({ userId: "u1" }, config);
assert.equal(inactiveToken.active, false);

const ocr = await extractTextFromImage("", config);
assert.match(ocr.text, /타이레놀/);
assert.ok(extractMedicineNames(ocr.text).length > 0);
assert.match(app, /인식 실패 또는 재촬영이 필요합니다/);

const general = await classifyMedicine("타이레놀", config);
assert.equal(general.category, "일반");
assert.equal(general.is_prescription, false);
const prescription = await classifyMedicine("아목시실린", config);
assert.equal(prescription.category, "전문");
assert.equal(prescription.is_prescription, true);
assert.match(app, /약국에서 구매 가능/);
assert.match(app, /처방이 필요한 약입니다/);
assert.match(app, /검색 결과 없음/);

const pharmacies = await listPharmacies({ region1: "서울특별시", region2: "중구" }, config);
assert.ok(pharmacies.items.some((item) => item.type === "pharmacy" && item.open));
assert.match(app, /위치 권한이 없어 샘플 위치를 사용합니다/);
assert.match(app, /store\.phone/);
assert.match(app, /map\.kakao\.com\/link\/search/);
assert.match(app, /영업 중인 약국이 부족합니다/);

assert.match(app, /dosage_times/);
assert.match(app, /remaining_pills/);
assert.match(app, /new Notification/);
assert.match(app, /isWithinSchedule/);
assert.match(sw, /showNotification/);
assert.match(schema, /create table if not exists public\.medicine_cache/);
assert.match(app, /state\.medicine_cache/);
assert.match(app, /source === "mfds"/);

console.log("PASS yak-map TC coverage");
