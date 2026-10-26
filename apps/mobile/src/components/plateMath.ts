export { loadPlates, plateColor, plateHeight } from "@swolltech/metrics";

export function trimPlate(value: number) {
  return Number(value.toFixed(2)).toString();
}
