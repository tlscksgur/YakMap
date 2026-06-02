import { sampleMedicines, sampleOcrText, sampleStores } from "./sample-data.mjs";

const MFDS_EYAK_URL = "http://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList";
const PHARMACY_URL = "http://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire";
const HOSPITAL_URL = "http://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire";
const GOOGLE_VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

export function getRuntimeConfig(env = process.env) {
  const config = {
    supabaseUrl: env.SUPABASE_URL || "",
    supabaseAnonKey: env.SUPABASE_ANON_KEY || "",
    firebase: {
      apiKey: env.FIREBASE_API_KEY || "",
      projectId: env.FIREBASE_PROJECT_ID || "",
      messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || "",
      appId: env.FIREBASE_APP_ID || "",
      vapidKey: env.FIREBASE_VAPID_KEY || ""
    },
    kakaoMapKey: env.KAKAO_MAP_JAVASCRIPT_KEY || "",
    googleVisionKey: env.GOOGLE_VISION_API_KEY || "",
    mfdsServiceKey: env.MFDS_EYAK_SERVICE_KEY || "",
    nmcServiceKey: env.NMC_PHARMACY_SERVICE_KEY || "",
    useLiveApis: String(env.USE_LIVE_APIS || "true") !== "false"
  };

  return {
    ...config,
    integrations: {
      supabase: { configured: Boolean(config.supabaseUrl && config.supabaseAnonKey) },
      firebase: {
        configured: Boolean(
          config.firebase.apiKey
            && config.firebase.projectId
            && config.firebase.messagingSenderId
            && config.firebase.appId
            && config.firebase.vapidKey
        )
      },
      kakaoMap: { configured: Boolean(config.kakaoMapKey) },
      googleVision: { configured: Boolean(config.googleVisionKey) },
      mfds: { configured: Boolean(config.mfdsServiceKey) },
      nmc: { configured: Boolean(config.nmcServiceKey) }
    }
  };
}

export function publicConfig(config) {
  return {
    integrations: config.integrations,
    firebase: config.integrations.firebase.configured ? config.firebase : null,
    kakaoMapKey: config.integrations.kakaoMap.configured ? config.kakaoMapKey : "",
    liveApisEnabled: config.useLiveApis
  };
}

