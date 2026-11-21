import { readFile } from "node:fs/promises";

const REPO_COMMIT_URL = "https://github.com/SangHyeok0908/Civil-War/commit/";
const WEBHOOK_PREFIXES = [
  "https://discord.com/api/webhooks/",
  "https://discordapp.com/api/webhooks/",
];

const HEADLINES = {
  "rolled-back":
    "새 서버 버전이 정상 동작하지 않아 이전 버전으로 되돌림했습니다.",
  "rollback-failed":
    "새 버전 교체에 실패했고 이전 버전으로 되돌리는 것도 실패했습니다. 수동 조치 필요: 서버를 직접 확인해 주세요.",
  "backup-failed":
    "교체 전 데이터베이스 백업에 실패해 서버 교체를 중단했습니다. 기존 서버는 그대로 동작 중입니다.",
  "registry-unreachable":
    "새 서버 버전을 확인하는 이미지 저장소에 계속 접속하지 못하고 있습니다.",
  test: "자동 교체 담당의 알림 시험 메시지입니다.",
};

export function formatAlert(kind, info) {
  const lines = [HEADLINES[kind] ?? HEADLINES.test];
  if (info.revision) {
    lines.push(
      `커밋: ${info.revision.slice(0, 7)} (${REPO_COMMIT_URL}${info.revision})`,
    );
  }
  if (info.step) lines.push(`실패 단계: ${info.step}`);
  lines.push(`시각(UTC): ${info.at.toISOString()}`);
  return {
    content: lines.join("\n").slice(0, 2000),
    allowed_mentions: { parse: [] },
  };
}

export async function readWebhookUrl(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return null;
  }
  const url = text.trim();
  return WEBHOOK_PREFIXES.some((prefix) => url.startsWith(prefix)) ? url : null;
}

export async function sendAlert(url, payload, fetchImpl = fetch) {
  if (!url) return false;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status >= 200 && response.status < 300) return true;
    console.error(`알림 전송 실패: HTTP ${response.status}`);
    return false;
  } catch (error) {
    console.error(`알림 전송 실패: ${error?.name ?? "Error"}`);
    return false;
  }
}
