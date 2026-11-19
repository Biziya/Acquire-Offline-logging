import type { RawExtractionRow } from "./rawExtractionColumns";

/*
 * Dummy core runs (from the old desktop screen) shown for every drillhole
 * until the page is connected to the database:
 * [start, end, recovered, recovery %, mud imp %].
 */
const SAMPLE_RUNS: readonly (readonly [number, number, number, number, number?])[] = [
  [150, 151.6, 1.6, 100],
  [151.6, 153.1, 1.5, 100],
  [153.1, 156.1, 2.95, 98.33],
  [156.1, 159.1, 2.95, 98.33, 10],
  [159.1, 162.1, 2.9, 96.67],
  [162.1, 165.1, 2.85, 95],
  [165.1, 168.1, 3, 100],
  [168.1, 171.1, 2.95, 98.33, 10],
  [171.1, 172.7, 1.6, 100],
  [172.7, 174.1, 1.4, 100],
  [174.1, 174.9, 0.8, 100],
  [174.9, 177.1, 2.1, 95.45, 20],
  [177.1, 179.9, 2.8, 100, 20],
  [179.9, 180.9, 0.85, 85, 10],
  [180.9, 182.9, 1.95, 97.5],
  [182.9, 184.9, 1.8, 90, 20],
  [184.9, 187.9, 2.95, 98.33, 20],
  [187.9, 189.7, 1.7, 94.44],
  [189.7, 192.1, 2.3, 95.83],
  [192.1, 195, 2.45, 84.48],
];

/* A fresh copy each time, so edits never change the sample. */
export function createSampleRows(): RawExtractionRow[] {
  return SAMPLE_RUNS.map(([start, end, recovered, recovery, mudImp], index) => ({
    id: index + 1,
    extractionType: "CAROTTE",
    coringMethod: "Double tube coring",
    corePass: String(index + 1),
    startDepth: String(start),
    endDepth: String(end),
    recovered: String(recovered),
    recoveryPct: String(recovery),
    mudLayerPct: "",
    mudImpPct: mudImp === undefined ? "" : String(mudImp),
  }));
}
