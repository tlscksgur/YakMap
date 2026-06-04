import { getAuthErrorMessage } from "./lib/auth-errors.mjs";

const STORAGE_KEY = "yak-map-state-v1";

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
  medicine_cache: [],
  selectedTab: "home",
  authMode: "login",
  selectedMedicine: null,
  mapFilter: "pharmacy",
  mapPlaces: [],
  apiStatus: {},
  ocrText: "타이레놀정500mg\n아침, 저녁 식후 30분\n3일분",
  locationLabel: "현재 위치 확인 전"
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

const app = document.querySelector("#app");
const appHero = document.querySelector("#appHero");
const appTabbar = document.querySelector("#appTabbar");

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", async () => {
    state.selectedTab = button.dataset.tab;
    persist();
    if (state.selectedTab === "map") await loadStoresForFilter(state.mapFilter);
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
  render();
  startReminderLoop();
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      return { ...defaultState, ...saved };
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

function userSchedules() {
  return state.schedules
    .filter((schedule) => schedule.user_id === state.currentUserId)
    .sort((a, b) => a.end_date.localeCompare(b.end_date));
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
        <h2>${escapeHtml(user.email.split("@")[0])}님</h2>
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
      setMapStatus(`카카오맵 로딩 실패: ${error.message}`);
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
    ["Firebase FCM", integrations.firebase?.configured, state.apiStatus.fcm]
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
        `}
        <div class="auth-action-row">
          <button class="primary-button" type="submit">${isLogin ? "로그인" : isWaitingForCode ? "인증하고 회원가입" : "인증코드 이메일 발송"}</button>
          ${isWaitingForCode ? `<button class="secondary-button" type="button" id="resetSignupButton">다른 이메일로 가입</button>` : ""}
        </div>
      </form>
    </section>
  `;
}

function renderHome() {
  const schedules = userSchedules();
  const dueToday = schedules.filter((schedule) => isWithinSchedule(schedule, today));
  const lowStock = schedules.filter((schedule) => schedule.remaining_pills <= schedule.dosage_times.length);
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
          <h2>OCR 약 봉투 스캔</h2>
          <p>촬영 텍스트를 추출했다고 가정하고 자동 매칭합니다.</p>
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
  const sourceStores = state.mapPlaces.length ? state.mapPlaces : stores;
  const filtered = sourceStores.filter((store) => {
    if (state.mapFilter === "all") return store.open;
    return store.type === state.mapFilter && store.open;
  });
  const nightNotice = filtered.length
    ? ""
    : `<div class="card empty-state">영업 중인 약국이 부족합니다. 심야에는 24시간 상비약 판매처 또는 응급의료 안내를 확인하세요.</div>`;

  return `
    <section class="section-heading">
      <div>
        <h2>스마트 길찾기</h2>
        <p>${state.locationLabel}</p>
      </div>
      <button class="text-button" type="button" id="locateButton">위치 확인</button>
    </section>
    <section class="card">
      <div class="segmented" role="tablist" aria-label="판매처 필터">
        ${filterButton("pharmacy", "약국")}
        ${filterButton("hospital", "병원")}
      </div>
      <div class="segmented" role="tablist" aria-label="상비약 필터" style="margin-top: 8px;">
        ${filterButton("store", "심야 편의점")}
        ${filterButton("all", "전체 영업중")}
      </div>
      <div class="map-panel" aria-label="주변 판매처 지도">
        <div id="kakaoMap" class="kakao-map"></div>
        <div id="mapStatus" class="map-status">${renderMapStatus()}</div>
        ${filtered.map(renderPin).join("")}
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
      </div>
      <div>
        <p class="muted">FCM 토큰</p>
        <div class="token-box">${escapeHtml(user.fcm_token || "로그인 시 토큰이 없습니다.")}</div>
      </div>
      <div class="pill-row">
        <span class="status-chip badge general">Supabase Auth 준비</span>
        <span class="status-chip badge">FCM 갱신 흐름 구현</span>
        <span class="status-chip badge warning">외부 API 키 필요</span>
      </div>
      <button class="secondary-button" type="button" id="refreshTokenButton">FCM 토큰 다시 갱신</button>
      <button class="secondary-button" id="notifyPermissionButton" type="button">알림 허용</button>
      <button class="text-button" type="button" id="logoutButton">로그아웃</button>
    </section>
  `;
}

