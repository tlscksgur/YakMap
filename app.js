import { getAuthErrorMessage } from "./lib/auth-errors.mjs";

const STORAGE_KEY = "yak-map-state-v1";
const SAMPLE_OCR_TEXT = "타이레놀정500mg\n아침, 저녁 식후 30분\n3일분";
const MAX_VISIBLE_STORES = 20;
const NEARBY_RADIUS_KM = 3;

const today = new Date().toISOString().slice(0, 10);

const medicineCache = [
  {
    item_name: "타이레놀정500mg",
    aliases: ["타이레놀", "아세트아미노펜"],
    category: "일반",
    efficacy: "해열 및 감기, 두통, 치통, 근육통 완화",
    side_effects: "간 질환이 있거나 음주 후 복용 시 전문가 상담이 필요합니다."
  },
  {
    item_name: "게보린정",
    aliases: ["게보린"],
    category: "일반",
    efficacy: "두통, 치통, 생리통 등 통증 완화",
    side_effects: "카페인 민감자와 위장 장애가 있는 경우 주의하세요."
  },
  {
    item_name: "아목시실린캡슐",
    aliases: ["아목시실린", "항생제"],
    category: "전문",
    efficacy: "세균 감염 치료에 쓰이는 항생제",
    side_effects: "처방 없이 임의 복용하거나 중단하지 마세요."
  },
  {
    item_name: "로수바스타틴정",
    aliases: ["로수바스타틴", "고지혈증약"],
    category: "전문",
    efficacy: "콜레스테롤 조절 및 심혈관 위험 감소",
    side_effects: "근육통, 간 수치 이상이 있으면 진료가 필요합니다."
  },
  {
    item_name: "판콜에이내복액",
    aliases: ["판콜", "감기약"],
    category: "일반",
    efficacy: "감기 증상 완화",
    side_effects: "졸림이 올 수 있어 운전 전 복용에 주의하세요."
  }
];

const stores = [
  {
    id: "p1",
    type: "pharmacy",
    name: "코랄약국",
    address: "서울특별시 중구 세종대로 110",
    phone: "02-123-4567",
    distance: 0.4,
    open: true,
    hours: "08:30-21:30",
    x: 24,
    y: 42
  },
  {
    id: "p2",
    type: "pharmacy",
    name: "햇살온누리약국",
    address: "서울특별시 중구 명동길 20",
    phone: "02-555-0912",
    distance: 0.9,
    open: true,
    hours: "09:00-22:00",
    x: 63,
    y: 36
  },
  {
    id: "h1",
    type: "hospital",
    name: "피치내과의원",
    address: "서울특별시 종로구 종로 51",
    phone: "02-777-2400",
    distance: 1.3,
    open: true,
    hours: "09:00-18:30",
    x: 44,
    y: 68
  },
  {
    id: "s1",
    type: "store",
    name: "세븐일레븐 시청점",
    address: "서울특별시 중구 무교로 12",
    phone: "02-700-1111",
    distance: 0.7,
    open: true,
    hours: "24시간",
    x: 78,
    y: 62
  }
];

const defaultState = {
  users: [],
  currentUserId: null,
  schedules: [],
  dose_records: [],
  in_app_notifications: [],
  pending_mutations: [],
  notification_failures: [],
  medicine_cache: [],
  selectedTab: "home",
  authMode: "login",
  selectedMedicine: null,
  medicineCandidates: [],
  mapFilter: "pharmacy",
  mapPlaces: [],
  kakaoNearbySearchKey: "",
  regionSearch: "",
  storeSearch: "",
  editingScheduleId: null,
  apiStatus: {},
  ocrText: "",
  locationLabel: "현재 위치 확인 전",
  currentPosition: null,
  locationPermissionDenied: false
};

let state = loadState();
let pendingSignup = null;
let runtimeConfig = {
  integrations: {
    supabase: { configured: false },
    firebase: { configured: false },
    kakaoMap: { configured: false },
    openRouterOcr: { configured: false },
    mfds: { configured: false },
    nmc: { configured: false }
  },
  firebase: null,
  kakaoMapKey: "",
  liveApisEnabled: false
};
let reminderInterval = null;
let serviceWorkerRegistration = null;
let ocrCameraStream = null;

const app = document.querySelector("#app");
const appHero = document.querySelector("#appHero");
const appTabbar = document.querySelector("#appTabbar");

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", async () => {
    state.selectedTab = button.dataset.tab;
    persist();
    if (state.selectedTab === "map") {
      if (!state.currentPosition) locateUser();
      await loadStoresForFilter(state.mapFilter);
    }
    render();
  });
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js")
    .then((registration) => {
      serviceWorkerRegistration = registration;
    })
    .catch(() => {});
}

boot();

async function boot() {
  await loadRuntimeConfig();
  validateCurrentSession();
  bindNetworkState();
  requestLocationOnAppLaunch();
  render();
  startReminderLoop();
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      const nextState = { ...defaultState, ...saved };
      if (nextState.ocrText === SAMPLE_OCR_TEXT) nextState.ocrText = "";
      return nextState;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return structuredClone(defaultState);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function loadRuntimeConfig() {
  try {
    runtimeConfig = await apiGet("/api/config");
    state.apiStatus.config = "connected";
  } catch {
    state.apiStatus.config = "fallback";
  }
  persist();
}

async function apiGet(path) {
  const response = await fetch(path, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

function validateCurrentSession() {
  const user = currentUser();
  if (!user) return;
  if (user.is_active === false) {
    expireCurrentSession("탈퇴 처리된 계정은 로그인할 수 없습니다.");
    return;
  }
  if (isMalformedAccessToken(user.access_token)) {
    expireCurrentSession("잘못된 토큰입니다. 다시 로그인하세요.");
    return;
  }
  if (user.session_expires_at && Date.now() > user.session_expires_at) {
    expireCurrentSession("만료된 세션입니다. 다시 로그인하세요.");
  }
}

function expireCurrentSession(message) {
  const user = currentUser();
  if (user) user.fcm_token = "";
  state.currentUserId = null;
  state.selectedTab = "home";
  state.apiStatus.auth = "error";
  persist();
  toast(message);
}

function isMalformedAccessToken(token) {
  if (!token) return false;
  const value = String(token);
  return /\s/.test(value) || /^(bad|tampered|invalid)/i.test(value);
}

function bindNetworkState() {
  updateNetworkState();
  window.addEventListener("online", () => {
    updateNetworkState();
    flushPendingMutations();
  });
  window.addEventListener("offline", updateNetworkState);
}

function updateNetworkState() {
  if (!navigator.onLine) {
    state.apiStatus.network = "offline";
    persist();
    toast("오프라인 상태입니다. 저장 작업은 로컬 대기열에 보관됩니다.");
    return;
  }
  state.apiStatus.network = "connected";
  persist();
}

function userSchedules() {
  return state.schedules
    .filter((schedule) => schedule.user_id === state.currentUserId)
    .sort((a, b) => a.end_date.localeCompare(b.end_date));
}

function userDoseRecords() {
  return (state.dose_records || []).filter((record) => record.user_id === state.currentUserId);
}

function allMedicines() {
  const merged = [...medicineCache, ...(state.medicine_cache || [])];
  return merged.filter((medicine, index) => {
    return merged.findIndex((item) => item.item_name === medicine.item_name) === index;
  });
}

function render() {
  const user = currentUser();
  appTabbar.hidden = !user;
  syncTabs();
  
  if (user) {
    document.body.classList.add("is-logged-in");
  } else {
    document.body.classList.remove("is-logged-in");
  }

  appHero.innerHTML = renderHero(user);
  
  if (!user) {
    bindUtilityEvents();
    app.innerHTML = renderAuth();
    bindAuthEvents();
    afterRender();
    return;
  }

  const viewMap = {
    home: renderHome,
    meds: renderMeds,
    map: renderMap,
    profile: renderProfile
  };

  app.innerHTML = viewMap[state.selectedTab]();
  bindViewEvents();
  afterRender();
}

function renderHero(user) {
  if (!user) {
    return `
      <div class="hero-top">
        <div class="brand-mark" aria-hidden="true">
          <span></span>
        </div>
        <div>
          <p class="eyebrow">Yak-Map</p>
          <h1>약-맵</h1>
          <p class="hero-copy">복약 등록부터 구매처 안내까지 한 번에 관리하세요.</p>
        </div>
      </div>
      <div class="hero-actions">
        <button class="ghost-button" id="notifyPermissionButton" type="button">알림 허용</button>
      </div>
    `;
  }

  return `
    <div class="hero-top">
      <div class="brand-mark mini" aria-hidden="true">
        <span></span>
      </div>
      <div class="user-info">
        <p class="eyebrow">환영합니다!</p>
        <h2>${escapeHtml(user.nickname || user.email.split("@")[0])}님</h2>
      </div>
    </div>
  `;
}

function bindUtilityEvents() {
  const notifyBtn = document.querySelector("#notifyPermissionButton");
  if (notifyBtn) {
    notifyBtn.addEventListener("click", requestNotificationPermission);
  }
}

function afterRender() {
  if (state.selectedTab === "map") {
    renderLiveKakaoMap().catch((error) => {
      state.apiStatus.kakao = "error";
      setMapStatus(kakaoMapSetupHelp(error.message));
    });
  }
}

function syncTabs() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.selectedTab);
  });
}

