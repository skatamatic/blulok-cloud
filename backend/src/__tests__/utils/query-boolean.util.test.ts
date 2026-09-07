import { parseQueryBoolean, parseQueryInt, parseQueryIntClamped, queryString, queryDateString, queryStringArray, parseOptionalQueryInt } from '@/utils/query-boolean.util';

describe('parseQueryBoolean', () => {
  it('parses Joi-coerced booleans and query strings', () => {
    expect(parseQueryBoolean(true)).toBe(true);
    expect(parseQueryBoolean(false)).toBe(false);
    expect(parseQueryBoolean('true')).toBe(true);
    expect(parseQueryBoolean('false')).toBe(false);
    expect(parseQueryBoolean('1')).toBe(true);
    expect(parseQueryBoolean('0')).toBe(false);
  });

  it('returns undefined for absent values', () => {
    expect(parseQueryBoolean(undefined)).toBeUndefined();
    expect(parseQueryBoolean(null)).toBeUndefined();
    expect(parseQueryBoolean('')).toBeUndefined();
  });
});

describe('parseQueryInt', () => {
  it('parses Joi-coerced numbers and query strings', () => {
    expect(parseQueryInt(25, 100)).toBe(25);
    expect(parseQueryInt('25', 100)).toBe(25);
  });

  it('returns default for absent or invalid values', () => {
    expect(parseQueryInt(undefined, 100)).toBe(100);
    expect(parseQueryInt('nope', 100)).toBe(100);
  });
});

describe('parseQueryIntClamped', () => {
  it('clamps numeric query values to bounds', () => {
    expect(parseQueryIntClamped(25, 100, 1, 200)).toBe(25);
    expect(parseQueryIntClamped(500, 100, 1, 200)).toBe(200);
    expect(parseQueryIntClamped(0, 100, 1, 200)).toBe(1);
  });
});

describe('queryString', () => {
  it('normalizes string and scalar query values', () => {
    expect(queryString('abc')).toBe('abc');
    expect(queryString(undefined)).toBeUndefined();
  });
});

describe('queryDateString', () => {
  it('normalizes Date objects from Joi coercion', () => {
    const date = new Date('2024-06-01T00:00:00.000Z');
    expect(queryDateString(date)).toBe('2024-06-01T00:00:00.000Z');
    expect(queryDateString('2024-06-01')).toBe('2024-06-01');
  });
});

describe('queryStringArray', () => {
  it('normalizes single and array facility id filters', () => {
    expect(queryStringArray('fac-1')).toEqual(['fac-1']);
    expect(queryStringArray(['fac-1', 'fac-2'])).toEqual(['fac-1', 'fac-2']);
    expect(queryStringArray(undefined)).toEqual([]);
  });
});

describe('parseOptionalQueryInt', () => {
  it('returns undefined for absent values and numbers for Joi-coerced input', () => {
    expect(parseOptionalQueryInt(undefined)).toBeUndefined();
    expect(parseOptionalQueryInt(25)).toBe(25);
    expect(parseOptionalQueryInt('25')).toBe(25);
  });
});
