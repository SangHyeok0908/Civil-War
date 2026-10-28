import { useEffect, useState } from "react";
import catalog from "../../../../packages/game-assets/catalog.json";
export function getChampionLabel(id: number) {
  return (
    (catalog.champions as Record<string, { name: string }>)[id]?.name ??
    `알 수 없는 챔피언 (${id})`
  );
}
export function ChampionPortrait({ championId }: { championId: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [championId]);
  const asset = (
    catalog.champions as Record<string, { name: string; image: string }>
  )[championId];
  return asset && !failed ? (
    <img
      className="champion-portrait"
      src={"./assets/champions/" + asset.image}
      alt={asset.name + " 초상화"}
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="champion-placeholder" aria-label="초상화 없음">
      ?
    </span>
  );
}