function renderApiStatus() {
  const integrations = runtimeConfig.integrations || {};
  const rows = [
    ["식약처 e약은요", integrations.mfds?.configured, state.apiStatus.medicine],
    ["OpenRouter OCR", integrations.openRouterOcr?.configured, state.apiStatus.ocr],
    ["약국/병원 공공 API", integrations.nmc?.configured, state.apiStatus.stores],
    ["카카오맵", integrations.kakaoMap?.configured, state.apiStatus.kakao],
    ["Supabase", integrations.supabase?.configured, state.apiStatus.auth],
    ["Firebase FCM", integrations.firebase?.configured, state.apiStatus.fcm || "동시 로그인 허용"],
    ["네트워크", true, state.apiStatus.network]
  ];

  return `
    <section class="card compact-card">
      <div class="section-heading">
        <div>
          <h2>API 연결 상태</h2>
          <p>키가 있으면 실 API, 없으면 샘플 fallback으로 동작합니다.</p>
        </div>
      </div>
      <div class="api-status-grid">
        ${rows.map(([name, configured, status]) => `
          <div class="api-status-item">
            <span>${name}</span>
            <strong class="${configured ? "ok" : "fallback"}">${configured ? statusLabel(status) : "키 필요"}</strong>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function statusLabel(status) {
  if (status === "connected" || status === "live") return "연결됨";
  if (status === "error") return "오류";
  if (status === "cache") return "캐시";
  if (status === "fallback") return "샘플";
  if (status === "offline") return "오프라인";
  return "대기";
}

function renderAuth() {
  const isLogin = state.authMode === "login";
  const isWaitingForCode = !isLogin && Boolean(pendingSignup?.email);
  return `
    <section class="card auth-panel">
      <div class="section-heading">
        <div>
          <h2>${isLogin ? "로그인" : "회원가입"}</h2>
          <p>${isLogin ? "세션 유지와 FCM 토큰 갱신을 처리합니다." : "랜덤 인증코드를 입력한 뒤 계정을 만듭니다."}</p>
        </div>
      </div>
      <div class="segmented" role="tablist" aria-label="인증 모드">
        <button class="${isLogin ? "is-active" : ""}" type="button" data-auth-mode="login">로그인</button>
        <button class="${!isLogin ? "is-active" : ""}" type="button" data-auth-mode="signup">회원가입</button>
      </div>
      <form class="form-grid" id="authForm">
        ${isWaitingForCode ? `
          <div class="verification-box">
            <p class="muted">인증코드 발송 완료</p>
            <strong>${escapeHtml(pendingSignup.email)}</strong>
            <span>이메일로 받은 6자리 코드를 입력하세요.</span>
          </div>
          <div class="field">
            <label for="verificationCode">인증코드 입력</label>
            <input id="verificationCode" name="verificationCode" type="text" inputmode="numeric" maxlength="6" placeholder="6자리 숫자" required />
          </div>
        ` : `
          <div class="field">
            <label for="email">이메일</label>
            <input id="email" name="email" type="email" autocomplete="email" placeholder="yakmap@example.com" required />
          </div>
          <div class="field">
            <label for="password">비밀번호</label>
            <input id="password" name="password" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}" placeholder="8자 이상" minlength="8" required />
          </div>
          ${!isLogin ? `
            <div class="field">
              <label for="passwordConfirm">비밀번호 확인</label>
              <input id="passwordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" placeholder="비밀번호 재입력" minlength="8" required />
            </div>
            <label class="check-field" for="termsAgree">
              <input id="termsAgree" name="termsAgree" type="checkbox" />
              <span>복약 알림 및 개인정보 처리 안내에 동의합니다.</span>
            </label>
          ` : ""}
        `}
        <div class="auth-action-row">
          <button class="primary-button" type="submit">${isLogin ? "로그인" : isWaitingForCode ? "인증하고 회원가입" : "인증코드 이메일 발송"}</button>
          ${isLogin ? `<button class="secondary-button" type="button" id="passwordResetButton">비밀번호 찾기</button>` : ""}
          ${isWaitingForCode ? `<button class="secondary-button" type="button" id="resetSignupButton">다른 이메일로 가입</button>` : ""}
        </div>
      </form>
    </section>
  `;
}

function renderHome() {
  const schedules = userSchedules();
  const dueToday = schedules.filter((schedule) => isWithinSchedule(schedule, today));
  const lowStock = schedules.filter((schedule) => schedule.remaining_pills <= dailyDoseAmount(schedule));
  const next = nextDose(dueToday);

  return `
    <section class="section-heading">
      <div>
        <h2>오늘의 복약 일정</h2>
        <p>${next ? `${next.time} · ${next.name}` : "오늘 예정된 복약이 없습니다."}</p>
      </div>
      <span class="badge">${new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}</span>
    </section>

    ${renderApiStatus()}

    <section class="metric-grid" aria-label="복약 요약">
      <div class="metric"><strong>${dueToday.length}</strong><span>오늘 약</span></div>
      <div class="metric"><strong>${schedules.length}</strong><span>등록 약</span></div>
      <div class="metric"><strong>${lowStock.length}</strong><span>재구매 필요</span></div>
    </section>

    ${renderInAppNotifications()}

    <section class="card">
      <div class="section-heading">
        <div>
          <h2>빠른 약 판별</h2>
          <p>약 이름으로 전문/일반을 확인합니다.</p>
        </div>
      </div>
      ${renderMedicineSearch()}
    </section>

    <section class="card">
      <div class="section-heading">
        <div>
          <h2>OCR 약 등록</h2>
          <p>약 봉투/처방전 이미지에서 약 이름을 추출하고 복약 스케줄에 등록합니다.</p>
        </div>
      </div>
      ${renderOcrPanel()}
    </section>

    <section class="card">
      <div class="section-heading">
        <div>
          <h2>복용 체크</h2>
          <p>체크하면 남은 알약 수가 차감됩니다.</p>
        </div>
      </div>
      ${renderScheduleList(dueToday, true)}
    </section>

    ${renderDoseHistory()}
  `;
}

function renderMeds() {
  return `
    <section class="section-heading">
      <div>
        <h2>내약</h2>
        <p>복용 주기와 잔여 수량을 관리합니다.</p>
      </div>
    </section>
    <section class="card">
      ${renderScheduleForm(state.selectedMedicine?.item_name || "")}
    </section>
    <section class="card">
      <div class="section-heading">
        <div>
          <h2>등록된 스케줄</h2>
          <p>1일분 이하가 되면 재구매 알림 대상입니다.</p>
        </div>
      </div>
      ${renderScheduleList(userSchedules(), false)}
    </section>
  `;
}

function renderMap() {
  const holidayMode = isHolidayOrNight();
  const filtered = visibleStoresForMap(holidayMode);
  const shouldRenderFallbackPins = !runtimeConfig.integrations?.kakaoMap?.configured
    || state.apiStatus.kakao === "error"
    || state.apiStatus.kakao === "fallback";
  const nightNotice = filtered.length
    ? ""
    : `<div class="card empty-state">${emptyStoreMessage()}</div>`;

  return `
    <section class="section-heading">
      <div>
        <h2>스마트 길찾기</h2>
        <p>${holidayMode ? "공휴일에는 상비약 판매 편의점을 우선 안내합니다." : state.locationLabel}</p>
        <p class="muted">${state.currentPosition ? "내 위치 마커 표시됨" : "현재 위치를 확인하면 반경 3km 판매처만 표시합니다."}</p>
        ${state.locationPermissionDenied ? `<p class="permission-hint">위치 권한을 허용해주세요. 브라우저 주소창 왼쪽 권한 설정에서 위치 접근을 켤 수 있습니다.</p>` : ""}
      </div>
      <button class="text-button" type="button" id="locateButton">위치 확인</button>
    </section>
    <section class="card">
      <form class="form-grid" id="mapSearchForm">
        <div class="two-col">
          <div class="field">
            <label for="regionSearchInput">지역명 검색</label>
            <input id="regionSearchInput" type="search" value="${escapeHtml(state.regionSearch || "")}" placeholder="예: 중구, 강남역" />
          </div>
          <div class="field">
            <label for="storeSearchInput">약국명 검색</label>
            <input id="storeSearchInput" type="search" value="${escapeHtml(state.storeSearch || "")}" placeholder="예: 코랄약국" />
          </div>
        </div>
        <button class="secondary-button" type="submit">지도 검색</button>
      </form>
      <div class="segmented" role="tablist" aria-label="판매처 필터">
        ${filterButton("pharmacy", "약국")}
        ${filterButton("hospital", "병원")}
      </div>
      <div class="segmented" role="tablist" aria-label="상비약 필터" style="margin-top: 8px;">
        ${filterButton("store", "심야 편의점")}
        ${filterButton("all", "전체")}
      </div>
      <div class="map-panel" aria-label="주변 판매처 지도">
        <div id="kakaoMap" class="kakao-map"></div>
        <div id="mapStatus" class="map-status">${renderMapStatus()}</div>
        ${shouldRenderFallbackPins ? filtered.map(renderPin).join("") : ""}
      </div>
      <button class="primary-button" type="button" id="refreshStoresButton" style="margin-top: 12px;">실시간 판매처 불러오기</button>
    </section>
    <section class="store-list">
      ${filtered.map(renderStore).join("") || nightNotice}
    </section>
  `;
}

function renderProfile() {
  const user = currentUser();
  return `
    <section class="section-heading">
      <div>
        <h2>프로필</h2>
        <p>계정, FCM 토큰, API 연결 상태입니다.</p>
      </div>
    </section>
    
    ${renderApiStatus()}
    <section class="card profile-grid">
      <div>
        <p class="muted">이메일</p>
        <h3>${escapeHtml(user.email)}</h3>
        <button class="text-button" type="button" id="emailLockedButton">이메일 변경 요청</button>
      </div>
      <form class="form-grid" id="profileForm">
        <div class="field">
          <label for="nicknameInput">닉네임</label>
          <input id="nicknameInput" type="text" value="${escapeHtml(user.nickname || "")}" placeholder="${escapeHtml(user.email.split("@")[0])}" />
        </div>
        <button class="secondary-button" type="submit">닉네임 저장</button>
      </form>
      <form class="form-grid" id="passwordChangeForm">
        <div class="field">
          <label for="newPasswordInput">새 비밀번호</label>
          <input id="newPasswordInput" type="password" autocomplete="new-password" minlength="8" placeholder="8자 이상" />
        </div>
        <button class="secondary-button" type="submit">비밀번호 변경</button>
      </form>
      <div>
        <p class="muted">계정 상태</p>
        <h3>${user.is_active === false ? "비활성화" : "활성"}</h3>
      </div>
      <div>
        <p class="muted">FCM 토큰</p>
        <div class="token-box">${escapeHtml(user.fcm_token || "로그인 시 토큰이 없습니다.")}</div>
        <p class="muted">기기별 토큰 ${user.fcm_tokens?.length || 0}개 · 동시 로그인 허용</p>
      </div>
      <div class="pill-row">
        <span class="status-chip badge general">Supabase Auth 준비</span>
        <span class="status-chip badge">FCM 갱신 흐름 구현</span>
        <span class="status-chip badge warning">외부 API 키 필요</span>
      </div>
      <button class="secondary-button" type="button" id="refreshTokenButton">FCM 토큰 다시 갱신</button>
      <button class="secondary-button" id="notifyPermissionButton" type="button">알림 허용</button>
      <button class="text-button" type="button" id="deactivateAccountButton">회원 탈퇴</button>
      <button class="text-button" type="button" id="logoutButton">로그아웃</button>
    </section>
  `;
}

