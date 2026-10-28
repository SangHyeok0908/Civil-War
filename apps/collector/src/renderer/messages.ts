export const messages: Record<string, string> = {
  CLIENT_NOT_RUNNING: "롤 클라이언트를 실행하고 로그인하세요.",
  LCU_NOT_LOGGED_IN: "롤 클라이언트에 로그인하세요.",
  LCU_UNAVAILABLE: "롤 클라이언트 조회에 실패했습니다. 다시 조회하세요.",
  HISTORY_PAGINATION_STALLED:
    "경기 목록이 반복되어 조회를 중단했습니다. 앞서 조회한 경기만 처리했으며, 더 오래된 기록은 확인하지 못했습니다.",
  ACCOUNT_MISMATCH: "현재 롤 계정과 모임에 연결한 계정이 다릅니다.",
  ENROLL_REQUIRED: "운영자가 발급한 모임 코드를 입력해 모임에 연결하세요.",
  REENROLL_REQUIRED:
    "보호된 인증 정보를 읽지 못했습니다. 모임 코드를 다시 입력해 연결하세요.",
  PROTECTION_UNAVAILABLE: "Windows 보호 저장소를 사용할 수 없습니다.",
  NETWORK_ERROR:
    "서버에 연결할 수 없습니다. 저장된 요청은 자동으로 재시도합니다.",
  AUTH_REVOKED:
    "모임 연결이 해제되었습니다. 모임 코드를 다시 입력하세요. 같은 계정임을 확인하면 저장된 요청을 자동으로 이어 보냅니다.",
  CREDENTIAL_CHANGED:
    "이전 연결로 저장된 전송입니다. 모임 코드를 다시 입력하세요. 같은 계정임을 확인하면 저장된 요청을 자동으로 이어 보냅니다.",
  INSUFFICIENT_REGISTERED_PARTICIPANTS:
    "등록 참가자가 6명 미만이어서 내전 후보에 포함하지 않았습니다.",
  UNREGISTERED_COLLECTOR:
    "현재 롤 계정이 모임 참가자로 등록되어 있는지 운영자에게 확인하세요.",
  COLLECTOR_UPDATE_REQUIRED:
    "수집기 업데이트가 필요합니다. 저장된 자료는 유지한 채 새 버전으로 실행하세요.",
  ACCOUNT_EVIDENCE_REQUIRED:
    "현재 롤 계정 정보를 확인하지 못했습니다. 롤에 로그인한 뒤 다시 시도하세요.",
  ACCOUNT_LINK_CONFLICT:
    "참가자 계정 연결을 확인해야 합니다. 운영자에게 문의하세요.",
  ROSTER_UNAVAILABLE:
    "서버에 연결해 참가자 목록을 받아야 합니다. 모임 연결과 인터넷 상태를 확인하세요.",
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
