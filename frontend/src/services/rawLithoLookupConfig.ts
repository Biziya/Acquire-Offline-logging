import type { ApiLookupDefinition, LookupDefinition } from "../types/domain";
export const RAW_LITHO_LOOKUPS = Object.freeze<ApiLookupDefinition[]>([
  {
    fieldKey: "lithoCode",
    label: "Litho Code",
    endpoint: "/api/lithocodes",
    codeProperty: "lithoCode",
    cacheKey: "lithoCodes",
  },
  {
    fieldKey: "colorCode",
    label: "Colour",
    endpoint: "/api/colour",
    codeProperty: "colourCode",
    cacheKey: "colours",
  },
  {
    fieldKey: "ca",
    label: "CA",
    endpoint: "/api/ca",
    codeProperty: "caCode",
    cacheKey: "ca",
  },
  {
    fieldKey: "om",
    label: "OM",
    endpoint: "/api/om",
    codeProperty: "omCode",
    cacheKey: "om",
  },
  {
    fieldKey: "omFacies",
    label: "OM Facies",
    endpoint: "/api/omfacies",
    codeProperty: "omFaciesCode",
    cacheKey: "omFacies",
  },
  {
    fieldKey: "py",
    label: "PY",
    endpoint: "/api/py",
    codeProperty: "pyCode",
    cacheKey: "py",
  },
  {
    fieldKey: "ox",
    label: "OX",
    endpoint: "/api/ox",
    codeProperty: "oxCode",
    cacheKey: "ox",
  },
  {
    fieldKey: "sedim",
    label: "Sedim",
    endpoint: "/api/sedim",
    codeProperty: "sedimCode",
    cacheKey: "sedim",
  },
  {
    fieldKey: "redoxCode",
    label: "Redox Code",
    endpoint: "/api/redoxcode",
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
