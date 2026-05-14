export const sampleMedicines = [
  {
    item_name: "타이레놀정500mg",
    aliases: ["타이레놀", "아세트아미노펜"],
    category: "일반",
    is_prescription: false,
    efficacy: "해열 및 감기, 두통, 치통, 근육통 완화",
    side_effects: "간 질환이 있거나 음주 후 복용 시 전문가 상담이 필요합니다.",
    usage: "성인은 필요 시 1회 1~2정을 복용합니다. 제품 설명서와 전문가 지시를 우선하세요."
  },
  {
    item_name: "게보린정",
    aliases: ["게보린"],
    category: "일반",
    is_prescription: false,
    efficacy: "두통, 치통, 생리통 등 통증 완화",
    side_effects: "카페인 민감자와 위장 장애가 있는 경우 주의하세요.",
    usage: "복용 간격과 1일 최대 복용량은 제품 설명서를 확인하세요."
  },
  {
    item_name: "아목시실린캡슐",
    aliases: ["아목시실린", "항생제"],
    category: "전문",
    is_prescription: true,
    efficacy: "세균 감염 치료에 쓰이는 항생제",
    side_effects: "처방 없이 임의 복용하거나 중단하지 마세요.",
    usage: "의사의 처방 용법과 복용 기간을 지켜야 합니다."
  },
  {
    item_name: "로수바스타틴정",
    aliases: ["로수바스타틴", "고지혈증약"],
    category: "전문",
    is_prescription: true,
    efficacy: "콜레스테롤 조절 및 심혈관 위험 감소",
    side_effects: "근육통, 간 수치 이상이 있으면 진료가 필요합니다.",
    usage: "처방된 용량을 매일 같은 시간에 복용하세요."
  },
  {
    item_name: "판콜에이내복액",
    aliases: ["판콜", "감기약"],
    category: "일반",
    is_prescription: false,
    efficacy: "감기 증상 완화",
    side_effects: "졸림이 올 수 있어 운전 전 복용에 주의하세요.",
    usage: "제품 설명서의 연령별 용법을 따르세요."
  }
];

export const sampleStores = [
  {
    id: "p1",
    type: "pharmacy",
    name: "코랄약국",
    address: "서울특별시 중구 세종대로 110",
    phone: "02-123-4567",
    distance: 0.4,
    open: true,
    hours: "08:30-21:30",
    lat: 37.5665,
    lng: 126.978,
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
    lat: 37.5637,
    lng: 126.9826,
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
    lat: 37.5702,
    lng: 126.983,
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
    lat: 37.5673,
    lng: 126.98,
    x: 78,
    y: 62
  }
];

export const sampleOcrText = "타이레놀정500mg\n판콜에이내복액\n아침, 저녁 식후 30분\n3일분";
