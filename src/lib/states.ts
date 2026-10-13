/**
 * Indian States and Union Territories (28 States, 8 Union Territories = 36 total).
 *
 * NOTE ON GEOLOCATION REGION CODES:
 * Cloudflare (`cf.regionCode`) and other edge providers (e.g. Vercel `x-vercel-ip-country-region`)
 * generally emit ISO 3166-2 subdivision codes, but legacy databases (MaxMind GeoIP2/GeoLite2)
 * occasionally emit older FIPS or pre-rename codes.
 *
 * The following entries must be verified against live deployment headers:
 * - Telangana (code 32): ISO updated to TG; many providers still emit TS.
 * - Chhattisgarh (code 7): ISO is CT; common Indian usage and some providers emit CG.
 * - Odisha (code 26): ISO is OD; older providers emit OR (Orissa).
 * - Uttarakhand (code 35): ISO is UT; older providers emit UK or UL (Uttaranchal).
 * - Dadra and Nagar Haveli and Daman and Diu (code 8): Merged in 2020 as DH; providers
 *   may still emit legacy DD (Daman and Diu) or DN (Dadra and Nagar Haveli).
 * - Ladakh (code 18): Created in 2019 (LA); ensure provider emits LA rather than JK.
 */

export type StateKind = 'state' | 'ut';

export interface State {
  readonly code: number;
  readonly slug: string;
  readonly name: string;
  readonly kind: StateKind;
  readonly iso: string;
  readonly isoAliases: readonly string[];
}