function renderMedicineSearch() {
  const selected = state.selectedMedicine;
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
    ${selected ? renderMedicineResult(selected) : ""}
  `;
}

function renderOcrPanel() {
  return `
    <div class="scan-drop">
      <div class="field">
        <label for="ocrImage">약 봉투/처방전 이미지</label>
        <input id="ocrImage" type="file" accept="image/*" />
      </div>
      <div class="field">
        <label for="ocrText">추출된 텍스트</label>
        <textarea id="ocrText" placeholder="약 봉투 OCR 결과를 입력하거나 샘플을 사용하세요.">${escapeHtml(state.ocrText)}</textarea>
      </div>
      <div class="two-col">
        <button class="secondary-button" type="button" id="useSampleOcrButton">샘플 입력</button>
        <button class="primary-button" type="button" id="scanOcrButton">약 이름 매칭</button>
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
  const options = allMedicines();
  if (prefill && !options.some((medicine) => medicine.item_name === prefill)) {
    options.unshift({
      item_name: prefill,
      category: state.selectedMedicine?.category || "확인 필요"
    });
  }
  const medicineOptions = options
    .map((medicine) => `<option value="${medicine.item_name}" ${medicine.item_name === prefill ? "selected" : ""}>${medicine.item_name}</option>`)
    .join("");

  return `
    <form class="form-grid" id="scheduleForm">
      <div class="field">
        <label for="scheduleMedicine">약 이름</label>
        <select id="scheduleMedicine" required>${medicineOptions}</select>
      </div>
      <div class="field">
        <label for="dosageTimes">복용 시간</label>
        <input id="dosageTimes" type="text" value="09:00, 13:00, 19:00" placeholder="09:00, 13:00, 19:00" required />
      </div>
      <div class="two-col">
        <div class="field">
          <label for="startDate">시작일</label>
          <input id="startDate" type="date" value="${today}" required />
        </div>
        <div class="field">
          <label for="durationDays">복용 일수</label>
          <input id="durationDays" type="number" min="1" value="3" required />
        </div>
      </div>
      <div class="field">
        <label for="remainingPills">남은 알약 수</label>
        <input id="remainingPills" type="number" min="1" value="9" required />
      </div>
      <button class="primary-button" type="submit">스케줄 등록</button>
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
  const low = schedule.remaining_pills <= schedule.dosage_times.length;
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
      <p class="muted">남은 알약 ${schedule.remaining_pills}개</p>
      <div class="action-row">
        ${allowCheck ? `<button class="primary-button" type="button" data-take="${schedule.id}">복용 완료</button>` : ""}
        <button class="text-button" type="button" data-delete="${schedule.id}">삭제</button>
      </div>
    </article>
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
  return `
    <article class="store-item">
      <div class="item-top">
        <div>
          <h3>${store.name}</h3>
          <p>${store.address}</p>
        </div>
        <span class="badge ${store.type === "hospital" ? "prescription" : "general"}">${label}</span>
      </div>
      <p class="muted">${store.distance}km · ${store.hours} · ${store.phone}</p>
      <button class="secondary-button" type="button" data-route="${store.id}">길찾기 앱 열기</button>
    </article>
  `;
}

async function loadStoresForFilter(filter) {
  try {
    const params = "region1=서울특별시&region2=중구";
    if (filter === "hospital") {
      const hospitals = await apiGet(`/api/hospitals?${params}`);
      state.mapPlaces = hospitals.items || [];
      state.apiStatus.stores = hospitals.source === "nmc" ? "connected" : "fallback";
      return;
    }

    if (filter === "pharmacy" || filter === "store" || filter === "all") {
      const [pharmacies, hospitals] = await Promise.all([
        apiGet(`/api/pharmacies?${params}`),
        filter === "all" ? apiGet(`/api/hospitals?${params}`) : Promise.resolve({ items: [] })
      ]);
      const places = [...(pharmacies.items || []), ...(hospitals.items || [])];
      state.mapPlaces = filter === "store" ? places.filter((place) => place.type === "store") : places;
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
      existing.addEventListener("load", () => window.kakao.maps.load(() => resolve(true)), { once: true });
      existing.addEventListener("error", () => reject(new Error("SDK 스크립트 로드 실패")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.dataset.kakaoMapSdk = "true";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(runtimeConfig.kakaoMapKey)}&libraries=services&autoload=false`;
    script.addEventListener("load", () => window.kakao.maps.load(() => resolve(true)), { once: true });
    script.addEventListener("error", () => reject(new Error("SDK 스크립트 로드 실패")), { once: true });
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

  const places = state.mapPlaces.length ? state.mapPlaces : stores;
  const center = new window.kakao.maps.LatLng(places[0]?.lat || 37.5665, places[0]?.lng || 126.978);
  const map = new window.kakao.maps.Map(mapRoot, { center, level: 5 });
  mapRoot.closest(".map-panel")?.classList.add("has-live-map");
  places.forEach((place) => {
    if (!place.lat || !place.lng) return;
    const marker = new window.kakao.maps.Marker({
      map,
      position: new window.kakao.maps.LatLng(place.lat, place.lng),
      title: place.name
    });
    const info = new window.kakao.maps.InfoWindow({ content: `<div style="padding:6px 8px;font-size:12px;">${escapeHtml(place.name)}</div>` });
    window.kakao.maps.event.addListener(marker, "click", () => info.open(map, marker));
  });
  state.apiStatus.kakao = "connected";
  setMapStatus("");
}

