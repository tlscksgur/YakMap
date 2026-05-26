import assert from "node:assert/strict";
import {
  buildPublicDataUrl,
  classifyMedicine,
  extractTextFromImage,
  getRuntimeConfig,
  listHospitals,
  listPharmacies,
  registerFcmToken
} from "../lib/api-providers.mjs";

const emptyConfig = getRuntimeConfig({});

assert.equal(emptyConfig.integrations.mfds.configured, false);
assert.equal(emptyConfig.integrations.googleVision.configured, false);
assert.equal(emptyConfig.integrations.kakaoMap.configured, false);

const medicine = await classifyMedicine("타이레놀", emptyConfig);
assert.equal(medicine.source, "sample");
assert.equal(medicine.category, "일반");
assert.match(medicine.item_name, /타이레놀/);

const prescription = await classifyMedicine("아목시실린", emptyConfig);
assert.equal(prescription.category, "전문");
assert.equal(prescription.is_prescription, true);

const ocr = await extractTextFromImage("", emptyConfig);
assert.equal(ocr.source, "sample");
assert.match(ocr.text, /타이레놀/);

const pharmacies = await listPharmacies({ region1: "서울특별시", region2: "중구" }, emptyConfig);
assert.equal(pharmacies.source, "sample");
assert.ok(pharmacies.items.some((item) => item.type === "pharmacy"));

const hospitals = await listHospitals({ region1: "서울특별시", region2: "중구" }, emptyConfig);
assert.equal(hospitals.source, "sample");
assert.ok(hospitals.items.some((item) => item.type === "hospital"));

const tokenResult = await registerFcmToken({ userId: "u1", token: "fcm_test" }, emptyConfig);
assert.equal(tokenResult.source, "local");
assert.equal(tokenResult.active, true);

const url = buildPublicDataUrl("https://example.test/path", "key", {
  Q0: "서울특별시",
  Q1: "중구",
  empty: ""
});
assert.equal(url.toString(), "https://example.test/path?ServiceKey=key&Q0=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C&Q1=%EC%A4%91%EA%B5%AC");

console.log("PASS api contract");
