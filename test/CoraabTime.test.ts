import { describe, expect, it } from 'vitest';
import { coraab, EPOCH_MS } from '../src/index.js';

const HOUR = 3_600_000;

describe('converting Earth time to Coraab time', () => {
    it('starts at the epoch with TU 0 and everything else at 1', () => {
        const time = coraab(EPOCH_MS);
        expect(time.toParts()).toEqual({
            gul: 1, tuOfGul: 1, tu: 0, tol: 1, day: 'oonar', un: 1, unt: 1, om: 1, millisecond: 0,
        });
        expect(time.toString()).toBe('1L|1|0 Tu 1 Unt 1 Om');
    });

    it('gives Oonar exactly 96 UN and Hakkar 72 UN', () => {
        expect(coraab(EPOCH_MS + 95 * HOUR).format('Hd')).toBe('96L');
        expect(coraab(EPOCH_MS + 96 * HOUR).format('Hd')).toBe('1H');
        expect(coraab(EPOCH_MS + 167 * HOUR).format('Hd|M')).toBe('72H|1');
        expect(coraab(EPOCH_MS + 168 * HOUR).format('Hd|M')).toBe('1L|2');
    });

    it('handles dates before the epoch', () => {
        expect(coraab(EPOCH_MS - 1).toParts()).toEqual({
            gul: 0, tuOfGul: 6, tu: -1, tol: 8, day: 'hakkar', un: 72, unt: 12, om: 60, millisecond: 4999,
        });
    });

    it('groups 6 TU into one GUL, both counted from 1', () => {
        expect(coraab(EPOCH_MS).tu(5).format('G g')).toBe('1 6');
        expect(coraab(EPOCH_MS).tu(6).format('G g')).toBe('2 1');
    });

    it('matches a known date', () => {
        expect(coraab('2026-11-01T12:00:00Z').format('Hd|M|Y [Tu] G gggg MMMM dddd'))
            .toBe("61H|2|4358 Tu 727 Ka'Tu Nuu'Tol Hakkar");
    });
});

describe('parsing', () => {
    it('parses the short wiki format', () => {
        expect(coraab('7L|6|4270 Tu').format('Hd|M|Y [Tu]')).toBe('7L|6|4270 Tu');
        expect(coraab('65l|7|4270 tu').format('Hd|M|Y [Tu]')).toBe('65L|7|4270 Tu');
    });

    it('round-trips toString', () => {
        const time = coraab('2026-11-01T12:34:56Z');
        expect(coraab(time.toString()).toString()).toBe(time.toString());
        expect(coraab(time.toString()).valueOf()).toBe(time.startOf('om').valueOf());
    });

    it('rejects out of range values', () => {
        expect(coraab('97L|1|0 Tu').isValid()).toBe(false);
        expect(coraab('73H|1|0 Tu').isValid()).toBe(false);
        expect(coraab('1L|9|0 Tu').isValid()).toBe(false);
        expect(coraab('1L|1|0 Tu 13 Unt 1 Om').isValid()).toBe(false);
        expect(coraab('nonsense').format()).toBe('Invalid Date');
    });

    it('parses the units case-insensitively and without OM', () => {
        expect(coraab('54L|6|4273 tu 5unt 31om').toString()).toBe('54L|6|4273 Tu 5 Unt 31 Om');
        expect(coraab('54L|6|4273 Tu 5 Unt').toString()).toBe('54L|6|4273 Tu 5 Unt 1 Om');
    });

    it('parses the shorter wiki forms and spaces around pipes', () => {
        expect(coraab('8|4285 Tu').toString()).toBe('1L|8|4285 Tu 1 Unt 1 Om');
        expect(coraab('4273 Tu').toString()).toBe('1L|1|4273 Tu 1 Unt 1 Om');
        expect(coraab('-110000 Tu').tu()).toBe(-110000);
        expect(coraab('−12000 Tu').tu()).toBe(-12000);
        expect(coraab(' 54L | 6 | 4273 Tu ').toString()).toBe('54L|6|4273 Tu 1 Unt 1 Om');
    });

    it('rejects partial forms that make no sense', () => {
        expect(coraab('54L|4273 Tu').isValid()).toBe(false);
        expect(coraab('6|4273 Tu 7 Unt 12 Om').isValid()).toBe(false);
        expect(coraab('54L|6|4273').isValid()).toBe(false);
    });

    it('falls back to Earth date strings', () => {
        expect(coraab('1358-08-14T00:00:00Z').valueOf()).toBe(EPOCH_MS);
    });
});

describe('creating from parts', () => {
    it('sets every given part and starts the rest at the beginning', () => {
        const time = coraab.from({ tu: 4360, tol: 5, un: 12, unt: 3, om: 30 });
        expect(time.toString()).toBe('12L|5|4360 Tu 3 Unt 30 Om');
        expect(time.valueOf()).toBe(coraab('12L|5|4360 Tu 3 Unt 30 Om').valueOf());
        expect(coraab.from({ tu: 0 }).valueOf()).toBe(EPOCH_MS);
    });

    it('sets the day and milliseconds', () => {
        expect(coraab.from({ tu: 4360, tol: 5, day: 'hakkar', un: 10 }).toString()).toBe('10H|5|4360 Tu 1 Unt 1 Om');
        expect(coraab.from({ tu: 0, millisecond: 1234 }).valueOf()).toBe(EPOCH_MS + 1234);
    });

    it('rolls over out-of-range values', () => {
        expect(coraab.from({ tu: 0, un: 97 }).format('Hd')).toBe('1H');
    });
});

