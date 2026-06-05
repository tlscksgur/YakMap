# Yak-Map API Integration Notes

## Environment variables

실제 서비스 전환 시 브라우저에 노출되어도 되는 공개 키와 서버 전용 키를 분리해야 합니다.

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FIREBASE_API_KEY=
FIREBASE_PROJECT_ID=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
FIREBASE_VAPID_KEY=
KAKAO_MAP_JAVASCRIPT_KEY=
OPENROUTER_API_KEY=
OPENROUTER_OCR_MODEL=openrouter/free
MFDS_EYAK_SERVICE_KEY=
NMC_PHARMACY_SERVICE_KEY=
```

## Replacement map

| Current file/function | Production replacement |
| --- | --- |
| `server.js` `/api/medicine/search` | 식약처 e약은요 API 호출, 실패 시 샘플 fallback |
| `server.js` `/api/ocr` | OpenRouter `openrouter/free` vision 라우터, 실패 시 무료 vision 모델 재시도 및 직접 입력 fallback |
| `server.js` `/api/pharmacies` | 국립중앙의료원 약국 조회 API, 실패 시 샘플 약국/편의점 fallback |
| `server.js` `/api/hospitals` | 국립중앙의료원 병·의원 찾기 API, 실패 시 샘플 병원 fallback |
| `app.js` `loadKakaoMapSdk()` | 카카오맵 SDK 지도, 마커, 길찾기 링크 |
| `app.js` `authenticate()` | `/api/auth/*`를 통해 Supabase Auth 또는 로컬 fallback |
| `app.js` `refreshFcmToken()` | Firebase Messaging `getToken()` 후 `/api/fcm/register` 호출 |
| `app.js` `checkDueReminders()` | 로컬 알림 fallback. 운영에서는 서버 cron/edge function이 FCM 발송 |

## Public API references

- 식약처 e약은요: `https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList`
- 국립중앙의료원 약국: `https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire`
- 국립중앙의료원 병·의원: `https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire`
- OpenRouter OCR: `https://openrouter.ai/api/v1/chat/completions`
- 카카오맵 SDK: `https://dapi.kakao.com/v2/maps/sdk.js`
- 카카오맵 SDK 403 `OPEN_MAP_AND_LOCAL service` 오류는 Kakao Developers에서 카카오맵/로컬 서비스를 활성화해야 해결됩니다.

## Server-side reminder flow

1. 사용자가 로그인하면 Supabase user id와 FCM token을 `users`에 저장합니다.
2. 복약 스케줄 등록 시 `medication_schedules`에 `dosage_times`, `start_date`, `end_date`, `remaining_pills`를 저장합니다.
3. 서버 cron은 매분 현재 시간과 일치하는 스케줄을 조회합니다.
4. 해당 유저의 `fcm_token`으로 Firebase Admin SDK 푸시를 발송합니다.
5. 사용자가 앱에서 복용 완료를 누르면 `remaining_pills`를 차감하고, 1일분 이하이면 재구매/재방문 메시지를 노출합니다.

## Security notes

- Supabase Row Level Security를 켜고 `medication_schedules.user_id = auth.uid()` 정책을 적용합니다.
- 공공 API service key와 Firebase Admin credential은 서버 또는 Edge Function에만 둡니다.
- OCR 이미지는 가능하면 서버 저장 없이 즉시 텍스트만 추출하고 폐기합니다.
