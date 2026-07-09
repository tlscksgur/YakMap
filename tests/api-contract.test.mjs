import assert from "node:assert/strict";
import {
  buildPublicDataUrl,
  classifyMedicine,
  extractMedicineNameCandidates,
  extractTextFromImage,
  getRuntimeConfig,
  listHospitals,
  listPharmacies,
  registerFcmToken
} from "../lib/api-providers.mjs";

const emptyConfig = getRuntimeConfig({});

assert.equal(emptyConfig.integrations.mfds.configured, false);
assert.equal(emptyConfig.integrations.openRouterOcr.configured, false);
assert.equal(emptyConfig.integrations.openRouterOcr.model, "openrouter/free");
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

const originalFetch = globalThis.fetch;
let openRouterRequest = null;
globalThis.fetch = async (url, options) => {
  openRouterRequest = { url, options, body: JSON.parse(options.body) };
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: "타이레놀정500mg\n아침 저녁 식후 30분"
          }
        }
      ]
    })
  };
};

const liveOcr = await extractTextFromImage(
  "data:image/png;base64,dGVzdA==",
  getRuntimeConfig({ OPENROUTER_API_KEY: "test-openrouter-key" })
);
globalThis.fetch = originalFetch;

assert.equal(liveOcr.source, "openrouter-ocr");
assert.match(liveOcr.text, /타이레놀정500mg/);
assert.equal(String(openRouterRequest.url), "https://openrouter.ai/api/v1/chat/completions");
assert.equal(openRouterRequest.body.model, "openrouter/free");
assert.equal(openRouterRequest.body.messages[0].content[1].type, "image_url");
assert.equal(openRouterRequest.body.messages[0].content[1].image_url.url, "data:image/png;base64,dGVzdA==");
assert.match(openRouterRequest.options.headers.authorization, /^Bearer test-openrouter-key$/);

let ocrAttempt = 0;
globalThis.fetch = async (url, options) => {
  ocrAttempt += 1;
  const body = JSON.parse(options.body);
  if (ocrAttempt === 1) {
    return {
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: { message: "model not found" } })
    };
  }
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: "록소프로펜정 60mg" } }] })
  };
};
const fallbackOcr = await extractTextFromImage(
  "data:image/png;base64,dGVzdA==",
  getRuntimeConfig({ OPENROUTER_API_KEY: "test-openrouter-key", OPENROUTER_OCR_MODEL: "baidu/qianfan-ocr-fast:free" })
);
globalThis.fetch = originalFetch;
assert.equal(ocrAttempt, 2);
assert.equal(fallbackOcr.model, "openrouter/free");
assert.match(fallbackOcr.warning, /이전 OCR 모델 실패/);
assert.deepEqual(extractMedicineNameCandidates("록소프로펜정 60mg\n아침 식후"), ["록소프로펜정 60mg"]);

const pharmacies = await listPharmacies({}, emptyConfig);
assert.equal(pharmacies.source, "sample");
assert.ok(pharmacies.items.some((item) => item.type === "pharmacy"));

const hospitals = await listHospitals({}, emptyConfig);
assert.equal(hospitals.source, "sample");
assert.ok(hospitals.items.some((item) => item.type === "hospital"));

let publicDataRequestUrl = null;
globalThis.fetch = async (url) => {
  publicDataRequestUrl = new URL(String(url));
  return {
    ok: true,
    text: async () => "<response><body><items></items></body></response>"
  };
};
await listPharmacies({}, getRuntimeConfig({ NMC_PHARMACY_SERVICE_KEY: "test-service-key" }));
globalThis.fetch = originalFetch;
assert.equal(publicDataRequestUrl.searchParams.has("Q0"), false);
assert.equal(publicDataRequestUrl.searchParams.has("Q1"), false);

