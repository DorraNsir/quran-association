import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { Prisma } from '../generated/prisma/client.js';
import { balance, IsMoney, money, paymentStatus } from './money.js';

const d = (v: string) => new Prisma.Decimal(v);

class Body {
  @IsMoney() amount!: string;
}
const valid = (amount: unknown) =>
  validateSync(plainToInstance(Body, { amount })).length === 0;

describe('money', () => {
  it('accepts positive amounts with at most 3 decimals (string or number)', () => {
    for (const v of ['1', '60', '60.5', '0.001', '9999999.999', 60.5, 12])
      expect([v, valid(v)]).toEqual([v, true]);
    for (const v of [
      '0',
      '0.000',
      0,
      '-1',
      -1,
      '1.0001',
      '10000000',
      '1e3',
      '',
      'abc',
      null,
      true,
    ])
      expect([v, valid(v)]).toEqual([v, false]);
  });

  it('formats as fixed 3-decimal strings without float drift', () => {
    expect(money(d('0.1').plus(d('0.2')))).toBe('0.300');
    expect(money(d('60.5'))).toBe('60.500');
    expect(money(null)).toBe('0.000');
  });

  it('derives UNPAID / PARTIAL / PAID', () => {
    expect(paymentStatus(d('60'), d('0'))).toBe('UNPAID');
    expect(paymentStatus(d('60'), d('59.999'))).toBe('PARTIAL');
    expect(paymentStatus(d('60'), d('60.000'))).toBe('PAID');
  });

  it('computes the remaining balance, never negative', () => {
    expect(balance(d('60.5'), d('15.5'))).toEqual({
      expectedAmount: '60.500',
      totalPaid: '15.500',
      remainingAmount: '45.000',
      status: 'PARTIAL',
    });
    expect(balance(d('10'), d('12')).remainingAmount).toBe('0.000');
  });
});
