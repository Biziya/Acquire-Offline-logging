import type { ApiLookupDefinition, LookupDefinition } from "../types/domain";

// The nine lists served together by GET /api/table-constants. `responseKey`
// names each list in that response; its items keep `codeProperty` + description.
export const RAW_LITHO_LOOKUPS = Object.freeze<ApiLookupDefinition[]>([
  {
    fieldKey: "lithoCode",
    label: "Litho Code",
    responseKey: "lithoCode",
    codeProperty: "lithoCode",
    cacheKey: "lithoCodes",
  },
  {
    fieldKey: "colorCode",
    label: "Colour",
    responseKey: "colourCode",
    codeProperty: "colourCode",
    cacheKey: "colours",
  },
  {
    fieldKey: "ca",
    label: "CA",
    responseKey: "caCode",
    codeProperty: "caCode",
    cacheKey: "ca",
  },
  {
    fieldKey: "om",
    label: "OM",
    responseKey: "omCode",
    codeProperty: "omCode",
    cacheKey: "om",
  },
  {
    fieldKey: "omFacies",
    label: "OM Facies",
    responseKey: "omFaciesCode",
    codeProperty: "omFaciesCode",
    cacheKey: "omFacies",
  },
  {
    fieldKey: "py",
    label: "PY",
    responseKey: "pyCode",
    codeProperty: "pyCode",
    cacheKey: "py",
  },
  {
    fieldKey: "ox",
    label: "OX",
    responseKey: "oxCode",
    codeProperty: "oxCode",
    cacheKey: "ox",
  },
  {
    fieldKey: "sedim",
    label: "Sedim",
    responseKey: "sedimCode",
    codeProperty: "sedimCode",
    cacheKey: "sedim",
  },
  {
    fieldKey: "redoxCode",
    label: "Redox Code",
    responseKey: "redoxCode",
    codeProperty: "redoxCode",
    cacheKey: "redoxCodes",
  },
]);

export const GRANULO_HARDNESS_OPTIONS = Object.freeze(
  Array.from({ length: 10 }, (_, digit) =>
    Object.freeze({ code: String(digit) }),
  ),
);

export const RAW_LITHO_LOCAL_LOOKUPS = Object.freeze<LookupDefinition[]>([
  {
    fieldKey: "granulo",
    label: "Granulo",
    source: "local",
    codeProperty: "code",
    options: GRANULO_HARDNESS_OPTIONS,
    maxLength: 1,
    inputMode: "numeric",
    isInputAllowed: (value) => /^\d?$/.test(value),
  },
  {
    fieldKey: "hardness",
    label: "Hardness",
    source: "local",
    codeProperty: "code",
    options: GRANULO_HARDNESS_OPTIONS,
    maxLength: 1,
    inputMode: "numeric",
    isInputAllowed: (value) => /^\d?$/.test(value),
  },
]);

export const RAW_LITHO_ALL_LOOKUPS = Object.freeze([
  ...RAW_LITHO_LOOKUPS,
  ...RAW_LITHO_LOCAL_LOOKUPS,
]);

export const RAW_LITHO_API_LOOKUP_BY_FIELD = Object.freeze(
  Object.fromEntries(
    RAW_LITHO_LOOKUPS.map((lookup) => [lookup.fieldKey, lookup]),
  ),
);

export const RAW_LITHO_LOOKUP_BY_FIELD = Object.freeze(
  Object.fromEntries(
    RAW_LITHO_ALL_LOOKUPS.map((lookup) => [lookup.fieldKey, lookup]),
  ),
);
