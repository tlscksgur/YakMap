# 약-맵 Yak-Map

공공데이터 기반 지능형 복약 관리 및 약국/병원 안내 서비스의 PWA MVP입니다.
Node 프록시 서버가 외부 API 키를 보호하고, 키가 없을 때는 샘플 fallback으로 전체 기능 흐름을 확인할 수 있습니다.

## 실행

```bash
npm start
```

브라우저에서 `http://localhost:4173`을 열면 됩니다.

실 API를 쓰려면 `.env.example`을 참고해 `.env`를 만들고 키를 넣은 뒤 서버를 다시 시작하세요.

## 구현 범위

- 이메일 회원가입/로그인 흐름과 로그인 시 FCM 토큰 갱신
- Supabase anon 키가 있으면 Auth 호출, service role 키가 있으면 서버에서 `users` 프로필/FCM 저장
- 이미지 업로드 또는 OCR 텍스트 입력 후 약 이름 자동 매칭
- OpenRouter 키가 있으면 `baidu/qianfan-ocr-fast:free` OCR 실호출, 없으면 샘플 OCR fallback
- 식약처 e약은요 키가 있으면 일반의약품 실조회, 없으면 로컬 `medicine_cache` 샘플로 전문/일반 판별
- 일반약은 약국, 전문약은 병원으로 이어지는 구매/진료 가이드
- 복용 시간 배열, 시작일, 종료일, 잔여 알약 수를 갖는 복약 스케줄
- 복용 체크 시 잔여 알약 차감 및 1일분 이하 경고
- 공공데이터 키가 있으면 약국/병원 실조회, 없으면 샘플 판매처 fallback
- 카카오맵 JavaScript 키와 지도/로컬 서비스가 활성화되어 있으면 실제 SDK 지도, 없으면 지도형 UI와 카카오맵 검색 링크
- 따뜻한 크림 배경과 코랄/피치 중심 디자인 시스템

## API 엔드포인트

- `GET /api/config`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/fcm/register`
- `GET /api/medicine/search?q=타이레놀`
- `POST /api/ocr`
- `GET /api/pharmacies?region1=서울특별시&region2=중구`
- `GET /api/hospitals?region1=서울특별시&region2=중구`

## 실제 API 연결 지점

- `server.js`와 `lib/api-providers.mjs`가 식약처, OpenRouter OCR, 국립중앙의료원, Supabase 호출을 담당합니다.
- 프론트는 `/api/*`만 호출하므로 service key가 브라우저에 노출되지 않습니다.
- Supabase `users` 저장이 RLS 403으로 막히면 `.env`에 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`를 추가하고 서버를 재시작하세요.
- 카카오맵 SDK가 403이면 Kakao Developers에서 Web 플랫폼 도메인 `http://localhost:4173`과 카카오맵/로컬 서비스 활성화 상태를 확인하세요.
- `schema.sql`을 Supabase SQL Editor에 적용한 뒤 Row Level Security 정책을 추가하세요.
- 자세한 교체 지점은 [docs/api-integration.md](docs/api-integration.md)에 정리했습니다.

## ERD

기획 ERD는 [assest/img/erd.webp](assest/img/erd.webp)에 있습니다. 현재 SQL 스키마는 `users`, `medication_schedules`, `medicine_cache` 중심으로 반영했습니다.

## 검증

```bash
npm test
```
