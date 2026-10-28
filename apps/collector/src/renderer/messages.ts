export const messages: Record<string, string> = {
  CLIENT_NOT_RUNNING: "롤 클라이언트를 실행하고 로그인하세요.",
  LCU_NOT_LOGGED_IN: "롤 클라이언트에 로그인하세요.",
  LCU_UNAVAILABLE: "롤 클라이언트 조회에 실패했습니다. 다시 조회하세요.",
  HISTORY_PAGINATION_STALLED:
    "경기 목록이 반복되어 조회를 중단했습니다. 앞서 조회한 경기만 처리했으며, 더 오래된 기록은 확인하지 못했습니다.",
  ACCOUNT_MISMATCH: "현재 롤 계정과 기기 등록 계정이 다릅니다.",
  ENROLL_REQUIRED: "운영자가 발급한 코드로 기기를 등록하세요.",
  REENROLL_REQUIRED:
    "보호된 인증 정보를 읽지 못했습니다. 기기를 다시 등록하세요.",
  PROTECTION_UNAVAILABLE: "Windows 보호 저장소를 사용할 수 없습니다.",
  NETWORK_ERROR:
    "서버에 연결할 수 없습니다. 저장된 요청은 자동으로 재시도합니다.",
  AUTH_REVOKED:
    "기기 인증이 만료되거나 폐기되었습니다. 새 코드로 등록 후 본인 요청을 재개하세요.",
  CREDENTIAL_CHANGED:
    "저장 당시 인증과 다릅니다. 같은 회원으로 다시 등록 후 본인 요청을 재개하세요.",
  UNREGISTERED_PARTICIPANT: "등록되지 않은 참가자가 있어 수집할 수 없습니다.",
  ROSTER_UNAVAILABLE: "최초 온라인 기기 등록과 회원 명단 동기화가 필요합니다.",
  LOCAL_SAVE_FAILED:
    "전송 대기 저장 실패. 디스크 공간을 확인한 뒤 다시 조회하세요.",
  UNSUPPORTED_SCHEMA: "지원하지 않는 경기 종류 또는 형식입니다.",
  INVALID_MATCH: "경기 필수 정보가 없거나 서로 일치하지 않습니다.",
  REQUIRED: "경기의 필수 기록이 누락되었습니다.",
  INVALID_ROLES: "각 팀에 탑·정글·미드·원딜·서포터를 한 명씩 지정하세요.",
  PENDING_OWNER_MISMATCH:
    "다른 회원이 보관한 미완료 요청이 있어 계정을 바꿀 수 없습니다.",
  MATCH_CANCELED: "운영자가 등록을 취소한 경기입니다.",
  LOCAL_ERROR: "작업에 실패했습니다. 저장 상태를 확인하고 다시 시도하세요.",
};
export const message = (code: string) =>
  messages[code] ??
  "처리할 수 없습니다. 운영자에게 오류 코드 " + code + "를 알려주세요.";