function renderMapStatus() {
  if (state.apiStatus.kakao === "connected") return "";
  if (state.apiStatus.kakao === "error") {
    return "카카오맵 로딩 실패. Kakao Developers Web 플랫폼에 http://localhost:4173 도메인을 등록했는지 확인하세요.";
  }
  if (!runtimeConfig.integrations?.kakaoMap?.configured) {
    return "카카오맵 JavaScript 키가 필요합니다. 현재는 위치 마커 UI로 표시합니다.";
  }
  return "카카오맵 로딩 중입니다.";
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
    await authenticate(email, password, String(form.get("verificationCode") || ""));
  });

  document.querySelector("#resetSignupButton")?.addEventListener("click", () => {
    pendingSignup = null;
    render();
  });
}

function bindViewEvents() {
  document.querySelector("#medicineSearchForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = document.querySelector("#medicineSearch").value;
    const medicine = await lookupMedicineRemote(query);
    if (!medicine) {
      toast("검색 결과 없음");
      return;
    }
    state.selectedMedicine = medicine;
    persist();
    render();
  });

  document.querySelector("#scanOcrButton")?.addEventListener("click", async () => {
    state.ocrText = document.querySelector("#ocrText").value;
    const imageFile = document.querySelector("#ocrImage")?.files?.[0];
    const imageBase64 = imageFile ? await readFileAsDataUrl(imageFile) : "";
    let matches = extractMedicines(state.ocrText);
    try {
      const ocr = await apiPost("/api/ocr", { imageBase64, text: state.ocrText });
      state.apiStatus.ocr = ocr.source === "openrouter-ocr" ? "connected" : "fallback";
      state.ocrText = ocr.text || state.ocrText;
      matches = ocr.medicines?.length ? ocr.medicines : matches;
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
  });

  document.querySelector("#useSampleOcrButton")?.addEventListener("click", () => {
    state.ocrText = "타이레놀정500mg\n판콜에이내복액\n아침 저녁 식후 30분";
    persist();
    render();
  });

  document.querySelector("#scheduleForm")?.addEventListener("submit", handleScheduleSubmit);

  bindMedicineActionEvents(document);

  document.querySelectorAll("[data-take]").forEach((button) => {
    button.addEventListener("click", () => markDoseTaken(Number(button.dataset.take)));
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteSchedule(Number(button.dataset.delete)));
  });

  document.querySelectorAll("[data-map-filter]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.mapFilter = button.dataset.mapFilter;
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

  document.querySelectorAll("[data-store-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const store = [...state.mapPlaces, ...stores].find((item) => item.id === button.dataset.storeId);
      toast(`${store.name} · ${store.distance}km · ${store.hours} · ${store.phone}`);
    });
  });

  document.querySelector("#locateButton")?.addEventListener("click", locateUser);
  document.querySelector("#refreshStoresButton")?.addEventListener("click", async () => {
    await loadStoresForFilter(state.mapFilter);
    render();
    toast("판매처 정보를 갱신했습니다.");
  });
  document.querySelector("#refreshTokenButton")?.addEventListener("click", () => refreshFcmToken());
  document.querySelector("#logoutButton")?.addEventListener("click", () => logout());

  bindUtilityEvents();
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

  root.querySelectorAll("[data-guide]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTab = "map";
      state.mapFilter = button.dataset.guide;
      persist();
      render();
    });
  });
}