export const STATES: readonly State[] = [
  {
    code: 1,
    slug: 'andaman-and-nicobar-islands',
    name: 'Andaman and Nicobar Islands',
    kind: 'ut',
    iso: 'AN',
    isoAliases: [],
  },
  {
    code: 2,
    slug: 'andhra-pradesh',
    name: 'Andhra Pradesh',
    kind: 'state',
    iso: 'AP',
    isoAliases: [],
  },
  {
    code: 3,
    slug: 'arunachal-pradesh',
    name: 'Arunachal Pradesh',
    kind: 'state',
    iso: 'AR',
    isoAliases: [],
  },
  {
    code: 4,
    slug: 'assam',
    name: 'Assam',
    kind: 'state',
    iso: 'AS',
    isoAliases: [],
  },
  {
    code: 5,
    slug: 'bihar',
    name: 'Bihar',
    kind: 'state',
    iso: 'BR',
    isoAliases: [],
  },
  {
    code: 6,
    slug: 'chandigarh',
    name: 'Chandigarh',
    kind: 'ut',
    iso: 'CH',
    isoAliases: [],
  },
  {
    code: 7,
    slug: 'chhattisgarh',
    name: 'Chhattisgarh',
    kind: 'state',
    iso: 'CT',
    isoAliases: ['CG'],
  },
  {
    code: 8,
    slug: 'dadra-and-nagar-haveli-and-daman-and-diu',
    name: 'Dadra and Nagar Haveli and Daman and Diu',
    kind: 'ut',
    iso: 'DH',
    isoAliases: ['DD', 'DN'],
  },
  {
    code: 9,
    slug: 'delhi',
    name: 'Delhi',
    kind: 'ut',
    iso: 'DL',
    isoAliases: [],
  },
  {
    code: 10,
    slug: 'goa',
    name: 'Goa',
    kind: 'state',
    iso: 'GA',
    isoAliases: [],
  },
  {
    code: 11,
    slug: 'gujarat',
    name: 'Gujarat',
    kind: 'state',
    iso: 'GJ',
    isoAliases: [],
  },
  {
    code: 12,
    slug: 'haryana',
    name: 'Haryana',
    kind: 'state',
    iso: 'HR',
    isoAliases: [],
  },
  {
    code: 13,
    slug: 'himachal-pradesh',
    name: 'Himachal Pradesh',
    kind: 'state',
    iso: 'HP',
    isoAliases: [],
  },
  {
    code: 14,
    slug: 'jammu-and-kashmir',
    name: 'Jammu and Kashmir',
    kind: 'ut',
    iso: 'JK',
    isoAliases: [],
  },
  {
    code: 15,
    slug: 'jharkhand',
    name: 'Jharkhand',
    kind: 'state',
    iso: 'JH',
    isoAliases: [],
  },
  {
    code: 16,
    slug: 'karnataka',
    name: 'Karnataka',
    kind: 'state',
    iso: 'KA',
    isoAliases: [],
  },
  {
    code: 17,
    slug: 'kerala',
    name: 'Kerala',
    kind: 'state',
    iso: 'KL',
    isoAliases: [],
  },
  {
    code: 18,
    slug: 'ladakh',
    name: 'Ladakh',
    kind: 'ut',
    iso: 'LA',
    isoAliases: [],
  },
  {
    code: 19,
    slug: 'lakshadweep',
    name: 'Lakshadweep',
    kind: 'ut',
    iso: 'LD',
    isoAliases: [],
  },
  {
    code: 20,
    slug: 'madhya-pradesh',
    name: 'Madhya Pradesh',
    kind: 'state',
    iso: 'MP',
    isoAliases: [],
  },
  {
    code: 21,
    slug: 'maharashtra',
    name: 'Maharashtra',
    kind: 'state',
    iso: 'MH',
    isoAliases: [],
  },
  {
    code: 22,
    slug: 'manipur',
    name: 'Manipur',
    kind: 'state',
    iso: 'MN',
    isoAliases: [],
  },
  {
    code: 23,
    slug: 'meghalaya',
    name: 'Meghalaya',
    kind: 'state',
    iso: 'ML',
    isoAliases: [],
  },
  {
    code: 24,
    slug: 'mizoram',
    name: 'Mizoram',
    kind: 'state',
    iso: 'MZ',
    isoAliases: [],
  },
  {
    code: 25,
    slug: 'nagaland',
    name: 'Nagaland',
    kind: 'state',
    iso: 'NL',
    isoAliases: [],
  },
  {
    code: 26,
    slug: 'odisha',
    name: 'Odisha',
    kind: 'state',
    iso: 'OD',
    isoAliases: ['OR'],
  },
  {
    code: 27,
    slug: 'puducherry',
    name: 'Puducherry',
    kind: 'ut',
    iso: 'PY',
    isoAliases: [],
  },
  {
    code: 28,
    slug: 'punjab',
    name: 'Punjab',
    kind: 'state',
    iso: 'PB',
    isoAliases: [],
  },
  {
    code: 29,
    slug: 'rajasthan',
    name: 'Rajasthan',
    kind: 'state',
    iso: 'RJ',
    isoAliases: [],
  },
  {
    code: 30,
    slug: 'sikkim',
    name: 'Sikkim',
    kind: 'state',
    iso: 'SK',
    isoAliases: [],
  },
  {
    code: 31,
    slug: 'tamil-nadu',
    name: 'Tamil Nadu',
    kind: 'state',
    iso: 'TN',
    isoAliases: [],
  },
  {
    code: 32,
    slug: 'telangana',
    name: 'Telangana',
    kind: 'state',
    iso: 'TG',
    isoAliases: ['TS'],
  },
  {
    code: 33,
    slug: 'tripura',
    name: 'Tripura',
    kind: 'state',
    iso: 'TR',
    isoAliases: [],
  },
  {
    code: 34,
    slug: 'uttar-pradesh',
    name: 'Uttar Pradesh',
    kind: 'state',
    iso: 'UP',
    isoAliases: [],
  },
  {
    code: 35,
    slug: 'uttarakhand',
    name: 'Uttarakhand',
    kind: 'state',
    iso: 'UT',
    isoAliases: ['UK', 'UL'],
  },
  {
    code: 36,
    slug: 'west-bengal',
    name: 'West Bengal',
    kind: 'state',
    iso: 'WB',
    isoAliases: [],
  },
] as const;

const SLUG_INDEX = new Map<string, State>();
const CODE_INDEX = new Map<number, State>();
const ISO_INDEX = new Map<string, State>();

for (const state of STATES) {
  SLUG_INDEX.set(state.slug, state);
  CODE_INDEX.set(state.code, state);
  ISO_INDEX.set(state.iso.toUpperCase(), state);
  for (const alias of state.isoAliases) {
    ISO_INDEX.set(alias.toUpperCase(), state);
  }
}

export const VALID_STATE_CODES: Set<number> = new Set(STATES.map((s) => s.code));

export function getStateBySlug(slug: string): State | undefined {
  return SLUG_INDEX.get(slug.trim().toLowerCase());
}

export function getStateByCode(code: number): State | undefined {
  return CODE_INDEX.get(code);
}

export function getStateByIso(iso: string): State | undefined {
  const normalized = iso.trim().toUpperCase();
  const withoutPrefix = normalized.startsWith('IN-') ? normalized.slice(3) : normalized;
  return ISO_INDEX.get(withoutPrefix);
}
