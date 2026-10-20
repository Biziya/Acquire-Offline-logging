import type { LithologyRecord } from "./databaseViewerTypes";
import type { DatabaseViewerMockSettings } from "./config";

/*
 * MOCK DATA ONLY.
 *
 * Builds fake lithology records so the viewer's table, filters and scrolling
 * can be built and measured before it is connected to the database. Nothing
 * here comes from, or is sent to, the backend. Every identifier starts with
 * "MOCK" so a screenshot can never be mistaken for production data.
 *
 * The generator is seeded: the same seed and size always produce the same
 * records with the same ids, so results are reproducible and row ids are
 * stable. "Refresh" asks for the next seed.
 */

// Plausible code values for the mock rows (sample shapes from src/other/*.json).
// They are NOT the lookup tables served by the API.
const CODES = {
  lithoCode: ["SS", "SH", "CL", "LS", "CG", "SI"],
  colorCode: ["BRN", "GRY", "RED", "YEL", "WHT", "BLK"],
  ca: ["N", "L", "M", "H"],
  om: ["N", "L", "M", "H"],
  omFacies: ["A", "B", "C"],
  py: ["N", "Y"],
  ox: ["N", "Y"],
  sedim: ["LAM", "MAS", "XBD"],
  redoxCode: ["OX", "RD", "MX"],
  digits: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  comments: [
    "",
    "",
    "Fine grained sandstone",
    "Weathered, iron stained",
    "Minor clay  alteration",
    "Coarse lenses near base",
    "Core loss at top",
  ],
} as const;

// Small deterministic PRNG (mulberry32): fast, and good enough for fixtures.
function createRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(value: number, length: number) {
  return String(value).padStart(length, "0");
}

export function generateMockLithologyRecords(
  size: number,
  seed: number,
  settings: DatabaseViewerMockSettings,
): LithologyRecord[] {
  const random = createRandom(seed);
  const pick = <T>(values: readonly T[]) =>
    values[Math.floor(random() * values.length)] as T;

  const holes: { project: string; campaign: string; drillhole: string }[] = [];
  for (let p = 1; p <= settings.projects; p += 1) {
    for (let c = 1; c <= settings.campaignsPerProject; c += 1) {
      for (let h = 1; h <= settings.drillholesPerCampaign; h += 1) {
        holes.push({
          project: `MOCK-PRJ-${pad(p, 2)}`,
          campaign: `MOCK-C${2024 + c}`,
          drillhole: `MOCK-DH-${pad(p, 2)}${pad(c, 1)}-${pad(h, 3)}`,
        });
      }
    }
  }

  const perHole = Math.ceil(size / holes.length);
  const records: LithologyRecord[] = new Array(size);

  for (let index = 0; index < size; index += 1) {
    const hole = holes[Math.floor(index / perHole)] ?? holes[holes.length - 1];
    // Each drillhole starts at 0 m and its intervals are contiguous.
    const previous = records[index - 1];
    const lithoFrom =
      index % perHole === 0 || !previous ? 0 : previous.lithoTo;
    const lithoTo = Math.round((lithoFrom + 0.25 + random() * 2.75) * 100) / 100;

    records[index] = {
      id: index + 1,
      project: hole?.project ?? "",
      campaign: hole?.campaign ?? "",
      drillhole: hole?.drillhole ?? "",
      lithoFrom,
      lithoTo,
      lithoCode: pick(CODES.lithoCode),
      colorCode: pick(CODES.colorCode),
      ca: pick(CODES.ca),
      om: pick(CODES.om),
      omFacies: pick(CODES.omFacies),
      py: pick(CODES.py),
      ox: pick(CODES.ox),
      sedim: pick(CODES.sedim),
      redoxCode: pick(CODES.redoxCode),
      granulo: pick(CODES.digits),
      hardness: pick(CODES.digits),
      lithologyComments: pick(CODES.comments),
    };
  }

  return records;
}
