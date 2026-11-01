import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { describe, expect, it } from 'vitest';
import { EPOCH_MS } from '../src/index.js';
import coraabPlugin from '../src/dayjs.js';

dayjs.extend(utc);
dayjs.extend(coraabPlugin);

describe('dayjs plugin', () => {
    const start = dayjs.utc(EPOCH_MS);

    it('adds and subtracts Coraab units', () => {
        expect(start.add(1, 'tol').diff(start, 'day')).toBe(7);
        expect(start.add(1, 'tu').subtract(1, 'tol').diff(start, 'tol')).toBe(7);
        expect(start.add(2, 'tols').diff(start, 'tols')).toBe(2);
    });

    it('keeps Day.js units working', () => {
        expect(start.add(1, 'month').format('YYYY-MM-DD')).toBe('1358-09-14');
        expect(start.startOf('year').format('YYYY-MM-DD')).toBe('1358-01-01');
        expect(start.endOf('month').format('YYYY-MM-DD')).toBe('1358-08-31');
        expect(start.add(1, 'd').add(1, 'h').add(1, 'm').diff(start, 'minute')).toBe(1501);
    });

    it('supports startOf and endOf with Coraab units and keeps utc mode', () => {
        const time = dayjs.utc('2026-11-01T12:34:56Z');
        expect(time.startOf('tu').toCoraab().toString()).toBe('1L|1|4358 Tu 1 Unt 1 Om');
        expect(time.startOf('tu').isUTC()).toBe(true);
        expect(time.endOf('coraabDay').toCoraab().format('Hd')).toBe('72H');
    });

    it('accepts Coraab units in any case, like Day.js does', () => {
        expect(start.add(1, 'TU' as never).diff(start, 'day')).toBe(56);
        expect(start.add(1, 'Tols' as never).diff(start, 'TOL' as never)).toBe(1);
        expect(start.add(1, 'M').format('YYYY-MM-DD')).toBe('1358-09-14');
        expect(start.add(5, 'un').endOf('CoraabDays' as never).toCoraab().format('Hd')).toBe('96L');
    });

    it('converts both ways', () => {
        expect(dayjs.fromCoraab('1L|1|0 Tu').valueOf()).toBe(EPOCH_MS);
        expect(start.toCoraab().toString()).toBe('1L|1|0 Tu 1 Unt 1 Om');
    });
});
