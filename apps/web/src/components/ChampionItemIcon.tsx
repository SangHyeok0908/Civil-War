import { createContext, useContext, useState } from "react";
import type { Catalog } from "../types";
export const CatalogContext = createContext<Catalog | undefined>(undefined);
export function ChampionItemIcon({
  id,
  kind = "champion",
}: {
  id: number;
  kind?: "champion" | "item";
}) {
  const catalog = useContext(CatalogContext);
  const [failed, setFailed] = useState(false);
  const asset = (kind === "champion" ? catalog?.champions : catalog?.items)?.[
    id
  ];
  const label =
    id === 0
      ? "빈 슬롯"
      : asset?.name || `${kind === "champion" ? "챔피언" : "아이템"} ${id}`;
  return (
    <span className={"asset " + kind} title={`${label} · ID ${id}`}>
      <span className="icon">
        {asset && !failed ? (
          <img
            loading="lazy"
            src={`${catalog?.baseUrl}${kind}/${asset.image}`}
            alt={label}
            onError={() => setFailed(true)}
          />
        ) : (
          <span aria-label={label} className="fallback">
            {id === 0 ? "—" : id}
          </span>
        )}
      </span>
      {kind === "champion" ? (
        <span>{label}</span>
      ) : (!asset || failed) && id !== 0 ? (
        <span className="item-id">{id}</span>
      ) : null}
    </span>
  );
}
