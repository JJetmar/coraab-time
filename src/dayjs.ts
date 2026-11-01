import type { ConfigType as DayjsConfigType, Dayjs as DayjsInstance, PluginFunc } from 'dayjs';
import {
    coraab,
    type CoraabInput,
    CoraabTime,
    type CoraabUnit,
    findUnit,
    type StartOfUnit,
    type StartOfUnitInput,
    UNIT_MS,
} from './CoraabTime.js';

// import() types are needed here, declaration emit can't name the namespace members directly.
declare module 'dayjs' {
    interface Dayjs {
        toCoraab(): CoraabTime;
        add(value: number, unit: CoraabUnitInput): import('dayjs').Dayjs;
        subtract(value: number, unit: CoraabUnitInput): import('dayjs').Dayjs;
        startOf(unit: StartOfUnitInput): import('dayjs').Dayjs;
        endOf(unit: StartOfUnitInput): import('dayjs').Dayjs;
        diff(date: import('dayjs').ConfigType, unit: CoraabUnitInput, float?: boolean): number;
    }

    export function fromCoraab(input: CoraabInput): import('dayjs').Dayjs;
}

type CoraabUnitInput = Exclude<StartOfUnitInput, 'coraabDay' | 'coraabDays'>;

const CORAAB_UNITS = new Set<string>(['gul', 'tu', 'tol', 'un', 'unt', 'om']);

// Lower-cased like in Day.js; Day.js units ('d', 'h', 'M', ...) give undefined and go to the original method.
function findCoraabUnit(unit: unknown): CoraabUnit | undefined {
    if (typeof unit !== 'string') return undefined;
    const normalized = findUnit(unit.toLowerCase());
    return normalized !== undefined && CORAAB_UNITS.has(normalized) ? normalized as CoraabUnit : undefined;
}

function findStartOfUnit(unit: unknown): StartOfUnit | undefined {
    if (typeof unit === 'string' && ['coraabday', 'coraabdays'].includes(unit.toLowerCase())) return 'coraabDay';
    return findCoraabUnit(unit);
}

type TimezoneDayjs = DayjsInstance & { $x?: { $timezone?: string }; tz(timezone: string): DayjsInstance };

// Day.js overloads don't type-check with forwarded arguments, so originals are called untyped.
type OriginalMethod<R> = (this: DayjsInstance, ...args: unknown[]) => R;

const coraabPlugin: PluginFunc = (_option, dayjsClass, dayjsFactory) => {
    const proto = dayjsClass.prototype;
    const originalAdd = proto.add as OriginalMethod<DayjsInstance>;
    const originalStartOf = proto.startOf as OriginalMethod<DayjsInstance>;
    const originalEndOf = proto.endOf as OriginalMethod<DayjsInstance>;
    const originalDiff = proto.diff as OriginalMethod<number>;

    // Shifting by ms keeps locale and utc; a timezone instance is converted again, or it keeps its pre-DST offset.
    function moveTo(instance: DayjsInstance, targetMs: number): DayjsInstance {
        const moved = originalAdd.call(instance, targetMs - instance.valueOf(), 'ms') as TimezoneDayjs;
        const timezone = (instance as TimezoneDayjs).$x?.$timezone;
        return timezone === undefined ? moved : moved.tz(timezone);
    }

    proto.toCoraab = function (this: DayjsInstance) {
        return coraab(this.valueOf());
    };

    proto.add = function (this: DayjsInstance, value: number, unit?: string, ...rest: unknown[]) {
        const coraabUnit = findCoraabUnit(unit);
        if (coraabUnit !== undefined) {
            return moveTo(this, this.valueOf() + Math.round(value * UNIT_MS[coraabUnit]));
        }
        return originalAdd.call(this, value, unit, ...rest);
    } as DayjsInstance['add'];
    // No subtract override needed: Day.js subtract calls add with a negative value.

    // Day.js calls startOf(unit, false) from endOf, so extra arguments must be passed through.
    proto.startOf = function (this: DayjsInstance, unit: string, ...rest: unknown[]) {
        const coraabUnit = findStartOfUnit(unit);
        if (coraabUnit !== undefined) {
            return moveTo(this, coraab(this.valueOf()).startOf(coraabUnit).valueOf());
        }
        return originalStartOf.call(this, unit, ...rest);
    } as DayjsInstance['startOf'];

    proto.endOf = function (this: DayjsInstance, unit: string, ...rest: unknown[]) {
        const coraabUnit = findStartOfUnit(unit);
        if (coraabUnit !== undefined) {
            return moveTo(this, coraab(this.valueOf()).endOf(coraabUnit).valueOf());
        }
        return originalEndOf.call(this, unit, ...rest);
    } as DayjsInstance['endOf'];

    proto.diff = function (this: DayjsInstance, date?: DayjsConfigType, unit?: string, float?: boolean, ...rest: unknown[]) {
        const coraabUnit = findCoraabUnit(unit);
        if (coraabUnit !== undefined) {
            const value = originalDiff.call(this, date, 'ms') / UNIT_MS[coraabUnit];
            return float ? value : Math.trunc(value);
        }
        return originalDiff.call(this, date, unit, float, ...rest);
    } as DayjsInstance['diff'];

    (dayjsFactory as unknown as { fromCoraab: (input: CoraabInput) => DayjsInstance }).fromCoraab = (input) => {
        return dayjsFactory(coraab(input).valueOf());
    };
};

export default coraabPlugin;