function renderMedicineSearch() {
  const selected = state.selectedMedicine;
  const candidates = state.medicineCandidates || [];
  return `
    <form class="form-grid" id="medicineSearchForm">
      <div class="field">
        <label for="medicineSearch">약 이름</label>
        <input id="medicineSearch" type="search" placeholder="예: 타이레놀, 아목시실린" list="medicineNames" required />
        <datalist id="medicineNames">
          ${allMedicines().map((medicine) => `<option value="${medicine.item_name}"></option>`).join("")}
        </datalist>
      </div>
      <button class="primary-button" type="submit">전문/일반 판별</button>
    </form>
    ${candidates.length > 0 ? renderMedicineCandidates(candidates) : ""}
    ${selected ? renderMedicineResult(selected) : ""}
  `;
}

function renderMedicineCandidates(candidates) {
  return `
    <div class="result-list" style="margin-top: 12px;">
      <p class="muted">유사한 약 후보</p>
      ${candidates.map((medicine) => `
        <button class="result-item" type="button" data-select-medicine="${escapeHtml(medicine.item_name)}">
          <div class="item-top">
            <strong>${escapeHtml(medicine.item_name)}</strong>
            <span class="badge ${medicine.category === "전문" ? "prescription" : "general"}">${medicine.category}</span>
          </div>
        </button>
      `).join("")}
    </div>
  `;
}

function renderOcrPanel() {
  return `
    <div class="scan-drop">
      <div class="camera-capture">
        <video id="ocrCameraPreview" class="ocr-camera-preview" autoplay playsinline muted hidden></video>
        <canvas id="ocrCaptureCanvas" hidden></canvas>
        <p class="muted">카메라로 약 봉투/처방전을 직접 촬영하면 약 이름을 자동 추출합니다.</p>
        <div class="two-col">
          <button class="secondary-button" type="button" id="startOcrCameraButton">카메라 켜기</button>
          <button class="primary-button" type="button" id="captureOcrButton" disabled>촬영하고 OCR</button>
        </div>
        <button class="ghost-button" type="button" id="stopOcrCameraButton" disabled>카메라 끄기</button>
      </div>
      <div class="field">
        <label for="ocrText">추출된 텍스트</label>
        <textarea id="ocrText" placeholder="촬영하면 OCR 결과가 여기에 자동으로 들어옵니다. 직접 입력도 가능합니다.">${escapeHtml(state.ocrText)}</textarea>
      </div>
      <div class="two-col">
        <button class="secondary-button" type="button" id="useSampleOcrButton">샘플 입력</button>
        <button class="primary-button" type="button" id="scanOcrButton">OCR 다시 실행</button>
      </div>
    </div>
    <div class="result-list" id="ocrResults"></div>
  `;
}

function renderMedicineResult(medicine) {
  const isPrescription = medicine.category === "전문";
  const guidance = isPrescription ? "처방이 필요한 약입니다" : "약국에서 구매 가능";
  const target = isPrescription ? "병원 진료 후 처방이 필요합니다." : "주변 영업 중인 약국에서 구매처를 확인하세요.";
  return `
    <div class="result-item" style="margin-top: 12px;">
      <div class="item-top">
        <div>
          <h3>${medicine.item_name}</h3>
          <p><strong>${guidance}</strong> · ${medicine.efficacy}</p>
        </div>
        <span class="badge ${isPrescription ? "prescription" : "general"}">${medicine.category}</span>
      </div>
      <p class="muted">${medicine.side_effects}</p>
      <div class="action-row">
        <button class="secondary-button" type="button" data-guide="${isPrescription ? "hospital" : "pharmacy"}">${target}</button>
        <button class="primary-button" type="button" data-add-medicine="${medicine.item_name}">복약 알림 등록</button>
      </div>
    </div>
  `;
}

function renderScheduleForm(prefill = "") {
  const editing = state.schedules.find((schedule) => schedule.id === state.editingScheduleId);
  const options = allMedicines();
  const selectedName = editing?.medicine_name || prefill;
  if (selectedName && !options.some((medicine) => medicine.item_name === selectedName)) {
    options.unshift({
      item_name: selectedName,
      category: state.selectedMedicine?.category || "확인 필요"
    });
  }
  const medicineOptions = options
    .map((medicine) => `<option value="${escapeHtml(medicine.item_name)}"></option>`)
    .join("");

  return `
    <form class="form-grid" id="scheduleForm">
      <div class="field">
        <label for="scheduleMedicine">약 이름</label>
        <input id="scheduleMedicine" type="text" value="${escapeHtml(selectedName)}" list="scheduleMedicineNames" placeholder="약 이름 직접 입력" required />
        <datalist id="scheduleMedicineNames">${medicineOptions}</datalist>
      </div>
      <div class="field">
        <label for="dosageTimes">복용 시간</label>
        <input id="dosageTimes" type="text" value="${editing ? editing.dosage_times.join(", ") : "09:00, 13:00, 19:00"}" placeholder="09:00, 13:00, 19:00" required />
        <div class="pill-row" aria-label="복용 시간 빠른 선택">
          <button class="time-preset" type="button" data-time-preset="09:00">아침</button>
          <button class="time-preset" type="button" data-time-preset="13:00">점심</button>
          <button class="time-preset" type="button" data-time-preset="19:00">저녁</button>
        </div>
      </div>
      <div class="two-col">
        <div class="field">
          <label for="startDate">시작일</label>
          <input id="startDate" type="date" value="${editing?.start_date || today}" required />
        </div>
        <div class="field">
          <label for="endDate">종료일</label>
          <input id="endDate" type="date" value="${editing?.end_date || addDays(today, 2)}" required />
        </div>
      </div>
      <div class="field">
        <label for="remainingPills">남은 알약 수</label>
        <input id="remainingPills" type="number" min="1" value="${editing?.remaining_pills || 9}" required />
      </div>
      <div class="field">
        <label for="doseAmount">1회 복용량</label>
        <input id="doseAmount" type="number" min="1" max="99" value="${editing?.dose_amount || 1}" required />
      </div>
      <div class="action-row">
        <button class="primary-button" type="submit">${editing ? "스케줄 수정" : "스케줄 등록"}</button>
        ${editing ? `<button class="text-button" type="button" id="cancelScheduleEditButton">수정 취소</button>` : ""}
      </div>
    </form>
  `;
}

function renderScheduleList(schedules, allowCheck) {
  if (!schedules.length) {
    return `<div class="empty-state">등록된 복약 일정이 없습니다.</div>`;
  }

  return `
    <div class="schedule-list">
      ${schedules.map((schedule) => renderSchedule(schedule, allowCheck)).join("")}
    </div>
  `;
}

function renderSchedule(schedule, allowCheck) {
  const remainingRatio = Math.max(0, Math.min(100, (schedule.remaining_pills / schedule.initial_pills) * 100));
  const low = schedule.remaining_pills <= dailyDoseAmount(schedule);
  return `
    <article class="schedule-item">
      <div class="item-top">
        <div>
          <h3>${escapeHtml(schedule.medicine_name)}</h3>
          <p>${schedule.start_date} ~ ${schedule.end_date}</p>
        </div>
        <span class="badge ${schedule.is_prescription ? "prescription" : "general"}">${schedule.is_prescription ? "전문" : "일반"}</span>
      </div>
      <div class="medicine-tags">
        ${schedule.dosage_times.map((time) => `<span class="time-chip badge">${time}</span>`).join("")}
        ${low ? `<span class="time-chip badge warning">1일분 이하</span>` : ""}
      </div>
      <div class="progress" aria-label="잔여 알약 ${schedule.remaining_pills}개">
        <span style="--value: ${remainingRatio}%"></span>
      </div>
      <p class="muted">남은 알약 ${schedule.remaining_pills}개 · 1회 복용량 ${schedule.dose_amount || 1}개</p>
      <div class="action-row">
        ${allowCheck ? `<button class="primary-button" type="button" data-take="${schedule.id}" ${schedule.remaining_pills <= 0 ? "disabled" : ""}>복용 완료</button>` : ""}
        ${allowCheck ? `<button class="secondary-button" type="button" data-missed="${schedule.id}">미복용 기록</button>` : ""}
        <button class="secondary-button" type="button" data-edit-schedule="${schedule.id}">수정</button>
        <button class="text-button" type="button" data-delete="${schedule.id}">삭제</button>
      </div>
    </article>
  `;
}

function renderDoseHistory() {
  const records = userDoseRecords();
  const completed = records.filter((record) => record.status === "taken").length;
  const rate = records.length ? Math.round((completed / records.length) * 100) : 0;
  return `
    <section class="card">
      <div class="section-heading">
        <div>
          <h2>복용 기록</h2>
          <p>복약 성공률 ${rate}% · 날짜별 기록 ${records.length}건</p>
        </div>
      </div>
      ${records.length ? `
        <div class="schedule-list">
          ${records.slice(-5).reverse().map((record) => `
            <div class="store-item">
              <strong>${escapeHtml(record.medicine_name)}</strong>
              <p class="muted">${record.date} · ${record.dose_time || "시간 미지정"} · ${record.status === "taken" ? "복용 완료" : "미복용"} · ${record.dose_amount || 1}개</p>
            </div>
          `).join("")}
        </div>
      ` : `<div class="empty-state">아직 복용 기록이 없습니다.</div>`}
    </section>
  `;
}

