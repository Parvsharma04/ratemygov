import { describe, expect, it } from 'vitest';
import {
  STATES,
  VALID_STATE_CODES,
  getStateByCode,
  getStateByIso,
  getStateBySlug,
} from '../src/lib/states';

describe('Indian States and Union Territories dataset', () => {
  it('contains exactly 36 entities: 28 states and 8 union territories', () => {
    expect(STATES).toHaveLength(36);

    const states = STATES.filter((s) => s.kind === 'state');
    const uts = STATES.filter((s) => s.kind === 'ut');

    expect(states).toHaveLength(28);
    expect(uts).toHaveLength(8);
  });

  it('has 36 unique codes', () => {
    const codes = STATES.map((s) => s.code);
    const uniqueCodes = new Set(codes);

    expect(uniqueCodes.size).toBe(36);
    expect(codes.every((c) => Number.isInteger(c) && c >= 1 && c <= 36)).toBe(true);
  });

  it('has 36 unique slugs', () => {
    const slugs = STATES.map((s) => s.slug);
    const uniqueSlugs = new Set(slugs);

    expect(uniqueSlugs.size).toBe(36);
  });

  it('has 36 unique iso codes', () => {
    const isos = STATES.map((s) => s.iso);
    const uniqueIsos = new Set(isos);

    expect(uniqueIsos.size).toBe(36);
  });

  it('exports VALID_STATE_CODES containing all 36 codes', () => {
    expect(VALID_STATE_CODES.size).toBe(36);
    for (let c = 1; c <= 36; c++) {
      expect(VALID_STATE_CODES.has(c)).toBe(true);
    }
  });

  it('finds states by slug', () => {
    const delhi = getStateBySlug('delhi');
    expect(delhi?.name).toBe('Delhi');
    expect(delhi?.kind).toBe('ut');

    const maharashtra = getStateBySlug('maharashtra');
    expect(maharashtra?.name).toBe('Maharashtra');
    expect(maharashtra?.code).toBe(21);

    expect(getStateBySlug('unknown-state')).toBeUndefined();
  });

  it('finds states by code', () => {
    const kerala = getStateByCode(17);
    expect(kerala?.name).toBe('Kerala');
    expect(kerala?.iso).toBe('KL');

    expect(getStateByCode(99)).toBeUndefined();
  });

  it('finds states by iso code and aliases case-insensitively with optional IN- prefix', () => {
    // Odisha: OD and legacy OR
    expect(getStateByIso('OD')?.name).toBe('Odisha');
    expect(getStateByIso('od')?.name).toBe('Odisha');
    expect(getStateByIso('OR')?.name).toBe('Odisha');
    expect(getStateByIso('in-or')?.name).toBe('Odisha');
    expect(getStateByIso('IN-OD')?.name).toBe('Odisha');

    // Telangana: TG and legacy/common TS
    expect(getStateByIso('TG')?.name).toBe('Telangana');
    expect(getStateByIso('TS')?.name).toBe('Telangana');
    expect(getStateByIso('tg')?.name).toBe('Telangana');

    // Chhattisgarh: CT and alias CG
    expect(getStateByIso('CT')?.name).toBe('Chhattisgarh');
    expect(getStateByIso('CG')?.name).toBe('Chhattisgarh');

    // Uttarakhand: UT and aliases UK, UL
    expect(getStateByIso('UT')?.name).toBe('Uttarakhand');
    expect(getStateByIso('UK')?.name).toBe('Uttarakhand');
    expect(getStateByIso('UL')?.name).toBe('Uttarakhand');

    // Merged UT: DH and legacy DD, DN
    expect(getStateByIso('DH')?.name).toBe('Dadra and Nagar Haveli and Daman and Diu');
    expect(getStateByIso('DD')?.name).toBe('Dadra and Nagar Haveli and Daman and Diu');
    expect(getStateByIso('DN')?.name).toBe('Dadra and Nagar Haveli and Daman and Diu');

    // Unknown code
    expect(getStateByIso('ZZ')).toBeUndefined();
  });
});
