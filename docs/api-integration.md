# Yak-Map API Integration Notes

## Environment variables

실제 서비스 전환 시 브라우저에 노출되어도 되는 공개 키와 서버 전용 키를 분리해야 합니다.

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
FIREBASE_API_KEY=
FIREBASE_PROJECT_ID=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
KAKAO_MAP_JAVASCRIPT_KEY=
GOOGLE_VISION_API_KEY=
MFDS_EYAK_SERVICE_KEY=
NMC_PHARMACY_SERVICE_KEY=
```

## Replacement map

| Current file/function | Production replacement |
| --- | --- |
| `app.js` `medicineCache` | Supabase `medicine_cache` + 식약처 e약은요 API fallback |
| `app.js` `lookupMedicine()` | 캐시 조회 후 미스 시 공공 API 호출, 결과 upsert |
| `app.js` `stores` | 국립중앙의료원 약국 API + 상비약 판매처 마스터 데이터 |
| `app.js` `renderMap()` | 카카오맵 SDK 지도, 마커, 길찾기 링크 |
| `app.js` `authenticate()` | Supabase Auth email signup/signin |
| `app.js` `refreshFcmToken()` | Firebase Messaging `getToken()` 후 `users.fcm_token` 업데이트 |
| `app.js` `requestNotificationPermission()` | Firebase Messaging 권한 요청과 토큰 갱신 |
| `app.js` `checkDueReminders()` | 서버 cron/edge function이 `medication_schedules`를 조회해 FCM 발송 |

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