function renderInAppNotifications() {
  const notifications = (state.in_app_notifications || [])
    .filter((item) => item.user_id === state.currentUserId)
    .slice(-3)
    .reverse();
  if (!notifications.length) return "";
  return `
    <section class="card notice-card" aria-label="앱 내부 알림">
      <div class="section-heading">
        <div>
          <h2>앱 내부 알림</h2>
          <p>복용 시간이 도달한 알림입니다.</p>
        </div>
      </div>
      ${notifications.map((item) => `
        <div class="result-item">
          <strong>${escapeHtml(item.medicine_name)}</strong>
          <p class="muted">${item.date} · ${item.dose_time} 복용 시간입니다.</p>
        </div>
      `).join("")}
    </section>
  `;
}

function filterButton(value, label) {
  return `<button class="${state.mapFilter === value ? "is-active" : ""}" type="button" data-map-filter="${value}">${label}</button>`;
}

function renderPin(store) {
  const className = store.type === "hospital" ? "hospital" : store.type === "store" ? "store" : "";
  return `<button class="map-pin ${className}" style="left: ${store.x}%; top: ${store.y}%;" type="button" data-store-id="${store.id}" aria-label="${store.name}"><span>${store.type === "hospital" ? "H" : store.type === "store" ? "24" : "약"}</span></button>`;
}

function renderStore(store) {
  const label = store.type === "hospital" ? "병원" : store.type === "store" ? "상비약 편의점" : "약국";
  const statusLabel = storeStatusLabel(store);
  const statusClass = store.open ? "general" : "closed";
  return `
    <article class="store-item">
      <div class="item-top">
        <div>
          <h3>${store.name}</h3>
          <p>${store.address}</p>
        </div>
        <div class="badge-stack">
          <span class="badge ${store.type === "hospital" ? "prescription" : "general"}">${label}</span>
          <span class="badge ${statusClass}">${statusLabel}</span>
        </div>
      </div>
      <p class="muted">${formatStoreDistance(store)} · ${storeHoursLabel(store)} · ${store.phone}</p>
      <div class="action-row">
        <button class="secondary-button" type="button" data-route="${store.id}">길찾기 앱 열기</button>
        <button class="text-button" type="button" data-call="${store.id}">전화 걸기</button>
      </div>
    </article>
  `;
}

function storeStatusLabel(store) {
  if (store.statusLabel) return store.statusLabel;
  if (!store.hours || store.hours === "영업정보 없음") return "영업정보 없음";
  return store.open ? "영업 중" : "영업 종료";
}

function storeHoursLabel(store) {
  return store.hours || "영업정보 없음";
}

function visibleStoresForMap(holidayMode = isHolidayOrNight()) {
  const sourceStores = prioritizeHolidayConvenienceStores(sortStoresByDistance(state.mapPlaces.length ? state.mapPlaces : stores), holidayMode);
  const nearbyStores = filterNearbyStores(sourceStores);
  const displayStores = fallbackToUnfilteredStores(sourceStores, nearbyStores);
  const filteredByType = displayStores.filter((store) => {
    if (state.mapFilter === "all") return true;
    return store.type === state.mapFilter;
  });
  return filterStoresBySearch(filteredByType).slice(0, MAX_VISIBLE_STORES);
}

function fallbackToUnfilteredStores(sourceStores, nearbyStores) {
  if (!state.currentPosition) return nearbyStores;
  if (nearbyStores.length > 0) return nearbyStores;
  return sourceStores;
}

function resetNearbyKakaoSearch() {
  state.kakaoNearbySearchKey = "";
}

function filterNearbyStores(items) {
  if (!state.currentPosition) return items;
  return items.filter((store) => {
    const distance = storeDistanceKm(store);
    return distance !== null && distance <= NEARBY_RADIUS_KM;
  });
}

function emptyStoreMessage() {
  if (state.regionSearch || state.storeSearch) return "검색 조건에 맞는 판매처가 없습니다.";
  if (state.currentPosition) return "반경 3km 이내 판매처가 없습니다.";
  return "영업 중인 약국이 부족합니다. 심야에는 24시간 상비약 판매처 또는 응급의료 안내를 확인하세요.";
}

function sortStoresByDistance(items) {
  return [...items].sort((a, b) => {
    const distanceA = storeDistanceKm(a);
    const distanceB = storeDistanceKm(b);
    return (distanceA ?? Number.MAX_SAFE_INTEGER) - (distanceB ?? Number.MAX_SAFE_INTEGER);
  });
}

function formatStoreDistance(store) {
  const distance = storeDistanceKm(store);
  if (distance === null) return "거리 확인 전";
  if (distance < 1) return `${Math.max(1, Math.round(distance * 1000))}m`;
  const rounded = distance < 10 ? distance.toFixed(1).replace(/\.0$/, "") : String(Math.round(distance));
  return `${rounded}km`;
}

function storeDistanceKm(store) {
  if (
    state.currentPosition
    && Number.isFinite(Number(state.currentPosition.lat))
    && Number.isFinite(Number(state.currentPosition.lng))
    && Number.isFinite(Number(store.lat))
    && Number.isFinite(Number(store.lng))
  ) {
    return haversineDistanceKm(state.currentPosition, store);
  }
  const distance = Number(store.distance);
  return Number.isFinite(distance) && distance > 0 ? distance : null;
}

function haversineDistanceKm(from, to) {
  const earthRadiusKm = 6371;
  const fromLat = toRadians(Number(from.lat));
  const toLat = toRadians(Number(to.lat));
  const deltaLat = toRadians(Number(to.lat) - Number(from.lat));
  const deltaLng = toRadians(Number(to.lng) - Number(from.lng));
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function prioritizeHolidayConvenienceStores(items, holidayMode = isHolidayOrNight()) {
  if (!holidayMode) return items;
  return [...items].sort((a, b) => {
    if (a.type === "store" && b.type !== "store") return -1;
    if (a.type !== "store" && b.type === "store") return 1;
    return Number(a.distance || 0) - Number(b.distance || 0);
  });
}

function isHolidayOrNight(date = new Date()) {
  const day = date.getDay();
  const hour = date.getHours();
  return day === 0 || day === 6 || hour < 8 || hour >= 22;
}

function filterStoresBySearch(items) {
  const parsedRegion = parseRegionSearch(state.regionSearch);
  const region = normalize(parsedRegion.region1 || parsedRegion.region2
    ? `${parsedRegion.region1} ${parsedRegion.region2}`
    : state.regionSearch);
  const storeName = normalize(state.storeSearch);
  return items.filter((store) => {
    const regionMatch = !region || normalize(`${store.address} ${store.name}`).includes(region);
    const nameMatch = !storeName || normalize(store.name).includes(storeName);
    return regionMatch && nameMatch;
  });
}

async function loadStoresForFilter(filter) {
  try {
    const params = mapApiSearchParams();
    const convenienceStoreFallback = stores.filter((store) => store.type === "store");
    if (filter === "hospital") {
      const hospitals = await apiGet(`/api/hospitals?${params}`);
      state.mapPlaces = hospitals.items || [];
      state.apiStatus.stores = hospitals.source === "nmc" ? "connected" : "fallback";
      return;
    }

    if (filter === "store") {
      state.mapPlaces = convenienceStoreFallback;
      state.apiStatus.stores = "fallback";
      return;
    }

    if (filter === "pharmacy" || filter === "all") {
      const [pharmacies, hospitals] = await Promise.all([
        apiGet(`/api/pharmacies?${params}`),
        filter === "all" ? apiGet(`/api/hospitals?${params}`) : Promise.resolve({ items: [] })
      ]);
      const places = [
        ...(pharmacies.items || []),
        ...(hospitals.items || []),
        ...(filter === "all" ? convenienceStoreFallback : [])
      ];
      state.mapPlaces = places;
      state.apiStatus.stores = pharmacies.source === "nmc" || hospitals.source === "nmc" ? "connected" : "fallback";
    }
  } catch (error) {
    state.apiStatus.stores = "error";
    toast(`판매처 API 오류: ${error.message}`);
  }
  persist();
}

async function loadKakaoMapSdk() {
  if (!runtimeConfig.kakaoMapKey) return false;
  if (window.kakao?.maps) return true;

  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-kakao-map-sdk]");
    if (existing) {
      if (existing.dataset.status === "error") existing.remove();
      else {
        existing.addEventListener("load", () => window.kakao.maps.load(() => resolve(true)), { once: true });
        existing.addEventListener("error", () => reject(new Error("SDK 스크립트 로드 실패")), { once: true });
        return;
      }
    }

    const script = document.createElement("script");
    script.dataset.kakaoMapSdk = "true";
    script.dataset.status = "loading";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(runtimeConfig.kakaoMapKey)}&libraries=services&autoload=false`;
    script.addEventListener("load", () => {
      script.dataset.status = "loaded";
      if (!window.kakao?.maps?.load) {
        reject(new Error("SDK 객체 초기화 실패"));
        return;
      }
      window.kakao.maps.load(() => resolve(true));
    }, { once: true });
    script.addEventListener("error", () => {
      script.dataset.status = "error";
      reject(new Error("SDK 스크립트 로드 실패"));
    }, { once: true });
    document.head.append(script);
  });
}

async function renderLiveKakaoMap() {
  const mapRoot = document.querySelector("#kakaoMap");
  if (!mapRoot) return;
  if (!runtimeConfig.integrations?.kakaoMap?.configured) {
    state.apiStatus.kakao = "fallback";
    setMapStatus(renderMapStatus());
    return;
  }
  setMapStatus("카카오맵 로딩 중입니다.");
  const loaded = await loadKakaoMapSdk();
  if (!loaded) return;

  const places = visibleStoresForMap();
  const centerPosition = state.currentPosition || places[0] || { lat: 37.5665, lng: 126.978 };
  const center = new window.kakao.maps.LatLng(centerPosition.lat, centerPosition.lng);
  const map = new window.kakao.maps.Map(mapRoot, { center, level: 5 });
  mapRoot.closest(".map-panel")?.classList.add("has-live-map");
  if (state.currentPosition) {
    const currentMarker = new window.kakao.maps.Marker({
      map,
      position: new window.kakao.maps.LatLng(state.currentPosition.lat, state.currentPosition.lng),
      title: "내 위치"
    });
    const currentInfo = new window.kakao.maps.InfoWindow({
      content: `<div style="padding:6px 8px;font-size:12px;">내 위치</div>`
    });
    window.kakao.maps.event.addListener(currentMarker, "click", () => currentInfo.open(map, currentMarker));
  }
  places.forEach((place) => {
    if (!place.lat || !place.lng) return;
    const marker = new window.kakao.maps.Marker({
      map,
      position: new window.kakao.maps.LatLng(place.lat, place.lng),
      title: place.name
    });
    const info = new window.kakao.maps.InfoWindow({
      content: `<div style="padding:6px 8px;font-size:12px;">${escapeHtml(place.name)}<br>${storeStatusLabel(place)} · ${escapeHtml(storeHoursLabel(place))}</div>`
    });
    window.kakao.maps.event.addListener(marker, "click", () => info.open(map, marker));
  });
  state.apiStatus.kakao = "connected";
  setMapStatus("");
  loadNearbyKakaoPlaces(map);
}

async function loadNearbyKakaoPlaces(map) {
  if (!state.currentPosition || !window.kakao?.maps?.services?.Places) return;
  const searchKey = `${state.mapFilter}:${state.currentPosition.lat.toFixed(4)},${state.currentPosition.lng.toFixed(4)}:${state.regionSearch}:${state.storeSearch}`;
  if (state.kakaoNearbySearchKey === searchKey) return;

  const center = new window.kakao.maps.LatLng(state.currentPosition.lat, state.currentPosition.lng);
  const places = new window.kakao.maps.services.Places(map);
  const results = await Promise.all(kakaoNearbyKeywords(state.mapFilter).map(({ keyword, type }) => {
    return searchKakaoKeyword(places, keyword, type, center);
  }));
  const nearbyPlaces = dedupeStores(results.flat()).slice(0, MAX_VISIBLE_STORES);
  state.kakaoNearbySearchKey = searchKey;
  if (!nearbyPlaces.length) return;

  state.mapPlaces = nearbyPlaces;
  state.apiStatus.stores = "kakao";
  persist();
  render();
}

function kakaoNearbyKeywords(filter) {
  if (filter === "pharmacy") return [{ keyword: "약국", type: "pharmacy" }];
  if (filter === "hospital") return [{ keyword: "병원", type: "hospital" }];
  if (filter === "store") return [{ keyword: "편의점", type: "store" }];
  return [
    { keyword: "약국", type: "pharmacy" },
    { keyword: "병원", type: "hospital" },
    { keyword: "편의점", type: "store" }
  ];
}

function searchKakaoKeyword(places, keyword, type, center) {
  return new Promise((resolve) => {
    places.keywordSearch(keyword, (data, status) => {
      if (status !== window.kakao.maps.services.Status.OK) {
        resolve([]);
        return;
      }
      resolve(data.map((place) => normalizeKakaoPlace(place, type)));
    }, {
      location: center,
      radius: NEARBY_RADIUS_KM * 1000,
      size: 15,
      sort: window.kakao.maps.services.SortBy.DISTANCE
    });
  });
}

function normalizeKakaoPlace(place, type) {
  return {
    id: `kakao-${type}-${place.id}`,
    type,
    name: place.place_name || (type === "store" ? "이름 미상 편의점" : "이름 미상 판매처"),
    address: place.road_address_name || place.address_name || "",
    phone: place.phone || "",
    distance: place.distance ? Number(place.distance) / 1000 : null,
    open: true,
    statusLabel: "영업정보 없음",
    hours: "영업정보 없음",
    lat: Number(place.y),
    lng: Number(place.x),
    x: 50,
    y: 50
  };
}

function dedupeStores(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${normalize(item.name)}:${normalize(item.address)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderMapStatus() {
  if (state.apiStatus.kakao === "connected") return "";
  if (state.apiStatus.kakao === "error") {
    return kakaoMapSetupHelp();
  }
  if (!runtimeConfig.integrations?.kakaoMap?.configured) {
    return "카카오맵 JavaScript 키가 필요합니다. 현재는 위치 마커 UI로 표시합니다.";
  }
  return "카카오맵 로딩 중입니다.";
}

function kakaoMapSetupHelp(reason = "") {
  const reasonText = reason ? ` (${reason})` : "";
  return `카카오맵 로딩 실패${reasonText}. Kakao Developers에서 Web 플랫폼 도메인 http://localhost:4173 등록과 카카오맵/로컬 서비스 활성화를 확인하세요.`;
}

