import { describe, expect, it } from 'vitest';
import {
  JOIN_CODE_LENGTH,
  generateJoinCode,
  isPlausibleJoinCode,
  normaliseJoinCode,
} from '@/lib/join-code';

/**
 * Group join codes.
 *
 * These are read off a projector and typed into a phone, so the properties
 * that matter are legibility and never silently turning a correctly-read code
 * into a different one.
 */

const CONFUSABLE = ['0', 'O', 'Q', '1', 'I', 'L', 'J', '2', 'Z', '5', 'S', '8', 'B', 'U', 'V'];

/** A deterministic stand-in for Math.random. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

describe('generateJoinCode', () => {
  it('is the advertised length', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateJoinCode()).toHaveLength(JOIN_CODE_LENGTH);
    }
  });

  it('never emits a character that is confusable with another', () => {
    const sample = Array.from({ length: 500 }, () => generateJoinCode()).join('');
    for (const character of CONFUSABLE) {
      expect({ character, present: sample.includes(character) }).toEqual({
        character,
        present: false,
      });
    }
  });

  it('produces codes it would itself accept', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(isPlausibleJoinCode(generateJoinCode())).toBe(true);
    }
  });

  it('stays inside the alphabet at the very top of the random range', () => {
    // `Math.random()` returns values in [0, 1), but a caller could pass 1.
    expect(isPlausibleJoinCode(generateJoinCode(sequence([0.999999999])))).toBe(true);
    expect(isPlausibleJoinCode(generateJoinCode(sequence([1])))).toBe(true);
    expect(isPlausibleJoinCode(generateJoinCode(sequence([0])))).toBe(true);
  });

  it('is varied enough to be worth generating', () => {
    const codes = new Set(Array.from({ length: 300 }, () => generateJoinCode()));
    expect(codes.size).toBeGreaterThan(290);
  });
});

describe('normaliseJoinCode', () => {
  it('upper-cases and strips what people add when reading aloud', () => {
    expect(normaliseJoinCode('  a3c-7de ')).toBe('A3C7DE');
    expect(normaliseJoinCode('A3 C7 DE')).toBe('A3C7DE');
  });

  it('DOES NOT guess at a confusable character', () => {
    // An earlier draft mapped a typed `O` onto `Q` and `S` onto `5`. Those
    // characters are excluded precisely because nobody can tell them apart, so
    // every such mapping is a guess — and a wrong guess turns a code the
    // student read correctly into one that does not exist. Failing the lookup
    // and asking them to retype is honest; silently rewriting is not.
    expect(normaliseJoinCode('O')).toBe('O');
    expect(normaliseJoinCode('S')).toBe('S');
    expect(isPlausibleJoinCode(normaliseJoinCode('AOC7DE'))).toBe(false);
  });
});

describe('isPlausibleJoinCode', () => {
  it('rejects the wrong length', () => {
    expect(isPlausibleJoinCode('A3C7D')).toBe(false);
    expect(isPlausibleJoinCode('A3C7DEF')).toBe(false);
    expect(isPlausibleJoinCode('')).toBe(false);
  });

  it('rejects anything outside the alphabet', () => {
    expect(isPlausibleJoinCode('A3C7D0')).toBe(false);
    expect(isPlausibleJoinCode('a3c7de')).toBe(false);
    expect(isPlausibleJoinCode('A3C7D!')).toBe(false);
  });

  it('accepts a well-formed code', () => {
    expect(isPlausibleJoinCode('A3C7DE')).toBe(true);
  });
});