globalThis.fetch = async () => ({
  ok: true,
  text: async () => `
    <response><body><items>
      <item>
        <hpid>A1</hpid><dutyName>24시간 테스트약국</dutyName><dutyAddr>서울 중구</dutyAddr><dutyTel1>02-1111-1111</dutyTel1>
        <wgs84Lat>37.5665</wgs84Lat><wgs84Lon>126.9780</wgs84Lon>
        <dutyTime${new Date().getDay() || 7}s>0000</dutyTime${new Date().getDay() || 7}s>
        <dutyTime${new Date().getDay() || 7}c>2359</dutyTime${new Date().getDay() || 7}c>
      </item>
      <item>
        <hpid>A2</hpid><dutyName>마감 테스트약국</dutyName><dutyAddr>서울 중구</dutyAddr><dutyTel1>02-2222-2222</dutyTel1>
        <wgs84Lat>37.5666</wgs84Lat><wgs84Lon>126.9781</wgs84Lon>
        <dutyTime${new Date().getDay() || 7}s>0001</dutyTime${new Date().getDay() || 7}s>
        <dutyTime${new Date().getDay() || 7}c>0002</dutyTime${new Date().getDay() || 7}c>
      </item>
    </items></body></response>`
});
const livePharmacies = await listPharmacies(
  { region1: "서울특별시", region2: "중구" },
  getRuntimeConfig({ NMC_PHARMACY_SERVICE_KEY: "test-service-key" })
);
globalThis.fetch = originalFetch;
assert.equal(livePharmacies.source, "nmc");
assert.equal(livePharmacies.items.find((item) => item.name === "24시간 테스트약국").open, true);
assert.equal(livePharmacies.items.find((item) => item.name === "마감 테스트약국").open, false);
assert.equal(livePharmacies.items.find((item) => item.name === "24시간 테스트약국").statusLabel, "영업 중");
assert.equal(livePharmacies.items.find((item) => item.name === "마감 테스트약국").statusLabel, "영업 종료");
assert.equal(livePharmacies.items.find((item) => item.name === "24시간 테스트약국").distance, null);

let businessHoursRequestUrl = null;
globalThis.fetch = async (url) => {
  const parsed = new URL(String(url));
  if (parsed.hostname === "business-hours.test") {
    businessHoursRequestUrl = parsed;
    return {
      ok: true,
      json: async () => ({
        hours: "09:00-18:30",
        open: true,
        statusLabel: "영업 중"
      })
    };
  }
  return {
    ok: true,
    text: async () => `
      <response><body><items>
        <item>
          <hpid>A3</hpid><dutyName>영업시간보강약국</dutyName><dutyAddr>서울 중구 테스트로 1</dutyAddr><dutyTel1>02-3333-3333</dutyTel1>
          <wgs84Lat>37.5667</wgs84Lat><wgs84Lon>126.9782</wgs84Lon>
        </item>
      </items></body></response>`
  };
};
const enrichedHoursPharmacies = await listPharmacies(
  { region1: "서울특별시", region2: "중구" },
  getRuntimeConfig({
    NMC_PHARMACY_SERVICE_KEY: "test-service-key",
    BUSINESS_HOURS_API: "https://business-hours.test/lookup"
  })
);
globalThis.fetch = originalFetch;
const enrichedStore = enrichedHoursPharmacies.items.find((item) => item.name === "영업시간보강약국");
assert.equal(businessHoursRequestUrl.searchParams.get("name"), "영업시간보강약국");
assert.equal(businessHoursRequestUrl.searchParams.get("address"), "서울 중구 테스트로 1");
assert.equal(enrichedStore.hours, "09:00-18:30");
assert.equal(enrichedStore.open, true);
assert.equal(enrichedStore.statusLabel, "영업 중");

let googlePlacesRequestUrl = null;
globalThis.fetch = async (url) => {
  const parsed = new URL(String(url));
  if (parsed.hostname === "maps.googleapis.com") {
    googlePlacesRequestUrl = parsed;
    return {
      ok: true,
      json: async () => ({
        results: [
          {
            name: "구글영업시간약국",
            opening_hours: { open_now: false }
          }
        ],
        status: "OK"
      })
    };
  }
  return {
    ok: true,
    text: async () => `
      <response><body><items>
        <item>
          <hpid>A4</hpid><dutyName>구글영업시간약국</dutyName><dutyAddr>서울 중구 테스트로 2</dutyAddr><dutyTel1>02-4444-4444</dutyTel1>
          <wgs84Lat>37.5668</wgs84Lat><wgs84Lon>126.9783</wgs84Lon>
        </item>
      </items></body></response>`
  };
};
const googleEnrichedPharmacies = await listPharmacies(
  { region1: "서울특별시", region2: "중구" },
  getRuntimeConfig({
    NMC_PHARMACY_SERVICE_KEY: "test-service-key",
    BUSINESS_HOURS_API: "google-places-test-key"
  })
);
globalThis.fetch = originalFetch;
const googleEnrichedStore = googleEnrichedPharmacies.items.find((item) => item.name === "구글영업시간약국");
assert.equal(googlePlacesRequestUrl.pathname, "/maps/api/place/textsearch/json");
assert.equal(googlePlacesRequestUrl.searchParams.get("key"), "google-places-test-key");
assert.match(googlePlacesRequestUrl.searchParams.get("query"), /구글영업시간약국/);
assert.equal(googleEnrichedStore.hours, "영업시간 확인됨");
assert.equal(googleEnrichedStore.open, false);
assert.equal(googleEnrichedStore.statusLabel, "영업 종료");

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