function setMapStatus(message) {
  const status = document.querySelector("#mapStatus");
  if (status) status.textContent = message;
}

function bindAuthEvents() {
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      pendingSignup = null;
      persist();
      render();
    });
  });

  document.querySelector("#authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = pendingSignup?.email || String(form.get("email") || "");
    const password = pendingSignup?.password || String(form.get("password") || "");
    await authenticate(email, password, {
      verificationCode: String(form.get("verificationCode") || ""),
      passwordConfirm: String(form.get("passwordConfirm") || ""),
      termsAgreed: form.get("termsAgree") === "on"
    });
  });

  document.querySelector("#resetSignupButton")?.addEventListener("click", () => {
    pendingSignup = null;
    render();
  });

  document.querySelector("#passwordResetButton")?.addEventListener("click", async () => {
    const email = String(document.querySelector("#email")?.value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast("이메일을 입력하세요.");
      return;
    }
    if (!state.users.some((user) => user.email === email)) {
      toast("가입 정보가 없는 이메일입니다.");
      return;
    }
    try {
      await apiPost("/api/auth/password-reset-code", { email });
      toast("비밀번호 재설정 메일을 발송했습니다.");
    } catch (error) {
      toast(`비밀번호 재설정 메일 발송 실패: ${error.message}`);
    }
  });
}

