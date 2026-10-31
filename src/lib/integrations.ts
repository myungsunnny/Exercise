// 외부 건강 데이터 연동 계층. 각 제공자의 지원 여부를 확인하기 전에는 구현 완료로 표시하지 않는다.
// 연동이 추가되면 data_import_jobs에 작업을 기록하고, 가져온 행은 source = 'import'로 저장한다.
export const INTEGRATIONS = [
  { id: "apple_health", name: "Apple 건강", status: "미지원 — 웹에서 HealthKit 직접 접근 불가. 건강 앱 내보내기(XML) 가져오기 검토 예정" },
  { id: "health_connect", name: "Health Connect (Android)", status: "미지원 — 안드로이드 앱이 필요해 웹에서 직접 연동 불가" },
  { id: "garmin", name: "Garmin Connect", status: "미지원 — Garmin Health API 파트너 승인 필요" },
  { id: "csv", name: "CSV 가져오기", status: "미구현 — Phase 5(데이터 백업·복원)에서 추가 예정" },
] as const;
