/*
 * One lithology interval as the viewer displays it. Field names follow the
 * Raw Litho JSON row (types/rawLithoSchema.ts) plus the drillhole identity the
 * database stores with each row. Depths are numbers here because the viewer
 * only reads them.
 */
export interface LithologyRecord {
  id: number;
  project: string;
  campaign: string;
  drillhole: string;
  lithoFrom: number;
  lithoTo: number;
  lithoCode: string;
  colorCode: string;
  ca: string;
  om: string;
  omFacies: string;
  py: string;
  ox: string;
  sedim: string;
  redoxCode: string;
  granulo: string;
  hardness: string;
  lithologyComments: string;
}

export type LithologyColumnKey = Exclude<keyof LithologyRecord, "id">;

export const LITHOLOGY_COLUMN_KEYS: readonly LithologyColumnKey[] = [
  "project",
  "campaign",
  "drillhole",
  "lithoFrom",
  "lithoTo",
  "lithoCode",
  "colorCode",
  "ca",
  "om",
  "omFacies",
  "py",
  "ox",
  "sedim",
  "redoxCode",
  "granulo",
  "hardness",
  "lithologyComments",
];