function bindViewEvents() {
  document.querySelector("#medicineSearchForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = document.querySelector("#medicineSearch").value;
    const candidates = findMedicineCandidates(query);
    const medicine = await lookupMedicineRemote(query);
    if (!medicine && candidates.length) {
      state.medicineCandidates = candidates;
      state.selectedMedicine = null;
      persist();
      render();
      toast("유사한 약 후보를 표시했습니다.");
      return;
    }
    if (!medicine) {
      state.medicineCandidates = [];
      toast("검색 결과 없음");
      return;
    }
    state.medicineCandidates = [];
    state.selectedMedicine = medicine;
    persist();
    render();
  });

  document.querySelector("#startOcrCameraButton")?.addEventListener("click", startOcrCamera);
  document.querySelector("#captureOcrButton")?.addEventListener("click", captureOcrFrame);
  document.querySelector("#stopOcrCameraButton")?.addEventListener("click", () => stopOcrCamera());

  document.querySelector("#scanOcrButton")?.addEventListener("click", async () => {
    await runOcrScan();
  });

  document.querySelector("#useSampleOcrButton")?.addEventListener("click", () => {
    state.ocrText = "타이레놀정500mg\n판콜에이내복액\n아침 저녁 식후 30분";
    persist();
    render();
  });

  document.querySelector("#scheduleForm")?.addEventListener("submit", handleScheduleSubmit);
  document.querySelectorAll("[data-time-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector("#dosageTimes");
      const nextTimes = normalizeDosageTimes(`${input.value}, ${button.dataset.timePreset}`);
      input.value = nextTimes.join(", ");
    });
  });
  document.querySelector("#cancelScheduleEditButton")?.addEventListener("click", () => {
    state.editingScheduleId = null;
    persist();
    render();
  });

  bindMedicineActionEvents(document);

  document.querySelectorAll("[data-take]").forEach((button) => {
    button.addEventListener("click", () => markDoseTaken(Number(button.dataset.take)));
  });

  document.querySelectorAll("[data-missed]").forEach((button) => {
    button.addEventListener("click", () => markDoseMissed(Number(button.dataset.missed)));
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteSchedule(Number(button.dataset.delete)));
  });

  document.querySelectorAll("[data-edit-schedule]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingScheduleId = Number(button.dataset.editSchedule);
      state.selectedTab = "meds";
      persist();
      render();
    });
  });

  document.querySelector("#mapSearchForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.regionSearch = document.querySelector("#regionSearchInput").value.trim();
    state.storeSearch = document.querySelector("#storeSearchInput").value.trim();
    resetNearbyKakaoSearch();
    persist();
    await loadStoresForFilter(state.mapFilter);
    render();
  });

  document.querySelector("#profileForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const user = currentUser();
    if (!user) return;
    const nickname = document.querySelector("#nicknameInput").value.trim();
    user.nickname = nickname || user.email.split("@")[0];
    persist();
    render();
    toast("닉네임을 저장했습니다.");
  });

  document.querySelector("#passwordChangeForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const user = currentUser();
    if (!user) return;
    const password = document.querySelector("#newPasswordInput").value;
    if (!password || password.length < 8) {
      toast("8자 이상 새 비밀번호를 입력하세요.");
      return;
    }
    const nextHash = hashPassword(password);
    if (user.password_hash === nextHash) {
      toast("기존과 동일한 비밀번호는 사용할 수 없습니다.");
      return;
    }
    user.password_hash = nextHash;
    persist();
    render();
    toast("비밀번호를 변경했습니다.");
  });

  document.querySelector("#emailLockedButton")?.addEventListener("click", () => {
    toast("이메일 변경은 추가 인증이 필요해 현재 제한됩니다.");
  });

  document.querySelector("#deactivateAccountButton")?.addEventListener("click", () => deactivateAccount());

  document.querySelectorAll("[data-map-filter]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.mapFilter = button.dataset.mapFilter;
      resetNearbyKakaoSearch();
      persist();
      await loadStoresForFilter(state.mapFilter);
      render();
    });
  });

  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      const store = [...state.mapPlaces, ...stores].find((item) => item.id === button.dataset.route);
      const url = `https://map.kakao.com/link/search/${encodeURIComponent(store.name)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });
  });

  document.querySelectorAll("[data-call]").forEach((button) => {
    button.addEventListener("click", () => {
      const store = [...state.mapPlaces, ...stores].find((item) => item.id === button.dataset.call);
      const phone = String(store?.phone || "").replace(/[^\d+]/g, "");
      if (!phone) {
        toast("전화번호가 없는 판매처입니다.");
        return;
      }
      window.location.href = `tel:${phone}`;
    });
  });

  document.querySelectorAll("[data-store-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const store = [...state.mapPlaces, ...stores].find((item) => item.id === button.dataset.storeId);
      toast(`${store.name} · ${storeStatusLabel(store)} · ${formatStoreDistance(store)} · ${store.hours} · ${store.phone}`);
    });
  });

  document.querySelector("#locateButton")?.addEventListener("click", locateUser);
  document.querySelector("#refreshStoresButton")?.addEventListener("click", async () => {
    resetNearbyKakaoSearch();
    await loadStoresForFilter(state.mapFilter);
    render();
    toast("판매처 정보를 갱신했습니다.");
  });
  document.querySelector("#refreshTokenButton")?.addEventListener("click", () => refreshFcmToken());
  document.querySelector("#logoutButton")?.addEventListener("click", () => logout());

  bindUtilityEvents();
}

async function runOcrScan({ imageBase64 = "" } = {}) {
  state.ocrText = document.querySelector("#ocrText").value;
  if (imageBase64) {
    state.ocrText = "";
    document.querySelector("#ocrText").value = "OCR 추출 중입니다...";
    toast("촬영 이미지를 OCR로 분석 중입니다.");
  }
  let matches = extractMedicines(state.ocrText);
  try {
    const ocr = await apiPost("/api/ocr", { imageBase64, text: state.ocrText });
    state.apiStatus.ocr = ocr.source === "openrouter-ocr" ? "connected" : "fallback";
    state.ocrText = ocr.text || "";
    matches = ocr.medicines?.length
      ? ocr.medicines
      : ocrCandidateMedicines(ocr.extracted_names || []);
    if (ocr.warning) toast(ocr.warning);
  } catch (error) {
    state.apiStatus.ocr = "error";
    toast(`OCR API 오류: ${error.message}`);
  }
  const resultRoot = document.querySelector("#ocrResults");
  resultRoot.innerHTML = matches.length
    ? matches.map(renderMedicineResult).join("")
    : `<div class="empty-state">인식 실패 또는 재촬영이 필요합니다.</div>`;
  document.querySelector("#ocrText").value = state.ocrText;
  bindMedicineActionEvents(resultRoot);
  persist();
}

async function startOcrCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("이 브라우저에서는 카메라 촬영을 사용할 수 없습니다.");
    return;
  }
  if (!(await ensureCameraPermission())) return;
  try {
    stopOcrCamera({ silent: true });
    ocrCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    const preview = document.querySelector("#ocrCameraPreview");
    preview.srcObject = ocrCameraStream;
    preview.hidden = false;
    await preview.play();
    document.querySelector("#captureOcrButton").disabled = false;
    document.querySelector("#stopOcrCameraButton").disabled = false;
    toast("카메라가 켜졌습니다. 약 봉투/처방전을 화면에 맞춰 촬영하세요.");
  } catch (error) {
    ocrCameraStream = null;
    toast(`카메라 실행 오류: ${error.message}`);
  }
}

function mapApiSearchParams() {
  const params = new URLSearchParams({ limit: "50" });
  const region = parseRegionSearch(state.regionSearch);
  if (region.region1) params.set("region1", region.region1);
  if (region.region2) params.set("region2", region.region2);
  return params.toString();
}

function parseRegionSearch(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return { region1: normalizeRegion1(parts[0]), region2: parts[1] };
  if (parts[0] && /특별시|광역시|특별자치시|특별자치도|도$/.test(parts[0])) {
    return { region1: normalizeRegion1(parts[0]), region2: "" };
  }
  return { region1: "", region2: "" };
}

function normalizeRegion1(value) {
  const aliases = {
    서울: "서울특별시",
    부산: "부산광역시",
    대구: "대구광역시",
    인천: "인천광역시",
    광주: "광주광역시",
    대전: "대전광역시",
    울산: "울산광역시",
    세종: "세종특별자치시",
    경기: "경기도",
    강원: "강원특별자치도",
    충북: "충청북도",
    충남: "충청남도",
    전북: "전북특별자치도",
    전남: "전라남도",
    경북: "경상북도",
    경남: "경상남도",
    제주: "제주특별자치도"
  };
  return aliases[value] || value;
}

async function captureOcrFrame() {
  const preview = document.querySelector("#ocrCameraPreview");
  const canvas = document.querySelector("#ocrCaptureCanvas");
  if (!ocrCameraStream || !preview?.videoWidth) {
    toast("카메라가 준비되지 않았습니다. 카메라를 다시 켜주세요.");
    return;
  }
  canvas.width = preview.videoWidth;
  canvas.height = preview.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
  const capturedImage = await prepareImageForOcrDataUrl(canvas.toDataURL("image/jpeg", 0.92));
  stopOcrCamera({ silent: true });
  await runOcrScan({ imageBase64: capturedImage });
}

function stopOcrCamera({ silent = false } = {}) {
  if (ocrCameraStream) {
    ocrCameraStream.getTracks().forEach((track) => track.stop());
    ocrCameraStream = null;
  }
  const preview = document.querySelector("#ocrCameraPreview");
  if (preview) {
    preview.srcObject = null;
    preview.hidden = true;
  }
  const captureButton = document.querySelector("#captureOcrButton");
  const stopButton = document.querySelector("#stopOcrCameraButton");
  if (captureButton) captureButton.disabled = true;
  if (stopButton) stopButton.disabled = true;
  if (!silent) toast("카메라를 껐습니다.");
}

function bindMedicineActionEvents(root) {
  root.querySelectorAll("[data-add-medicine]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTab = "meds";
      state.selectedMedicine = lookupMedicine(button.dataset.addMedicine);
      persist();
      render();
      toast("내약 탭에서 복용 시간과 일수를 확인한 뒤 등록하세요.");
    });
  });

  root.querySelectorAll("[data-select-medicine]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedMedicine = lookupMedicine(button.dataset.selectMedicine);
      persist();
      render();
    });
  });

  root.querySelectorAll("[data-guide]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTab = "map";
      state.mapFilter = button.dataset.guide;
      persist();
      render();
    });
  });
}

async function authenticate(email, password, { verificationCode = "", passwordConfirm = "", termsAgreed = false } = {}) {
  if (!email) {
    toast("이메일을 입력하세요.");
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    toast(passwordError);
    return;
  }

  if (state.authMode === "signup" && !pendingSignup) {
    if (password !== passwordConfirm) {
      toast("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (!termsAgreed) {
      toast("필수 약관에 동의해야 회원가입할 수 있습니다.");
      return;
    }
  }

  const existingUser = state.users.find((item) => item.email === email);
  if (state.authMode === "signup" && existingUser) {
    toast("이미 가입된 이메일입니다.");
    return;
  }

  if (state.authMode === "login" && existingUser?.password_hash && existingUser.password_hash !== hashPassword(password)) {
    toast("이메일 또는 비밀번호가 올바르지 않습니다");
    return;
  }

  if (state.authMode === "login" && existingUser?.is_active === false) {
    toast("탈퇴 처리된 계정은 로그인할 수 없습니다.");
    return;
  }

  if (state.authMode === "signup") {
    if (!pendingSignup || pendingSignup.email !== email || pendingSignup.password !== password) {
      try {
        await apiPost("/api/auth/signup-code", { email });
      } catch (error) {
        toast(`인증코드 이메일 발송 실패: ${error.message}`);
        return;
      }
      pendingSignup = {
        email,
        password,
        expires_at: Date.now() + 10 * 60 * 1000
      };
      render();
      toast("인증코드를 이메일로 보냈습니다.");
      return;
    }

    if (Date.now() > pendingSignup.expires_at) {
      pendingSignup = null;
      render();
      toast("인증코드가 만료되었습니다. 다시 생성하세요.");
      return;
    }

    if (!normalizeVerificationCode(verificationCode)) {
      toast("이메일로 받은 인증코드를 입력하세요.");
      return;
    }
  }

  let remoteUser = null;
  let remoteSession = null;
  try {
    const mode = state.authMode === "signup" ? "signup" : "login";
    const payload = mode === "signup"
      ? { email, password, verificationCode: normalizeVerificationCode(verificationCode) }
      : { email, password };
    const auth = await apiPost(`/api/auth/${mode}`, payload);
    remoteUser = auth.user;
    remoteSession = auth.session || null;
    remoteUser.access_token = remoteSession?.access_token || "";
    state.apiStatus.auth = auth.source === "supabase" ? "connected" : "fallback";
    if (auth.warning) toast(`프로필 저장 경고: ${auth.warning}`);
  } catch (error) {
    if (await recoverFromAuthError(error, email, password, existingUser)) {
      return;
    }
    if (state.authMode === "signup" && isAlreadyRegisteredAuthError(error.message) && pendingSignup) {
      remoteUser = makeLocalAuthUser(email);
      remoteSession = null;
      state.apiStatus.auth = "fallback";
    } else if (state.authMode === "login" && isEmailNotConfirmedAuthError(error.message) && existingUser) {
      remoteUser = existingUser;
      remoteSession = null;
      state.apiStatus.auth = "fallback";
    } else if (state.authMode === "signup" && isSignupCodeResetRequired(error.message)) {
      pendingSignup = null;
      state.apiStatus.auth = "error";
      persist();
      render();
      toast(getAuthErrorMessage(state.authMode, error.message));
      return;
    } else {
      state.apiStatus.auth = "error";
      toast(getAuthErrorMessage(state.authMode, error.message) || `인증 API 오류: ${error.message}`);
      return;
    }
  }

  let user = existingUser;
  const userId = remoteUser?.id || user?.id || crypto.randomUUID();
  const fcmToken = await createFcmToken();
  if (!user) {
    user = {
      id: userId,
      email,
      password_hash: hashPassword(password),
      access_token: remoteUser?.access_token || "",
      fcm_token: fcmToken,
      fcm_tokens: [],
      is_active: true,
      deleted_at: null,
      session_expires_at: remoteSession?.expires_at ? remoteSession.expires_at * 1000 : Date.now() + 60 * 60 * 1000,
      created_at: remoteUser?.created_at || new Date().toISOString()
    };
    state.users.push(user);
  } else {
    user.id = userId;
    user.access_token = remoteUser?.access_token || user.access_token || "";
    user.password_hash ||= hashPassword(password);
    user.fcm_token = fcmToken;
    user.is_active = true;
    user.session_expires_at = remoteSession?.expires_at ? remoteSession.expires_at * 1000 : Date.now() + 60 * 60 * 1000;
  }

  await registerFcmTokenForUser(user);

  pendingSignup = null;
  state.currentUserId = user.id;
  state.selectedTab = "home";
  persist();
  render();
  toast(state.authMode === "signup" ? "계정 생성과 토큰 갱신을 처리했습니다." : "로그인하고 FCM 토큰을 갱신했습니다.");
}

function validatePassword(password) {
  const value = String(password || "");
  if (!value.trim()) return "비밀번호를 입력하세요.";
  if (/\s/.test(value)) return "비밀번호에는 공백을 사용할 수 없습니다.";
  if (value.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  return "";
}

async function recoverFromAuthError(error, email, password, existingUser) {
  if (state.authMode !== "login" || !isEmailNotConfirmedAuthError(error.message) || existingUser) {
    return false;
  }
  try {
    await apiPost("/api/auth/signup-code", { email });
  } catch (codeError) {
    state.apiStatus.auth = "error";
    toast(`Supabase 이메일 미확인 계정입니다. 인증코드 발송 실패: ${codeError.message}`);
    return true;
  }
  state.authMode = "signup";
  pendingSignup = {
    email,
    password,
    expires_at: Date.now() + 10 * 60 * 1000
  };
  state.apiStatus.auth = "fallback";
  persist();
  render();
  toast("Supabase 이메일 미확인 계정입니다. 방금 보낸 인증코드를 입력하면 앱 계정을 복구합니다.");
  return true;
}

function isEmailNotConfirmedAuthError(message) {
  return String(message || "").toLowerCase().includes("email not confirmed");
}

function isAlreadyRegisteredAuthError(message) {
  const value = String(message || "").toLowerCase();
  return value.includes("already registered")
    || value.includes("user already")
    || value.includes("already exists")
    || value.includes("already been registered");
}

function isSignupCodeResetRequired(message) {
  const value = String(message || "").toLowerCase();
  return value.includes("인증코드를 먼저")
    || value.includes("인증코드가 만료")
    || value.includes("verification code first")
    || value.includes("verification code expired");
}

function makeLocalAuthUser(email) {
  return {
    id: `local-${btoa(unescape(encodeURIComponent(email))).replace(/[=+/]/g, "")}`,
    email,
    access_token: "",
    created_at: new Date().toISOString()
  };
}

async function logout() {
  const user = currentUser();
  if (user) {
    await unregisterFcmTokenForUser(user);
    user.fcm_token = "";
  }
  state.currentUserId = null;
  state.selectedMedicine = null;
  state.selectedTab = "home";
  persist();
  render();
  toast("로그아웃했고 FCM 토큰을 비활성화했습니다.");
}

async function deactivateAccount() {
  const user = currentUser();
  if (!user) return;
  await unregisterFcmTokenForUser(user);
  user.is_active = false;
  user.deleted_at = new Date().toISOString();
  user.fcm_token = "";
  user.fcm_tokens = [];
  // is_active = false / deleted_at 방식으로 비활성화하며 복약 기록은 보존합니다.
  state.currentUserId = null;
  state.selectedTab = "home";
  persist();
  render();
  toast("회원 탈퇴가 비활성화 처리되었습니다.");
}

async function refreshFcmToken() {
  const user = currentUser();
  if (!user) return;
  user.fcm_token = await createFcmToken();
  await registerFcmTokenForUser(user);
  persist();
  render();
  toast("FCM 토큰을 새로 발급했습니다.");
}

async function createFcmToken() {
  const firebaseToken = await getBrowserFcmToken();
  return firebaseToken || `fcm_${crypto.randomUUID().replaceAll("-", "")}_${Date.now()}`;
}

async function registerFcmTokenForUser(user) {
  const deviceId = getDeviceId();
  user.fcm_tokens = upsertDeviceToken(user.fcm_tokens || [], deviceId, user.fcm_token);
  try {
    const result = await apiPost("/api/fcm/register", { userId: user.id, token: user.fcm_token, deviceId, accessToken: user.access_token || "" });
    state.apiStatus.fcm = result.source === "supabase" ? "connected" : "fallback";
  } catch {
    state.apiStatus.fcm = "error";
  }
}

async function unregisterFcmTokenForUser(user) {
  const deviceId = getDeviceId();
  user.fcm_tokens = (user.fcm_tokens || []).map((item) => item.device_id === deviceId ? { ...item, active: false } : item);
  try {
    const result = await apiPost("/api/fcm/unregister", { userId: user.id, deviceId, accessToken: user.access_token || "" });
    state.apiStatus.fcm = result.source === "supabase" ? "connected" : "fallback";
  } catch {
    state.apiStatus.fcm = "error";
  }
}

function getDeviceId() {
  const key = "yak-map-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `device_${crypto.randomUUID().replaceAll("-", "")}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function upsertDeviceToken(tokens, deviceId, token) {
  const next = tokens.filter((item) => item.device_id !== deviceId);
  next.push({
    device_id: deviceId,
    token,
    active: Boolean(token),
    updated_at: new Date().toISOString()
  });
  return next;
}

