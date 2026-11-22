import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { WorkPerformance } from '../generated/prisma/enums.js';
import { EvaluateWorkProgramDto } from './work-followup.dto.js';

const errorsOf = async (body: object) =>
  (await validate(plainToInstance(EvaluateWorkProgramDto, body))).map(
    (e) => e.property,
  );

describe('«التقييم العام» request (EvaluateWorkProgramDto.overall)', () => {
  it('exactly four levels, in a fixed order', () => {
    expect(Object.values(WorkPerformance)).toEqual([
      'EXCELLENT',
      'VERY_GOOD',
      'GOOD',
      'NEEDS_IMPROVEMENT',
    ]);
  });

  it('each level is accepted, with or without item results; omitted = untouched', async () => {
    for (const overall of Object.values(WorkPerformance))
      expect(await errorsOf({ items: [], version: 3, overall })).toEqual([]);
    expect(await errorsOf({ items: [], version: 3 })).toEqual([]);
  });

  it('anything else is refused (case, numbers, empty, null)', async () => {
    for (const overall of ['excellent', 'PERFECT', 1, '', null])
      expect(await errorsOf({ items: [], version: 3, overall })).toContain(
        'overall',
      );
  });
});
