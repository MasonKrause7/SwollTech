import { loadPlates, plateColor, plateHeight, trimPlate } from "./plateMath";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { View } from "react-native";
import type { Unit } from "../logic/rows";
import { fonts, useTheme } from "../theme";
import { T } from "./ui";

const HEIGHT = 120;

/** One side of the bar, drawn like it looks in the rack. */
export function PlateDiagram({ weight, unit }: { weight: number | null; unit: Unit }) {
  const theme = useTheme();
  if (weight == null || weight <= 0) return null;
  const load = loadPlates(weight, unit);
  const plateWidth = 18;
  const gap = 3;
  const sleeveStart = 46;
  const width = Math.max(240, sleeveStart + load.perSide.length * (plateWidth + gap) + 40);
  const mid = HEIGHT / 2;
  let note = load.perSide.length ? `${load.perSide.map((plate) => trimPlate(plate)).join(" + ")} each side` : "Empty bar";
  if (load.belowBar) note = `Lighter than the ${unit === "lb" ? 45 : 20} ${unit} bar`;
  else if (load.remainder > 0) note += `. ${trimPlate(load.remainder)} ${unit} short of the target`;
  return (
    <View accessible accessibilityLabel={`Plates: ${note}`} style={{ gap: 6 }}>
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
        <Rect x={0} y={mid - 5} width={sleeveStart} height={10} rx={2} fill={theme.muted} />
        <Rect x={sleeveStart - 8} y={mid - 16} width={8} height={32} rx={2} fill={theme.muted} />
        <Rect x={sleeveStart} y={mid - 7} width={width - sleeveStart} height={14} rx={3} fill={theme.line} />
        {load.perSide.map((plate, index) => {
          const h = (HEIGHT - 8) * plateHeight(plate, unit);
          const x = sleeveStart + 2 + index * (plateWidth + gap);
          const fill = plateColor(plate, unit);
          const light = fill === "#F2C230" || fill === "#E9ECEF";
          return [
            <Rect key={`p${index}`} x={x} y={mid - h / 2} width={plateWidth} height={h} rx={3} fill={fill} stroke={theme.bg} strokeWidth={1} />,
            h > 60 ? (
              <SvgText
                key={`t${index}`}
                x={x + plateWidth / 2}
                y={mid + 4}
                fontSize={11}
                fontFamily={fonts.display}
                fill={light ? "#1B2027" : "#FFFFFF"}
                textAnchor="middle"
              >
                {trimPlate(plate)}
              </SvgText>
            ) : null,
          ];
        })}
      </Svg>
      <T variant="small">{note}</T>
    </View>
  );
}