export function buildPublicDataUrl(baseUrl, serviceKey, params = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set("ServiceKey", serviceKey);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

export async function classifyMedicine(query, config = getRuntimeConfig()) {
  const sample = findSampleMedicine(query);

  if (!config.useLiveApis || !config.integrations.mfds.configured) {
    return sample ? withSource(sample, "sample") : withSource(unknownMedicine(query), "sample");
  }

  try {
    const url = buildPublicDataUrl(MFDS_EYAK_URL, config.mfdsServiceKey, {
      type: "json",
      pageNo: 1,
      numOfRows: 5,
      itemName: query
    });
    const data = await fetchJson(url);
    const items = normalizePublicDataItems(data?.body?.items || data?.response?.body?.items);
    const first = items[0];
    if (!first) return sample ? withSource(sample, "sample") : withSource(unknownMedicine(query), "sample");

    return {
      item_name: first.itemName || sample?.item_name || query,
      category: "일반",
      is_prescription: false,
      efficacy: cleanHtml(first.efcyQesitm) || sample?.efficacy || "식약처 e약은요에서 조회된 일반의약품입니다.",
      side_effects: cleanHtml(first.seQesitm || first.atpnQesitm || first.atpnWarnQesitm) || sample?.side_effects || "주의사항은 제품 설명서와 전문가 안내를 확인하세요.",
      usage: cleanHtml(first.useMethodQesitm) || sample?.usage || "",
      source: "mfds"
    };
  } catch (error) {
    return {
      ...withSource(sample || unknownMedicine(query), "sample"),
      warning: `실 API 호출 실패: ${error.message}`
    };
  }
}

export async function extractTextFromImage(imageBase64, config = getRuntimeConfig()) {
  if (!config.useLiveApis || !config.integrations.googleVision.configured || !imageBase64) {
    return { text: sampleOcrText, source: "sample" };
  }

  const content = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  try {
    const response = await fetch(`${GOOGLE_VISION_URL}?key=${encodeURIComponent(config.googleVisionKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            imageContext: { languageHints: ["ko", "en"] }
          }
        ]
      })
    });
    if (!response.ok) throw new Error(`Google Vision HTTP ${response.status}`);
    const data = await response.json();
    const text = data.responses?.[0]?.fullTextAnnotation?.text || data.responses?.[0]?.textAnnotations?.[0]?.description || "";
    return { text: text || sampleOcrText, source: text ? "google-vision" : "sample" };
  } catch (error) {
    return { text: sampleOcrText, source: "sample", warning: `OCR API 호출 실패: ${error.message}` };
  }
}

export async function listPharmacies(params = {}, config = getRuntimeConfig()) {
  if (!config.useLiveApis || !config.integrations.nmc.configured) {
    return { source: "sample", items: sampleStores.filter((store) => store.type === "pharmacy" || store.type === "store") };
  }

  try {
    const url = buildPublicDataUrl(PHARMACY_URL, config.nmcServiceKey, {
      Q0: params.region1 || "서울특별시",
      Q1: params.region2 || "중구",
      QT: dayCode(new Date()),
      ORD: "NAME",
      pageNo: 1,
      numOfRows: params.limit || 20
    });
    const xml = await fetchText(url);
    const items = parseXmlItems(xml).map((item, index) => normalizeStore(item, "pharmacy", index));
    return { source: "nmc", items: items.length ? items : sampleStores.filter((store) => store.type === "pharmacy") };
  } catch (error) {
    return {
      source: "sample",
      items: sampleStores.filter((store) => store.type === "pharmacy" || store.type === "store"),
      warning: `약국 API 호출 실패: ${error.message}`
    };
  }
}

export async function listHospitals(params = {}, config = getRuntimeConfig()) {
  if (!config.useLiveApis || !config.integrations.nmc.configured) {
    return { source: "sample", items: sampleStores.filter((store) => store.type === "hospital") };
  }

  try {
    const url = buildPublicDataUrl(HOSPITAL_URL, config.nmcServiceKey, {
      Q0: params.region1 || "서울특별시",
      Q1: params.region2 || "중구",
      QZ: params.kind || "C",
      QT: dayCode(new Date()),
      ORD: "NAME",
      pageNo: 1,
      numOfRows: params.limit || 20
    });
    const xml = await fetchText(url);
    const items = parseXmlItems(xml).map((item, index) => normalizeStore(item, "hospital", index));
    return { source: "nmc", items: items.length ? items : sampleStores.filter((store) => store.type === "hospital") };
  } catch (error) {
    return {
      source: "sample",
      items: sampleStores.filter((store) => store.type === "hospital"),
      warning: `병원 API 호출 실패: ${error.message}`
    };
  }
}

export async function registerFcmToken({ userId, token }, config = getRuntimeConfig()) {
  if (!token) return { active: false, source: "local", message: "FCM token is empty." };
  if (!config.integrations.supabase.configured || !userId) {
    return { active: true, source: "local", token };
  }

  try {
    const response = await supabaseFetch(config, `/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ fcm_token: token })
    });
    if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
    return { active: true, source: "supabase", token };
  } catch (error) {
    return { active: true, source: "local", token, warning: `Supabase 토큰 저장 실패: ${error.message}` };
  }
}