async function getBrowserFcmToken() {
  if (!runtimeConfig.integrations?.firebase?.configured || !("Notification" in window)) return "";
  if (Notification.permission !== "granted") return "";
  try {
    const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging.js")
    ]);
    const firebaseApp = getApps()[0] || initializeApp(runtimeConfig.firebase);
    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey: runtimeConfig.firebase.vapidKey,
      serviceWorkerRegistration
    });
    state.apiStatus.fcm = token ? "connected" : "fallback";
    return token || "";
  } catch {
    state.apiStatus.fcm = "error";
    return "";
  }
}

function lookupMedicine(query) {
  const normalized = normalize(query);
  return allMedicines().find((medicine) => {
    return normalize(medicine.item_name).includes(normalized)
      || (medicine.aliases || []).some((alias) => normalize(alias).includes(normalized) || normalized.includes(normalize(alias)));
  });
}

function findMedicineCandidates(query) {
  const normalized = normalize(query);
  if (!normalized) return [];
  return allMedicines()
    .map((medicine) => {
      const fields = [medicine.item_name, ...(medicine.aliases || [])].map(normalize);
      const direct = fields.some((field) => field.includes(normalized) || normalized.includes(field));
      const partial = fields.some((field) => field.slice(0, Math.max(2, normalized.length)).includes(normalized.slice(0, 2)));
      const similarity = Math.max(...fields.map((field) => medicineNameSimilarity(normalized, field)));
      return { medicine, score: direct ? 3 : similarity >= 0.55 ? 2 : partial ? 1 : 0, similarity };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.similarity - a.similarity)
    .map((item) => item.medicine)
    .slice(0, 3);
}

function medicineNameSimilarity(input, candidate) {
  if (!input || !candidate) return 0;
  if (candidate.includes(input) || input.includes(candidate)) return 1;
  const base = candidate.length > input.length + 2 ? candidate.slice(0, input.length + 2) : candidate;
  const distance = levenshteinDistance(input, base);
  return 1 - distance / Math.max(input.length, base.length);
}

function levenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

async function lookupMedicineRemote(query) {
  const cached = lookupMedicine(query);
  if (cached) {
    state.apiStatus.medicine = "cache";
    return { ...cached, source: "cache" };
  }

  try {
    const medicine = await apiGet(`/api/medicine/search?q=${encodeURIComponent(query)}`);
    state.apiStatus.medicine = medicine.source === "mfds" ? "connected" : "fallback";
    if (medicine.not_found) return null;
    if (medicine.source === "mfds" && !lookupMedicine(medicine.item_name)) {
      persistMedicineCache(medicine);
    }
    return medicine;
  } catch (error) {
    state.apiStatus.medicine = "error";
    toast(`의약품 API 오류: ${error.message}`);
    return lookupMedicine(query);
  }
}

function persistMedicineCache(medicine) {
  const cached = { ...medicine, aliases: [medicine.item_name, ...(medicine.aliases || [])] };
  state.medicine_cache = [
    ...(state.medicine_cache || []).filter((item) => item.item_name !== cached.item_name),
    cached
  ];
  persist();
  return cached;
}

function ocrCandidateMedicines(names) {
  return names.map((name) => ({
    item_name: name,
    aliases: [name],
    category: "확인 필요",
    is_prescription: false,
    efficacy: "OCR에서 추출한 후보입니다. 식약처 검색으로 정확한 분류를 확인하세요.",
    side_effects: "약사 또는 의사에게 확인한 뒤 복용하세요.",
    usage: ""
  }));
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function extractMedicines(text) {
  const normalizedText = normalize(text);
  return allMedicines().filter((medicine) => {
    return normalizedText.includes(normalize(medicine.item_name))
      || (medicine.aliases || []).some((alias) => normalizedText.includes(normalize(alias)));
  });
}

function normalizeVerificationCode(code) {
  return String(code || "").replace(/\D/g, "");
}

function hashPassword(password) {
  return btoa(unescape(encodeURIComponent(password)));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("파일을 읽을 수 없습니다.")));
    reader.readAsDataURL(file);
  });
}

async function prepareImageForOcrDataUrl(source) {
  const originalDataUrl = typeof source === "string" ? source : await readFileAsDataUrl(source);
  if (typeof source !== "string" && !source.type.startsWith("image/")) return originalDataUrl;
  try {
    const image = await loadImage(originalDataUrl);
    const targetWidth = Math.min(2400, Math.max(1600, image.naturalWidth));
    const scale = targetWidth / image.naturalWidth;
    const targetHeight = Math.round(image.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return originalDataUrl;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("이미지를 처리할 수 없습니다.")), { once: true });
    image.src = src;
  });
}

async function ensureCameraPermission() {
  if (!navigator.permissions?.query) return true;
  try {
    const permission = await navigator.permissions.query({ name: "camera" });
    if (permission.state === "denied") {
      toast("카메라 권한이 필요합니다. 브라우저 설정에서 카메라 접근을 허용하세요.");
      return false;
    }
  } catch {
    return true;
  }
  return true;
}

