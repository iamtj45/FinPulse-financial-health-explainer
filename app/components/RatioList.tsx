import type { RatioResult } from "@/lib/ratios";
import type { Explanations } from "@/lib/explain";
import { RatioRow } from "./RatioRow";

export function RatioList({
  ratios,
  explanations,
}: {
  ratios: RatioResult[];
  explanations?: Explanations | Record<string, "pending">;
}) {
  return (
    <div>
      {ratios.map((r) => (
        <RatioRow key={r.id} ratio={r} explanation={explanations?.[r.id]} />
      ))}
    </div>
  );
}
