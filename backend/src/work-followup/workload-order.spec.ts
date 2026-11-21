import { WorkType } from '../generated/prisma/enums.js';
import {
  certainlyLarger,
  orderByWorkload,
  programSize,
  type OrderInputItem,
} from './workload-order.js';

const ED = 'qalun-abi-nashit-tn-hannibal-mualim-v1';
const exact = (value: number) => ({
  editionId: ED,
  pages: { kind: 'exact', value },
});
const bounded = (greaterThan: number, lessThan: number) => ({
  editionId: ED,
  pages: { kind: 'bounded', greaterThan, lessThan },
});
const item = (type: WorkType, quranWorkload: unknown): OrderInputItem => ({
  type,
  quranWorkload,
});
const M = (w: unknown) => item(WorkType.MEMORIZATION, w);
const R = (w: unknown) => item(WorkType.REVISION, w);
const C = (w: unknown) => item(WorkType.RECITATION, w);
const E = (w: unknown) => item(WorkType.EXAM, w);
const order = (programs: Record<string, OrderInputItem[]>) =>
  orderByWorkload(
    Object.entries(programs).map(([value, items]) => ({ value, items })),
    ED,
  ).map((o) => [o.value, o.group]);

describe('advisory workload order (pages, exact and bounded)', () => {
  it('sizes: حفظ + مراجعة + عرضة summed (no weights, each item once); اختبار apart; bounds add up', () => {
    expect(
      programSize(
        [M(exact(2)), R(bounded(10, 12)), C(exact(21)), E(exact(5))],
        ED,
      ),
    ).toEqual({
      kind: 'comparable',
      primary: { lo: 33, hi: 35, exact: false },
      exam: { lo: 5, hi: 5, exact: true },
    });
    // the same range in two items: two tasks, counted twice
    expect(programSize([R(exact(10)), R(exact(10))], ED)).toMatchObject({
      primary: { lo: 20, hi: 20, exact: true },
    });
  });

  it('unknown work is never zero: free text, an unmeasured item or another edition make the program not comparable', () => {
    expect(programSize([M(exact(3)), R(null)], ED)).toEqual({
      kind: 'unavailable',
      reason: 'FREE_TEXT',
    });
    expect(
      programSize(
        [R({ editionId: ED, pages: { kind: 'unavailable', reason: 'x' } })],
        ED,
      ),
    ).toEqual({ kind: 'unavailable', reason: 'UNMEASURED' });
    expect(
      programSize(
        [R({ editionId: 'hafs-other', pages: { kind: 'exact', value: 3 } })],
        ED,
      ),
    ).toEqual({ kind: 'unavailable', reason: 'EDITION' });
    expect(programSize([R({ editionId: ED })], ED)).toEqual({
      kind: 'unavailable',
      reason: 'UNMEASURED',
    });
  });

  it('certainty: strict bounds — touching edges are certain unless both exact; overlap is never certain', () => {
    const x = (lo: number, hi: number, e = false) => ({ lo, hi, exact: e });
    expect(certainlyLarger(x(10, 10, true), x(9, 9, true))).toBe(true);
    expect(certainlyLarger(x(10, 10, true), x(10, 10, true))).toBe(false);
    expect(certainlyLarger(x(10, 12), x(8, 10))).toBe(true); // 10 < a, b < 10
    expect(certainlyLarger(x(10, 12), x(9, 11))).toBe(false); // overlap
    expect(certainlyLarger(x(10, 10, true), x(9, 10))).toBe(true);
  });

  it('clearly different sizes in descending order, each its own group; overlapping sizes share a group', () => {
    expect(
      order({ a: [R(exact(5))], b: [R(exact(40))], c: [R(exact(20))] }),
    ).toEqual([
      ['b', 0],
      ['c', 1],
      ['a', 2],
    ]);
    expect(
      order({
        a: [R(bounded(10, 13))],
        b: [R(bounded(11, 12))],
        c: [R(exact(3))],
      }),
    ).toEqual([
      ['a', 0],
      ['b', 0],
      ['c', 1],
    ]);
  });

  it('never contradicts a certain comparison, and is transitive / stable whatever the input order', () => {
    // a chain of overlaps: A ≈ B, B ≈ C, but A > C for sure — A stays before C, all in one group
    const progs = {
      C: [R(bounded(10, 13))],
      A: [R(bounded(14, 17))],
      B: [R(bounded(12, 15))],
    };
    expect(order(progs)).toEqual([
      ['A', 0],
      ['B', 0],
      ['C', 0],
    ]);
    const shuffled = { B: progs.B, C: progs.C, A: progs.A };
    expect(order(shuffled)).toEqual(order(progs));
    // equal sizes keep their original order
    expect(
      order({ x: [R(exact(4))], y: [R(exact(4))], z: [R(exact(4))] }),
    ).toEqual([
      ['x', 0],
      ['y', 0],
      ['z', 0],
    ]);
  });

  it('اختبار only breaks a tie of equal primary sizes', () => {
    expect(
      order({
        a: [R(exact(10)), E(exact(2))],
        b: [R(exact(10)), E(exact(30))],
      }),
    ).toEqual([
      ['b', 0],
      ['a', 0],
    ]);
    // a larger exam never lifts a smaller primary size
    expect(
      order({ a: [R(exact(10))], b: [R(exact(9)), E(exact(100))] }),
    ).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });

  it('not comparable programs stay visible, after the others, in their original order, without a group', () => {
    expect(
      order({
        l1: [R(null)],
        a: [R(exact(2))],
        l2: [M(exact(5)), C(null)],
        b: [R(exact(9))],
      }),
    ).toEqual([
      ['b', 0],
      ['a', 1],
      ['l1', null],
      ['l2', null],
    ]);
  });

  it('several assignments per student and a large session stay deterministic', () => {
    const many = Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [
        `s${i}`,
        [M(exact(i % 7)), R(bounded(i % 11, (i % 11) + 2)), C(exact(i % 3))],
      ]),
    );
    const first = order(many);
    expect(order(many)).toEqual(first);
    expect(first).toHaveLength(300);
    // the groups never go backwards
    const groups = first.map(([, g]) => g as number);
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
  });
});
