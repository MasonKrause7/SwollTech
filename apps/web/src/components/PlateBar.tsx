import { loadPlates, plateColor, plateHeight, type Unit } from "@swolltech/metrics";
import { trimNumber } from "../format";

/** The bar as it should be loaded for the target, drawn one side mirrored to the other. */
export function PlateBar({ weight, unit, caption = true }: { weight: number | null; unit: Unit; caption?: boolean }) {
  if (weight == null || weight <= 0) return null;
  const load = loadPlates(weight, unit);
  const width = 360;
  const height = 110;
  const mid = height / 2;
  const sleeveStart = 92;
  const plateWidth = 15;
  const gap = 2;
  const plates = load.perSide;
  const describe = load.belowBar
    ? `Lighter than the ${unit === "kg" ? "20 kg" : "45 lb"} bar. Use dumbbells or a lighter bar.`
    : plates.length === 0
      ? "Empty bar."
      : `Each side: ${plates.map((plate) => trimNumber(plate, 2)).join(" + ")} ${unit}.`;

  function side(direction: 1 | -1) {
    let x = direction === 1 ? width / 2 + sleeveStart : width / 2 - sleeveStart;
    return plates.map((plate, index) => {
      const h = plateHeight(plate, unit) * (height - 10);
      const rect = (
        <rect
          key={`${direction}-${index}`}
          x={direction === 1 ? x : x - plateWidth}
          y={mid - h / 2}
          width={plateWidth}
          height={h}
          rx={3}
          fill={plateColor(plate, unit)}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth={1}
        />
      );
      x += direction * (plateWidth + gap);
      return rect;
    });
  }

  return (
    <figure className="plates" aria-label={`Plates to load: ${describe}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
        <rect x={8} y={mid - 4} width={width - 16} height={8} rx={3} fill="var(--bar)" />
        <rect x={width / 2 - sleeveStart - 6} y={mid - 9} width={6} height={18} rx={2} fill="var(--bar)" />
        <rect x={width / 2 + sleeveStart} y={mid - 9} width={6} height={18} rx={2} fill="var(--bar)" />
        {side(1)}
        {side(-1)}
      </svg>
      {caption && (
      <figcaption className="small muted">
        {describe}
        {!load.belowBar && load.remainder > 0 ? ` That makes ${trimNumber(load.loaded, 2)} ${unit}, ${trimNumber(load.remainder, 2)} ${unit} short.` : ""}
      </figcaption>
      )}
    </figure>
  );
}