function handleScheduleSubmit(event) {
  event.preventDefault();
  const medicineName = document.querySelector("#scheduleMedicine").value.trim();
  if (!medicineName) {
    toast("약 이름을 입력하세요.");
    return;
  }

  const medicine = lookupMedicine(medicineName) || state.selectedMedicine;
  const dosageTimes = normalizeDosageTimes(document.querySelector("#dosageTimes").value);
  const startDate = document.querySelector("#startDate").value;
  const endDate = document.querySelector("#endDate").value;
  const remainingPillsValue = document.querySelector("#remainingPills").value;
  const remainingPills = Number(remainingPillsValue);
  const doseAmount = Number(document.querySelector("#doseAmount").value || 1);

  if (!medicine) {
    toast("입력한 약을 찾을 수 없습니다. 검색 결과 없음");
    return;
  }

  if (dosageTimes.length === 0) {
    toast("복용 시간을 입력하세요.");
    return;
  }

  if (dosageTimes.length > 5) {
    toast("하루 최대 5회까지 등록할 수 있습니다.");
    return;
  }

  if (new Set(dosageTimes).size !== dosageTimes.length) {
    toast("복용 시간이 중복되었습니다.");
    return;
  }

  if (!startDate || !endDate) {
    toast("복용 날짜를 입력하세요.");
    return;
  }

  if (endDate < startDate) {
    toast("종료일은 시작일보다 빠를 수 없습니다.");
    return;
  }

  if (remainingPillsValue === "") {
    toast("남은 알약 수를 입력하세요.");
    return;
  }

  if (!Number.isFinite(remainingPills) || remainingPills < 1) {
    toast("남은 알약 수는 1 이상으로 입력하세요.");
    return;
  }

  if (remainingPills > 999) {
    toast("남은 알약 수는 999개 이하로 입력하세요.");
    return;
  }

  if (!Number.isFinite(doseAmount) || doseAmount < 1) {
    toast("1회 복용량은 1개 이상으로 입력하세요.");
    return;
  }

  const editing = state.schedules.find((item) => item.id === state.editingScheduleId);
  if (!editing && userSchedules().some((schedule) => schedule.medicine_name === medicine.item_name)) {
    toast("이미 등록된 약입니다.");
    return;
  }

  const nextSchedule = {
    id: editing?.id || Date.now(),
    user_id: state.currentUserId,
    medicine_name: medicine.item_name,
    is_prescription: medicine.category === "전문",
    dosage_times: dosageTimes,
    start_date: startDate,
    end_date: endDate,
    remaining_pills: remainingPills,
    dose_amount: doseAmount,
    initial_pills: Math.max(editing?.initial_pills || remainingPills, remainingPills),
    last_notified_at: editing?.last_notified_at || ""
  };

  if (editing) {
    Object.assign(editing, nextSchedule);
    state.editingScheduleId = null;
  } else {
    state.schedules.push(nextSchedule);
  }
  if (!navigator.onLine) {
    queueOfflineMutation("schedule", nextSchedule);
  }
  persist();
  render();
  if (!navigator.onLine) {
    toast("오프라인 상태입니다. 스케줄을 로컬 저장하고 재시도 대기열에 넣었습니다.");
  } else {
    toast(editing ? "스케줄 수정 완료" : "복약 스케줄을 등록했습니다.");
  }
}

function queueOfflineMutation(type, payload) {
  state.pending_mutations = [
    ...(state.pending_mutations || []),
    {
      id: crypto.randomUUID(),
      type,
      payload,
      created_at: new Date().toISOString()
    }
  ];
}

function flushPendingMutations() {
  if (!(state.pending_mutations || []).length) return;
  state.pending_mutations = [];
  persist();
  toast("대기 중인 저장 작업을 재시도했습니다.");
}

function normalizeDosageTimes(value) {
  return String(value || "")
    .split(",")
    .map((time) => time.trim())
    .filter(Boolean)
    .filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
}

function markDoseTaken(id) {
  const schedule = state.schedules.find((item) => item.id === id);
  if (!schedule) return;
  if (schedule.remaining_pills <= 0) {
    toast("남은 약이 0개라 복용 체크를 할 수 없습니다. 재구매 또는 재방문이 필요합니다.");
    return;
  }
  const doseTime = currentDoseSlot(schedule);
  if (hasDoseRecord(schedule.id, today, doseTime)) {
    toast("이미 오늘 복용 기록이 있습니다.");
    return;
  }
  const doseAmount = schedule.dose_amount || 1;
  if (schedule.remaining_pills < doseAmount) {
    toast("남은 약 수량이 1회 복용량보다 부족합니다.");
    return;
  }
  schedule.remaining_pills = Math.max(0, schedule.remaining_pills - doseAmount);
  addDoseRecord(schedule, "taken", doseTime);
  persist();
  render();
  toast(schedule.remaining_pills <= dailyDoseAmount(schedule) ? "복용 완료. 1일분 이하라 재구매가 필요합니다." : "복용 완료 처리했습니다.");
}

function markDoseMissed(id) {
  const schedule = state.schedules.find((item) => item.id === id);
  if (!schedule) return;
  const doseTime = currentDoseSlot(schedule);
  if (hasDoseRecord(schedule.id, today, doseTime)) {
    toast("이미 오늘 복용 기록이 있습니다.");
    return;
  }
  addDoseRecord(schedule, "missed", doseTime);
  persist();
  render();
  toast("미복용 기록을 저장했습니다.");
}

function currentDoseSlot(schedule, now = new Date()) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const times = [...(schedule.dosage_times || [])].sort();
  return times.find((time) => toMinutes(time) >= currentMinutes) || times.at(-1) || "시간 미지정";
}

function hasDoseRecord(scheduleId, date, doseTime = "") {
  return (state.dose_records || []).some((record) => {
    return record.schedule_id === scheduleId
      && record.date === date
      && (record.dose_time || "") === doseTime;
  });
}

function addDoseRecord(schedule, status, doseTime) {
  state.dose_records = [
    ...(state.dose_records || []),
    {
      id: Date.now(),
      user_id: state.currentUserId,
      schedule_id: schedule.id,
      medicine_name: schedule.medicine_name,
      date: today,
      dose_time: doseTime,
      dose_amount: schedule.dose_amount || 1,
      status,
      created_at: new Date().toISOString()
    }
  ];
}

function dailyDoseAmount(schedule) {
  return (schedule.dosage_times?.length || 0) * (schedule.dose_amount || 1);
}

function deleteSchedule(id) {
  state.schedules = state.schedules.filter((item) => item.id !== id);
  persist();
  render();
  toast("스케줄을 삭제했습니다.");
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isWithinSchedule(schedule, date) {
  return schedule.start_date <= date && date <= schedule.end_date && schedule.remaining_pills > 0;
}

function nextDose(schedules) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const candidates = schedules.flatMap((schedule) => {
    return schedule.dosage_times.map((time) => ({
      name: schedule.medicine_name,
      time,
      minutes: toMinutes(time)
    }));
  });
  return candidates.find((dose) => dose.minutes >= currentMinutes) || candidates[0] || null;
}

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    toast("이 브라우저는 알림을 지원하지 않습니다.");
    return;
  }
  const result = await Notification.requestPermission();
  if (result === "granted" && currentUser()) {
    await refreshFcmToken();
  }
  toast(result === "granted" ? "복약 알림 권한을 허용했습니다." : "알림 권한이 허용되지 않았습니다.");
}

function startReminderLoop() {
  clearInterval(reminderInterval);
  reminderInterval = setInterval(checkDueReminders, 30_000);
  checkDueReminders();
}

function checkDueReminders() {
  if (!currentUser()) return;
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5);
  userSchedules().forEach((schedule) => {
    if (!isWithinSchedule(schedule, today)) return;
    const key = `${today}-${hhmm}`;
    if (schedule.dosage_times.includes(hhmm) && schedule.last_notified_at !== key) {
      schedule.last_notified_at = key;
      addInAppNotification(schedule, hhmm);
      persist();
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("약-맵 복약 알림", {
            body: `${schedule.medicine_name} 복용 시간입니다.`,
            icon: "./assest/img/erd.webp"
          });
        } catch (error) {
          logNotificationFailure(schedule, error);
        }
      }
    }
  });
}

function addInAppNotification(schedule, doseTime) {
  state.in_app_notifications = [
    ...(state.in_app_notifications || []),
    {
      id: crypto.randomUUID(),
      user_id: state.currentUserId,
      schedule_id: schedule.id,
      medicine_name: schedule.medicine_name,
      date: today,
      dose_time: doseTime,
      created_at: new Date().toISOString()
    }
  ].slice(-20);
  toast(`${schedule.medicine_name} 앱 내부 알림: 복용 시간입니다.`);
}

function logNotificationFailure(schedule, error) {
  state.notification_failures = [
    ...(state.notification_failures || []),
    {
      id: crypto.randomUUID(),
      user_id: state.currentUserId,
      schedule_id: schedule.id,
      medicine_name: schedule.medicine_name,
      reason: error?.message || "알림 발송 실패",
      created_at: new Date().toISOString()
    }
  ];
  persist();
  // 알림 발송 실패 로그는 발표용 MVP에서 로컬 로그로 보관합니다.
}

function locateUser() {
  if (!navigator.geolocation) {
    state.locationLabel = "위치 기능을 지원하지 않는 브라우저입니다.";
    persist();
    render();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.currentPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      resetNearbyKakaoSearch();
      state.locationPermissionDenied = false;
      state.locationLabel = `현재 위치 ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
      persist();
      render();
    },
    () => {
      state.currentPosition = null;
      resetNearbyKakaoSearch();
      state.locationPermissionDenied = true;
      state.locationLabel = "위치 권한이 없어 샘플 위치를 사용합니다.";
      persist();
      render();
    },
    { enableHighAccuracy: true, timeout: 5000 }
  );
}

function requestLocationOnAppLaunch() {
  state.currentPosition = null;
  resetNearbyKakaoSearch();
  state.locationLabel = "위치 권한 확인 중입니다.";
  state.locationPermissionDenied = false;
  locateUser();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  const template = document.querySelector("#toastTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2600);
}
