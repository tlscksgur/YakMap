# 약-맵 Yak-Map

공공데이터 기반 지능형 복약 관리 및 약국/병원 안내 서비스의 정적 PWA MVP입니다.
외부 API 키가 없어도 로그인, 약 판별, OCR 텍스트 매칭, 복약 스케줄, 알림 권한, 주변 판매처 안내 흐름을 브라우저에서 바로 확인할 수 있습니다.

## 실행

```bash
npm start
```

브라우저에서 `http://localhost:4173`을 열면 됩니다. 정적 파일이라 `index.html`을 직접 열어도 대부분 동작하지만, 서비스 워커와 PWA 설치는 로컬 서버에서 확인하는 것이 좋습니다.

## 구현 범위

- 이메일 회원가입/로그인 흐름과 로그인 시 FCM 토큰 갱신 시뮬레이션
- 로그아웃 시 FCM 토큰 비활성화
- OCR 텍스트 입력 후 의약품 캐시 기반 약 이름 자동 매칭
- 식약처 API 결과를 대체하는 로컬 `medicine_cache` 샘플로 전문/일반 판별
- 일반약은 약국, 전문약은 병원으로 이어지는 구매/진료 가이드
- 복용 시간 배열, 시작일, 종료일, 잔여 알약 수를 갖는 복약 스케줄
- 복용 체크 시 잔여 알약 차감 및 1일분 이하 경고
- 주변 영업 중 약국, 병원, 심야 상비약 편의점 지도형 UI와 카카오맵 검색 링크
- 따뜻한 크림 배경과 코랄/피치 중심 디자인 시스템

## 실제 API 연결 지점

- `app.js`의 `medicineCache`와 `lookupMedicine()`을 식품의약품안전처 e약은요 API 호출로 교체
- `stores` 배열과 지도 필터를 국립중앙의료원 약국 정보 조회, 상비약 판매처 데이터, 카카오맵 SDK로 교체
- `authenticate()`, `refreshFcmToken()`, `logout()`을 Supabase Auth와 Firebase Messaging으로 교체
- `schema.sql`을 Supabase SQL Editor에 적용한 뒤 Row Level Security 정책 추가
- 자세한 교체 지점은 [docs/api-integration.md](docs/api-integration.md)에 정리했습니다.

## ERD

기획 ERD는 [assest/img/erd.webp](assest/img/erd.webp)에 있습니다. 이미지 기준으로 `safe_store_list`까지 포함해 SQL 스키마에 반영했습니다.

## 검증

```bash
npm test
```
