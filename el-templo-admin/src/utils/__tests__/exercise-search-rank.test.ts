import { describe, it, expect } from 'vitest';
import { rankExerciseNameMatch, filterAndSortByRelevance } from '../exercise-search-rank';

describe('rankExerciseNameMatch', () => {
  it('ranks 0 when the name starts with the term', () => {
    expect(rankExerciseNameMatch('Remo con barra', 'remo')).toBe(0);
  });

  it('ranks 1 when a word inside the name starts with the term', () => {
    expect(rankExerciseNameMatch('Peso muerto remo', 'remo')).toBe(1);
  });

  it('ranks 2 when the term only appears as a substring', () => {
    expect(rankExerciseNameMatch('Tremor de pierna', 'remo')).toBe(2);
  });

  it('returns null when there is no match', () => {
    expect(rankExerciseNameMatch('Sentadilla', 'remo')).toBeNull();
  });

  it('returns null for an empty or whitespace-only term', () => {
    expect(rankExerciseNameMatch('Remo con barra', '')).toBeNull();
    expect(rankExerciseNameMatch('Remo con barra', '   ')).toBeNull();
  });

  it('is case-insensitive and trims the term', () => {
    expect(rankExerciseNameMatch('Remo con barra', '  REMO  ')).toBe(0);
  });
});

describe('filterAndSortByRelevance', () => {
  const exercises = [
    { name: 'Tremor de pierna' }, // substring in the middle -> rank 2
    { name: 'Sentadilla' }, // no match -> excluded
    { name: 'Remo invertido' }, // starts with term -> rank 0
    { name: 'Remo con barra' }, // starts with term -> rank 0 (alphabetically before "invertido")
    { name: 'Peso muerto remo' }, // word-start match -> rank 1
  ];

  it('excludes non-matching items and orders by rank then alphabetically', () => {
    const result = filterAndSortByRelevance(exercises, 'remo', (ex) => ex.name);
    expect(result.map((ex) => ex.name)).toEqual([
      'Remo con barra',
      'Remo invertido',
      'Peso muerto remo',
      'Tremor de pierna',
    ]);
  });

  it('returns a copy of the original list untouched when the term is empty', () => {
    const result = filterAndSortByRelevance(exercises, '', (ex) => ex.name);
    expect(result).toEqual(exercises);
    expect(result).not.toBe(exercises);
  });
});
