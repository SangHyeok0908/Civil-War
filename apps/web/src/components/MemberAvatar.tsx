import { useContext, useState } from "react";
import { CatalogContext } from "./ChampionItemIcon";
import type { PublicMember } from "../types";

export function MemberAvatar({
  member,
}: {
  member?: Pick<PublicMember, "displayName" | "profileIconId">;
}) {
  const catalog = useContext(CatalogContext);
  const [failedSource, setFailedSource] = useState<string>();
  const id = member?.profileIconId;
  const name = member?.displayName || "참가자";
  const source =
    catalog && Number.isInteger(id) && id! >= 0
      ? `${catalog.baseUrl}profileicon/${id}.png`
      : undefined;
  return (
    <span className="member-avatar" data-testid="member-avatar">
      {source && failedSource !== source ? (
        <img
          src={source}
          width="48"
          height="48"
          loading="lazy"
          referrerPolicy="no-referrer"
          alt={`${name} 프로필 사진`}
          onError={() => setFailedSource(source)}
        />
      ) : (
        <span aria-label={`${name} 프로필 사진 없음`}>
          {Array.from(name)[0] || "?"}
        </span>
      )}
    </span>
  );
}