async function authenticate(email, password, verificationCode = "") {
  if (!email || !password || password.length < 8) {
    toast("이메일과 8자 이상 비밀번호를 입력하세요.");
    return;
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
  try {
    const mode = state.authMode === "signup" ? "signup" : "login";
    const auth = await apiPost(`/api/auth/${mode}`, { email, password });
    remoteUser = auth.user;
    remoteUser.access_token = auth.session?.access_token || "";
    state.apiStatus.auth = auth.source === "supabase" ? "connected" : "fallback";
  } catch (error) {
    state.apiStatus.auth = "error";
    toast(getAuthErrorMessage(state.authMode, error.message) || `인증 API 오류: ${error.message}`);
    return;
  }

  if (state.authMode === "signup" && !remoteUser?.access_token) {
    pendingSignup = null;
    persist();
    render();
    toast("회원가입 요청 완료. Supabase 이메일 확인 설정이 켜져 있으면 로그인 전 확인이 필요합니다.");
    return;
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
      created_at: remoteUser?.created_at || new Date().toISOString()
    };
    state.users.push(user);
  } else {
    user.id = userId;
    user.access_token = remoteUser?.access_token || user.access_token || "";
    user.password_hash ||= hashPassword(password);
    user.fcm_token = fcmToken;
  }

  await registerFcmTokenForUser(user);

  pendingSignup = null;
  state.currentUserId = user.id;
  state.selectedTab = "home";
  persist();
  render();
  toast(state.authMode === "signup" ? "계정 생성과 토큰 갱신을 처리했습니다." : "로그인하고 FCM 토큰을 갱신했습니다.");
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
  try {
    const result = await apiPost("/api/fcm/register", { userId: user.id, token: user.fcm_token, accessToken: user.access_token || "" });
    state.apiStatus.fcm = result.source === "supabase" ? "connected" : "fallback";
  } catch {
    state.apiStatus.fcm = "error";
  }
}

async function unregisterFcmTokenForUser(user) {
  try {
    const result = await apiPost("/api/fcm/unregister", { userId: user.id, accessToken: user.access_token || "" });
    state.apiStatus.fcm = result.source === "supabase" ? "connected" : "fallback";
  } catch {
    state.apiStatus.fcm = "error";
  }
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
      state.medicine_cache = [
        ...(state.medicine_cache || []),
        { ...medicine, aliases: [medicine.item_name] }
      ];
      persist();
    }
    return medicine;
  } catch (error) {
    state.apiStatus.medicine = "error";
    toast(`의약품 API 오류: ${error.message}`);
    return lookupMedicine(query);
  }
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

function handleScheduleSubmit(event) {
  event.preventDefault();
  const medicineName = document.querySelector("#scheduleMedicine").value;
  const medicine = lookupMedicine(medicineName) || state.selectedMedicine;
  const dosageTimes = document.querySelector("#dosageTimes").value
    .split(",")
    .map((time) => time.trim())
    .filter(Boolean);
  const startDate = document.querySelector("#startDate").value;
  const durationDays = Number(document.querySelector("#durationDays").value);
  const remainingPills = Number(document.querySelector("#remainingPills").value);

  if (!medicine || dosageTimes.length === 0 || !startDate || durationDays < 1 || remainingPills < 1) {
    toast("스케줄 값을 다시 확인하세요.");
    return;
  }

  state.schedules.push({
    id: Date.now(),
    user_id: state.currentUserId,
    medicine_name: medicine.item_name,
    is_prescription: medicine.category === "전문",
    dosage_times: dosageTimes,
    start_date: startDate,
    end_date: addDays(startDate, durationDays - 1),
    remaining_pills: remainingPills,
    initial_pills: remainingPills,
    last_notified_at: ""
  });
  persist();
  render();
  toast("복약 스케줄을 등록했습니다.");
}

function markDoseTaken(id) {
  const schedule = state.schedules.find((item) => item.id === id);
  if (!schedule) return;
  schedule.remaining_pills = Math.max(0, schedule.remaining_pills - 1);
  persist();
  render();
  toast(schedule.remaining_pills <= schedule.dosage_times.length ? "복용 완료. 1일분 이하라 재구매가 필요합니다." : "복용 완료 처리했습니다.");
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
  if (!currentUser() || !("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5);
  userSchedules().forEach((schedule) => {
    if (!isWithinSchedule(schedule, today)) return;
    const key = `${today}-${hhmm}`;
    if (schedule.dosage_times.includes(hhmm) && schedule.last_notified_at !== key) {
      schedule.last_notified_at = key;
      persist();
      new Notification("약-맵 복약 알림", {
        body: `${schedule.medicine_name} 복용 시간입니다.`,
        icon: "./assest/img/erd.webp"
      });
    }
  });
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
      state.locationLabel = `현재 위치 ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
      persist();
      render();
    },
    () => {
      state.locationLabel = "위치 권한이 없어 샘플 위치를 사용합니다.";
      persist();
      render();
    },
    { enableHighAccuracy: true, timeout: 5000 }
  );
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