export async function unregisterFcmToken({ userId }, config = getRuntimeConfig()) {
  if (!config.integrations.supabase.configured || !userId) {
    return { active: false, source: "local" };
  }

  try {
    const response = await supabaseFetch(config, `/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ fcm_token: null })
    });
    if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
    return { active: false, source: "supabase" };
  } catch (error) {
    return { active: false, source: "local", warning: `Supabase 토큰 비활성화 실패: ${error.message}` };
  }
}

export async function authWithSupabase(mode, { email, password }, config = getRuntimeConfig()) {
  if (!config.integrations.supabase.configured) {
    return {
      source: "local",
      user: {
        id: `local-${Buffer.from(email).toString("base64url")}`,
        email,
        created_at: new Date().toISOString()
      },
      session: null
    };
  }

  const path = mode === "signup" ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password";
  const response = await supabaseFetch(config, path, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.msg || data.error_description || `Supabase HTTP ${response.status}`);
  const user = data.user || data;
  if (user?.id && user?.email) {
    await upsertSupabaseUserProfile(config, user);
  }
  return {
    source: "supabase",
    user,
    session: data.session || data
  };
}

async function upsertSupabaseUserProfile(config, user) {
  const response = await supabaseFetch(config, "/rest/v1/users?on_conflict=id", {
    method: "POST",
    headers: {
      prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify({
      id: user.id,
      email: user.email
    })
  });
  if (!response.ok) throw new Error(`Supabase profile HTTP ${response.status}`);
}

export function extractMedicineNames(text) {
  const normalizedText = normalize(text);
  return sampleMedicines.filter((medicine) => {
    return normalizedText.includes(normalize(medicine.item_name))
      || (medicine.aliases || []).some((alias) => normalizedText.includes(normalize(alias)));
  });
}

function findSampleMedicine(query) {
  const normalized = normalize(query);
  return sampleMedicines.find((medicine) => {
    return normalize(medicine.item_name).includes(normalized)
      || (medicine.aliases || []).some((alias) => normalize(alias).includes(normalized) || normalized.includes(normalize(alias)));
  });
}

function unknownMedicine(query) {
  return {
    item_name: query || "이름 미상 의약품",
    category: "확인 필요",
    is_prescription: false,
    efficacy: "현재 캐시와 외부 API에서 확인하지 못했습니다.",
    side_effects: "약사 또는 의사에게 확인한 뒤 복용하세요.",
    usage: "",
    not_found: true
  };
}

function withSource(medicine, source) {
  return { ...medicine, source };
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function normalizePublicDataItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (Array.isArray(items.item)) return items.item;
  if (items.item) return [items.item];
  return [];
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseXmlItems(xml) {
  const items = [];
  const matches = String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const match of matches) {
    const itemXml = match[1];
    const item = {};
    for (const field of itemXml.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
      item[field[1]] = decodeXml(field[2].trim());
    }
    items.push(item);
  }
  return items;
}

function normalizeStore(item, type, index) {
  const lat = Number(item.wgs84Lat || item.latitude || 37.5665);
  const lng = Number(item.wgs84Lon || item.longitude || 126.978);
  return {
    id: `${type}-${item.hpid || index}`,
    type,
    name: item.dutyName || (type === "hospital" ? "이름 미상 병원" : "이름 미상 약국"),
    address: item.dutyAddr || "",
    phone: item.dutyTel1 || item.dutyTel3 || "",
    distance: 0,
    open: true,
    hours: summarizeHours(item),
    lat,
    lng,
    x: Math.max(12, Math.min(88, 50 + (lng - 126.978) * 140)),
    y: Math.max(18, Math.min(84, 52 - (lat - 37.5665) * 160))
  };
}

function summarizeHours(item) {
  const today = dayCode(new Date());
  const open = item[`dutyTime${today}s`];
  const close = item[`dutyTime${today}c`];
  if (open && close) return `${formatHm(open)}-${formatHm(close)}`;
  return "운영시간 확인 필요";
}

function dayCode(date) {
  const day = date.getDay();
  return day === 0 ? "7" : String(day);
}

function formatHm(value) {
  const padded = String(value).padStart(4, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
}

function cleanHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function supabaseFetch(config, path, options = {}) {
  return fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseAnonKey,
      authorization: `Bearer ${config.supabaseAnonKey}`,
      "content-type": "application/json",
      prefer: "return=minimal",
      ...(options.headers || {})
    }
  });
}
