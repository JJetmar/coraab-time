import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { describe, expect, it } from 'vitest';
import { coraab } from '../src/index.js';
import coraabPlugin from '../src/dayjs.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(coraabPlugin);

describe('dayjs plugin with the timezone plugin', () => {
    // New York leaves daylight saving time on 2026-11-01, between the start of the TU and this date.
    const time = dayjs.tz('2026-11-01T12:34:56Z', 'America/New_York');

    it('finds the right moment and the offset that is valid at that moment', () => {
        const start = time.startOf('tu');
        expect(start.valueOf()).toBe(coraab(time.valueOf()).startOf('tu').valueOf());
        expect(start.format('YYYY-MM-DD HH:mm Z')).toBe('2026-10-18 20:00 -04:00');
    });

    it('updates the offset when adding Coraab units across DST', () => {
        const later = time.subtract(1, 'tol');
        expect(later.valueOf()).toBe(time.valueOf() - 7 * 86_400_000);
        expect(later.format('Z')).toBe('-04:00');
        expect(time.format('Z')).toBe('-05:00');
    });
});
