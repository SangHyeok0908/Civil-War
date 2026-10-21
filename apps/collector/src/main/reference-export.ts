// C11 verified the official Account-v1 -> Match-v5 route, not this runtime's access.
// Direct requests from this environment were rejected with browser_signature_banned.
// Do not retry that route or substitute unverified other-player LCU history.
export async function exportMemberReferences(_selection: string[]) {
  return {
    available: false as const,
    code: "OFFICIAL_API_UNAVAILABLE",
    reason:
      "솔로랭크 참고 자료는 Riot 공식 Account-v1 → Match-v5 경로가 필요합니다. 현재 수집기에 승인된 직접 API 연결이 없어 내보낼 수 없습니다. LCU 다른 플레이어 조회로 대체하지 않습니다.",
  };
}
