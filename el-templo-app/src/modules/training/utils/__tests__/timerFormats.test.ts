import { describe, it, expect } from 'vitest';
import { parseProtocolType, getProtocolParams, ProtocolType } from '../timerFormats';
import type { Block } from '../../types/session';

describe('parseProtocolType', () => {
  describe('EMOM formats', () => {
    it('should map "EMOM" to EMOM protocol', () => {
      expect(parseProtocolType('EMOM')).toBe('EMOM');
    });

    it('should map "EMOM + For Time" to EMOM protocol', () => {
      expect(parseProtocolType('EMOM + For Time')).toBe('EMOM');
    });

    it('should map "Every X Seconds" to EMOM protocol', () => {
      expect(parseProtocolType('Every X Seconds')).toBe('EMOM');
    });

    it('should map "On the 2:00 / 3:00" to EMOM protocol', () => {
      expect(parseProtocolType('On the 2:00 / 3:00')).toBe('EMOM');
    });

    it('should map "Death By" to EMOM protocol', () => {
      expect(parseProtocolType('Death By')).toBe('EMOM');
    });

    it('should map "Death By Unbroken" to EMOM protocol', () => {
      expect(parseProtocolType('Death By Unbroken')).toBe('EMOM');
    });
  });

  describe('AMRAP formats', () => {
    it('should map "AMRAP" to AMRAP protocol', () => {
      expect(parseProtocolType('AMRAP')).toBe('AMRAP');
    });

    it('should map "AMRAP Series" to AMRAP protocol', () => {
      expect(parseProtocolType('AMRAP Series')).toBe('AMRAP');
    });
  });

  describe('FOR_TIME formats', () => {
    it('should map "For Time" to FOR_TIME protocol', () => {
      expect(parseProtocolType('For Time')).toBe('FOR_TIME');
    });

    it('should map "Rounds for Time" to FOR_TIME protocol', () => {
      expect(parseProtocolType('Rounds for Time')).toBe('FOR_TIME');
    });

    it('should map "Chipper" to FOR_TIME protocol', () => {
      expect(parseProtocolType('Chipper')).toBe('FOR_TIME');
    });

    it('should map "Couplet" to FOR_TIME protocol', () => {
      expect(parseProtocolType('Couplet')).toBe('FOR_TIME');
    });

    it('should map "Triplet" to FOR_TIME protocol', () => {
      expect(parseProtocolType('Triplet')).toBe('FOR_TIME');
    });

    it('should map "Singlet" to FOR_TIME protocol', () => {
      expect(parseProtocolType('Singlet')).toBe('FOR_TIME');
    });

    it('should map "Hero WOD" to FOR_TIME protocol', () => {
      expect(parseProtocolType('Hero WOD')).toBe('FOR_TIME');
    });

    it('should map "Benchmark WOD" to FOR_TIME protocol', () => {
      expect(parseProtocolType('Benchmark WOD')).toBe('FOR_TIME');
    });

    it('should map "Benchmark" to FOR_TIME protocol', () => {
      expect(parseProtocolType('Benchmark')).toBe('FOR_TIME');
    });

    it('should map "Open Style" to FOR_TIME protocol', () => {
      expect(parseProtocolType('Open Style')).toBe('FOR_TIME');
    });

    it('should map "Time Cap" to FOR_TIME protocol', () => {
      expect(parseProtocolType('Time Cap')).toBe('FOR_TIME');
    });

    it('should map "Task Priority" to FOR_TIME protocol', () => {
      expect(parseProtocolType('Task Priority')).toBe('FOR_TIME');
    });

    it('should map "Task Priority vs Time Priority" to FOR_TIME protocol', () => {
      expect(parseProtocolType('Task Priority vs Time Priority')).toBe('FOR_TIME');
    });
  });

  describe('STRAIGHT_SETS formats', () => {
    it('should map "Tabata" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Tabata')).toBe('STRAIGHT_SETS');
    });

    it('should map "HIIT" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('HIIT')).toBe('STRAIGHT_SETS');
    });

    it('should map "Interval Training" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Interval Training')).toBe('STRAIGHT_SETS');
    });

    it('should map "Complex" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Complex')).toBe('STRAIGHT_SETS');
    });

    it('should map "Cluster" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Cluster')).toBe('STRAIGHT_SETS');
    });

    it('should map "Accumulate X" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Accumulate X')).toBe('STRAIGHT_SETS');
    });

    it('should map "Flow Guiado" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Flow Guiado')).toBe('STRAIGHT_SETS');
    });

    it('should map "For Quality" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('For Quality')).toBe('STRAIGHT_SETS');
    });

    it('should map "For Tech" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('For Tech')).toBe('STRAIGHT_SETS');
    });

    it('should map "For Max (Carga)" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('For Max (Carga)')).toBe('STRAIGHT_SETS');
    });

    it('should map "For Max (Reps)" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('For Max (Reps)')).toBe('STRAIGHT_SETS');
    });

    it('should map "For Max (Tiempo)" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('For Max (Tiempo)')).toBe('STRAIGHT_SETS');
    });

    it('should map "Ladder" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Ladder')).toBe('STRAIGHT_SETS');
    });

    it('should map "Ladder Block" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Ladder Block')).toBe('STRAIGHT_SETS');
    });

    it('should map "Ladder corta" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Ladder corta')).toBe('STRAIGHT_SETS');
    });

    it('should map "Broken Ladder" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Broken Ladder')).toBe('STRAIGHT_SETS');
    });

    it('should map "Pyramid" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Pyramid')).toBe('STRAIGHT_SETS');
    });

    it('should map "Wave Loading" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Wave Loading')).toBe('STRAIGHT_SETS');
    });

    it('should map "Drop Set" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Drop Set')).toBe('STRAIGHT_SETS');
    });

    it('should map "Rest-Pause" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Rest-Pause')).toBe('STRAIGHT_SETS');
    });

    it('should map "Tempo Sets" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Tempo Sets')).toBe('STRAIGHT_SETS');
    });

    it('should map "Unbroken Reps" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Unbroken Reps')).toBe('STRAIGHT_SETS');
    });

    it('should map "Buy-in / Cash-out" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Buy-in / Cash-out')).toBe('STRAIGHT_SETS');
    });

    it('should map "Circuito cooperativo" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Circuito cooperativo')).toBe('STRAIGHT_SETS');
    });

    it('should map "I Go" to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('I Go')).toBe('STRAIGHT_SETS');
    });

    it('should map unknown format to STRAIGHT_SETS protocol', () => {
      expect(parseProtocolType('Unknown Format')).toBe('STRAIGHT_SETS');
    });

    it('should handle case-insensitive matching', () => {
      expect(parseProtocolType('emom')).toBe('EMOM');
      expect(parseProtocolType('AMRAP')).toBe('AMRAP');
      expect(parseProtocolType('for time')).toBe('FOR_TIME');
      expect(parseProtocolType('tabata')).toBe('STRAIGHT_SETS');
    });
  });
});