describe('invalid input', () => {
    it('treats null, NaN, Infinity and out of range dates as invalid', () => {
        expect(coraab(null).isValid()).toBe(false);
        expect(coraab(NaN).isValid()).toBe(false);
        expect(coraab(Infinity).isValid()).toBe(false);
        expect(coraab(8.64e15 + 1).isValid()).toBe(false);
        expect(coraab(8.64e15).isValid()).toBe(true);
        expect(coraab('').isValid()).toBe(false);
    });

    it('keeps invalid instances invalid', () => {
        const invalid = coraab(null);
        expect(invalid.add(1, 'tu').isValid()).toBe(false);
        expect(invalid.toString()).toBe('Invalid Date');
        expect(invalid.toJSON()).toBeNull();
    });

    it('throws on unknown units', () => {
        expect(() => coraab().add(1, 'constructor' as never)).toThrow('Unknown unit');
        expect(() => coraab().startOf('day' as never)).toThrow("can't be used");
    });

    it('truncates fractional milliseconds like Date', () => {
        expect(coraab(EPOCH_MS - 0.5).valueOf()).toBe(new Date(EPOCH_MS - 0.5).valueOf());
        expect(coraab(1.9).valueOf()).toBe(1);
    });

    it('treats undefined as now', () => {
        expect(Math.abs(coraab(undefined).valueOf() - Date.now())).toBeLessThan(1000);
    });
});

describe('manipulation', () => {
    const start = coraab(EPOCH_MS);

    it('adds Coraab and Earth units', () => {
        expect(start.add(1, 'tol').diff(start, 'hour')).toBe(168);
        expect(start.add(1, 'tu').diff(start, 'day')).toBe(56);
        expect(start.add(1, 'gul').diff(start, 'day')).toBe(336);
        expect(start.add(3, 'days').format('Hd')).toBe('73L');
        expect(start.add(2, 'unts').add(1, 'om').format('m [Unt] s [Om]')).toBe('3 Unt 2 Om');
        expect(start.subtract(1, 'tu').tu()).toBe(-1);
    });

    it('rounds fractional amounts to whole milliseconds', () => {
        expect(start.add(1 / 3, 'second').valueOf() - EPOCH_MS).toBe(333);
        expect(start.add(0.5, 'tol').format('Hd')).toBe('85L');
    });

    it('is immutable', () => {
        start.add(1, 'tu');
        start.tol(3);
        expect(start.valueOf()).toBe(EPOCH_MS);
    });

    it('sets values and rolls over', () => {
        expect(start.tol(3).tol()).toBe(3);
        expect(start.un(97).format('Hd')).toBe('1H');
        expect(start.tu(8).gul(3).format('Y G g')).toBe('14 3 3');
    });

    it('finds start and end of units', () => {
        const time = coraab('50H|3|4358 Tu 5 Unt 30 Om');
        expect(time.startOf('tu').toString()).toBe('1L|1|4358 Tu 1 Unt 1 Om');
        expect(time.startOf('gul').toString()).toBe('1L|1|4356 Tu 1 Unt 1 Om');
        expect(time.startOf('coraabDay').toString()).toBe('1H|3|4358 Tu 1 Unt 1 Om');
        expect(time.endOf('coraabDay').toString()).toBe('72H|3|4358 Tu 12 Unt 60 Om');
        expect(time.endOf('tol').add(1).toString()).toBe('1L|4|4358 Tu 1 Unt 1 Om');
        expect(time.startOf('tols').isSame(time.startOf('tol'))).toBe(true);
        expect(coraab('1L|1|0 Tu').endOf('coraabDay').toString()).toBe('96L|1|0 Tu 12 Unt 60 Om');
        expect(time.startOf('coraabDays').isSame(time.startOf('coraabDay'))).toBe(true);
    });

    it('ends GUL 714 when TU 4284 starts, as the Czech wiki says', () => {
        expect(coraab('4284 Tu').subtract(1).gul()).toBe(714);
        expect(coraab('4284 Tu').gul()).toBe(715);
    });

    it('works the same before the epoch', () => {
        const time = coraab('10H|3|-5 Tu 4 Unt 20 Om');
        expect(time.toString()).toBe('10H|3|-5 Tu 4 Unt 20 Om');
        expect(time.startOf('gul').toString()).toBe('1L|1|-6 Tu 1 Unt 1 Om');
        expect(time.add(5, 'tu').toString()).toBe('10H|3|0 Tu 4 Unt 20 Om');
    });

    it('computes time until the next TU', () => {
        const time = coraab('72H|8|4358 Tu 12 Unt 59 Om');
        expect(time.startOf('tu').add(1, 'tu').diff(time, 'second')).toBe(10);
    });

    it('compares', () => {
        const a = coraab('1L|1|10 Tu');
        const b = coraab('2L|1|10 Tu');
        expect(a.isBefore(b)).toBe(true);
        expect(b.isAfter(a)).toBe(true);
        expect(a.isSame(b, 'tol')).toBe(true);
        expect(a.isSame(b, 'un')).toBe(false);
        expect(a.isBefore(b, 'tol')).toBe(false);
        expect(a.isAfter(b, 'tol')).toBe(false);
        expect(coraab('1L|2|10 Tu').isAfter(b, 'tol')).toBe(true);
    });
});