describe('getProtocolParams', () => {
  const createMockBlock = (
    format: string,
    exerciseCount: number = 4,
    repsBudget: number = 100
  ): Block => ({
    blockId: 'test-block',
    role: 'NUCLEUS',
    route: 'push',
    pattern: 'vertical',
    intensity: 7,
    repsBudget,
    format,
    sortOrder: 0,
    exercises: Array(exerciseCount).fill(null).map((_, i) => ({
      exerciseId: i + 1,
      exerciseName: `Exercise ${i + 1}`,
      contraction: 'CON',
      reps: 10,
      seconds: null,
      rest: 60,
      notes: null,
      sortOrder: i,
    })),
  });

  describe('EMOM protocol parameters', () => {
    it('should extract rounds from exercise count for EMOM', () => {
      const block = createMockBlock('EMOM', 4);
      const params = getProtocolParams(block);

      expect(params.type).toBe('EMOM');
      expect(params.rounds).toBe(4);
      expect(params.intervalSeconds).toBe(60);
      expect(params.durationMinutes).toBeNull();
    });

    it('should use default 10 rounds if no exercises', () => {
      const block = createMockBlock('EMOM', 0);
      const params = getProtocolParams(block);

      expect(params.type).toBe('EMOM');
      expect(params.rounds).toBe(10);
      expect(params.intervalSeconds).toBe(60);
    });
  });

  describe('AMRAP protocol parameters', () => {
    it('should use default 10 minutes for AMRAP', () => {
      const block = createMockBlock('AMRAP', 5);
      const params = getProtocolParams(block);

      expect(params.type).toBe('AMRAP');
      expect(params.durationMinutes).toBe(10);
      expect(params.intervalSeconds).toBe(60);
      expect(params.rounds).toBeNull();
    });
  });

  describe('FOR_TIME protocol parameters', () => {
    it('should return null duration and rounds for FOR_TIME', () => {
      const block = createMockBlock('For Time', 3);
      const params = getProtocolParams(block);

      expect(params.type).toBe('FOR_TIME');
      expect(params.durationMinutes).toBeNull();
      expect(params.rounds).toBeNull();
      expect(params.intervalSeconds).toBe(60);
    });
  });

  describe('STRAIGHT_SETS protocol parameters', () => {
    it('should return null for all params for STRAIGHT_SETS', () => {
      const block = createMockBlock('Tabata', 4);
      const params = getProtocolParams(block);

      expect(params.type).toBe('STRAIGHT_SETS');
      expect(params.durationMinutes).toBeNull();
      expect(params.rounds).toBeNull();
      expect(params.intervalSeconds).toBe(60);
    });
  });
});
