import {
    EPOCH_MS,
    GUL_MS,
    HAKKAR_UNS,
    OM_MS,
    OONAR_UNS,
    TOL_MS,
    TOL_NAMES,
    TU_MS,
    TU_NAMES,
    UN_MS,
    UNT_MS,
} from './constants.js';

export type CoraabDay = 'oonar' | 'hakkar';

export interface CoraabParts {
    gul: number;
    tuOfGul: number;
    tu: number;
    tol: number;
    day: CoraabDay;
    un: number;
    unt: number;
    om: number;
    millisecond: number;
}

export type CoraabPartsInput = Pick<CoraabParts, 'tu'> & Partial<Pick<CoraabParts, 'tol' | 'day' | 'un' | 'unt' | 'om' | 'millisecond'>>;

export type CoraabUnit = 'gul' | 'tu' | 'tol' | 'un' | 'unt' | 'om';
export type EarthUnit = 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week';
export type DurationUnit = CoraabUnit | EarthUnit;
export type StartOfUnit = CoraabUnit | 'coraabDay';
export type StartOfUnitInput = StartOfUnit | 'coraabDays' | 'guls' | 'tus' | 'tols' | 'uns' | 'unts' | 'oms';

const UNIT_ALIASES = {
    gul: 'gul', guls: 'gul',
    tu: 'tu', tus: 'tu',
    tol: 'tol', tols: 'tol',
    un: 'un', uns: 'un',
    unt: 'unt', unts: 'unt',
    om: 'om', oms: 'om',
    millisecond: 'millisecond', milliseconds: 'millisecond', ms: 'millisecond',
    second: 'second', seconds: 'second', s: 'second',
    minute: 'minute', minutes: 'minute', m: 'minute',
    hour: 'hour', hours: 'hour', h: 'hour',
    day: 'day', days: 'day', d: 'day',
    week: 'week', weeks: 'week', w: 'week',
} as const satisfies Record<string, DurationUnit>;

export type DurationUnitInput = keyof typeof UNIT_ALIASES;

export const UNIT_MS: Record<DurationUnit, number> = {
    gul: GUL_MS,
    tu: TU_MS,
    tol: TOL_MS,
    un: UN_MS,
    unt: UNT_MS,
    om: OM_MS,
    millisecond: 1,
    second: 1_000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
};

const CORAAB_UNIT_LEVELS: Record<StartOfUnit, number> = {
    gul: 0, tu: 1, tol: 2, coraabDay: 3, un: 4, unt: 5, om: 6,
};

export function findUnit(unit: string): DurationUnit | undefined {
    return Object.hasOwn(UNIT_ALIASES, unit) ? UNIT_ALIASES[unit as DurationUnitInput] : undefined;
}

function normalizeUnit(unit: string): DurationUnit {
    const normalized = findUnit(unit);
    if (normalized === undefined) throw new Error(`Unknown unit: ${unit}`);
    return normalized;
}

function normalizeStartOfUnit(unit: string): StartOfUnit {
    if (unit === 'coraabDay' || unit === 'coraabDays') return 'coraabDay';
    const normalized = normalizeUnit(unit);
    if (!(normalized in CORAAB_UNIT_LEVELS)) throw new Error(`Unit ${unit} can't be used with startOf/endOf`);
    return normalized as CoraabUnit;
}

export function unitLength(unit: DurationUnitInput): number {
    return UNIT_MS[normalizeUnit(unit)];
}

export function toParts(ms: number): CoraabParts {
    const sinceEpoch = ms - EPOCH_MS;

    const tu = Math.floor(sinceEpoch / TU_MS);
    const inTu = sinceEpoch - tu * TU_MS;

    const tolIndex = Math.floor(inTu / TOL_MS);
    const inTol = inTu - tolIndex * TOL_MS;

    const isOonar = inTol < OONAR_UNS * UN_MS;
    const inDay = isOonar ? inTol : inTol - OONAR_UNS * UN_MS;

    const unIndex = Math.floor(inDay / UN_MS);
    const inUn = inDay - unIndex * UN_MS;

    const untIndex = Math.floor(inUn / UNT_MS);
    const inUnt = inUn - untIndex * UNT_MS;

    const omIndex = Math.floor(inUnt / OM_MS);
    const gulIndex = Math.floor(tu / 6);

    return {
        gul: gulIndex + 1,
        tuOfGul: tu - gulIndex * 6 + 1,
        tu,
        tol: tolIndex + 1,
        day: isOonar ? 'oonar' : 'hakkar',
        un: unIndex + 1,
        unt: untIndex + 1,
        om: omIndex + 1,
        millisecond: inUnt - omIndex * OM_MS,
    };
}

// Ignores gul and tuOfGul, they are derived from tu. Out-of-range values roll over like in Day.js.
export function fromParts(parts: CoraabParts): number {
    return EPOCH_MS
        + parts.tu * TU_MS
        + (parts.tol - 1) * TOL_MS
        + (parts.day === 'hakkar' ? OONAR_UNS * UN_MS : 0)
        + (parts.un - 1) * UN_MS
        + (parts.unt - 1) * UNT_MS
        + (parts.om - 1) * OM_MS
        + parts.millisecond;
}

export const DEFAULT_FORMAT = 'Hd|M|Y [Tu] m [Unt] s [Om]';

const FORMAT_TOKENS = /\[([^\]]*)]|gggg|g|G|Y|MMMM|MM|M|dddd|d|HH|H|mm|m|ss|s/g;

// "4273 Tu", "6|4273 Tu", "54L|6|4273 Tu" or "54L|6|4273 Tu 5 Unt 31 Om"; the wiki also writes TU with − or –.
const CORAAB_PATTERN = /^\s*(?:(?:(\d{1,2})([LH])\s*\|\s*)?(\d)\s*\|\s*)?([-−–]?\d+)\s*Tu(?:\s+(\d{1,2})\s*Unt(?:\s+(\d{1,2})\s*Om)?)?\s*$/i;

export function parseCoraab(text: string): number {
    const match = CORAAB_PATTERN.exec(text);
    if (match === null) return NaN;

    const [, unText, dayLetter, tolText, tuText, untText, omText] = match;
    if (untText !== undefined && unText === undefined) return NaN;

    const day: CoraabDay = dayLetter?.toUpperCase() === 'H' ? 'hakkar' : 'oonar';
    const un = unText === undefined ? 1 : Number(unText);
    const tol = tolText === undefined ? 1 : Number(tolText);
    const tu = Number(tuText!.replace(/[−–]/, '-'));
    const unt = untText === undefined ? 1 : Number(untText);
    const om = omText === undefined ? 1 : Number(omText);

    const unsInDay = day === 'oonar' ? OONAR_UNS : HAKKAR_UNS;
    const isInRange = un >= 1 && un <= unsInDay
        && tol >= 1 && tol <= 8
        && unt >= 1 && unt <= 12
        && om >= 1 && om <= 60;
    if (!isInRange) return NaN;

    return fromParts({ gul: 0, tuOfGul: 0, tu, tol, day, un, unt, om, millisecond: 0 });
}

export type CoraabInput = CoraabTime | Date | number | string | null | { valueOf(): number };

// Same limit as Date, so toDate() and toISOString() always work for valid instances.
const MAX_MS = 8.64e15;

function inputToMs(input: CoraabInput): number {
    if (input === null) return NaN;
    if (typeof input === 'number') return input;
    if (typeof input === 'string') {
        const coraabMs = parseCoraab(input);
        return Number.isNaN(coraabMs) ? Date.parse(input) : coraabMs;
    }
    return input.valueOf();
}

type SettableUnit = CoraabUnit;

export class CoraabTime {
    readonly #ms: number;

    // Truncated like Date does, so equal inputs give equal instances here and in Date or Day.js.
    constructor(input: CoraabInput = Date.now()) {
        this.#ms = Math.trunc(inputToMs(input));
    }

    isValid(): boolean {
        return Number.isFinite(this.#ms) && Math.abs(this.#ms) <= MAX_MS;
    }

    toParts(): CoraabParts {
        return toParts(this.#ms);
    }

    get(unit: SettableUnit): number {
        return toParts(this.#ms)[unit];
    }

    set(unit: SettableUnit, value: number): CoraabTime {
        const parts = toParts(this.#ms);
        if (unit === 'gul') {
            parts.tu = (value - 1) * 6 + parts.tuOfGul - 1;
        } else {
            parts[unit] = value;
        }
        return new CoraabTime(fromParts(parts));
    }

    gul(): number;
    gul(value: number): CoraabTime;
    gul(value?: number): number | CoraabTime {
        return value === undefined ? this.get('gul') : this.set('gul', value);
    }

    tu(): number;
    tu(value: number): CoraabTime;
    tu(value?: number): number | CoraabTime {
        return value === undefined ? this.get('tu') : this.set('tu', value);
    }

    tol(): number;
    tol(value: number): CoraabTime;
    tol(value?: number): number | CoraabTime {
        return value === undefined ? this.get('tol') : this.set('tol', value);
    }

    un(): number;
    un(value: number): CoraabTime;
    un(value?: number): number | CoraabTime {
        return value === undefined ? this.get('un') : this.set('un', value);
    }

    unt(): number;
    unt(value: number): CoraabTime;
    unt(value?: number): number | CoraabTime {
        return value === undefined ? this.get('unt') : this.set('unt', value);
    }

    om(): number;
    om(value: number): CoraabTime;
    om(value?: number): number | CoraabTime {
        return value === undefined ? this.get('om') : this.set('om', value);
    }

    tuOfGul(): number {
        return toParts(this.#ms).tuOfGul;
    }

    coraabDay(): CoraabDay {
        return toParts(this.#ms).day;
    }

    add(value: number, unit: DurationUnitInput = 'millisecond'): CoraabTime {
        return new CoraabTime(this.#ms + Math.round(value * unitLength(unit)));
    }

    subtract(value: number, unit: DurationUnitInput = 'millisecond'): CoraabTime {
        return this.add(-value, unit);
    }

    startOf(unit: StartOfUnitInput): CoraabTime {
        const parts = toParts(this.#ms);
        const level = CORAAB_UNIT_LEVELS[normalizeStartOfUnit(unit)];

        if (level <= 0) parts.tu = (parts.gul - 1) * 6;
        if (level <= 1) parts.tol = 1;
        if (level <= 2) parts.day = 'oonar';
        if (level <= 3) parts.un = 1;
        if (level <= 4) parts.unt = 1;
        if (level <= 5) parts.om = 1;
        parts.millisecond = 0;

        return new CoraabTime(fromParts(parts));
    }

    endOf(unit: StartOfUnitInput): CoraabTime {
        const normalized = normalizeStartOfUnit(unit);
        const start = this.startOf(normalized);
        if (normalized === 'coraabDay') {
            const unsInDay = start.coraabDay() === 'oonar' ? OONAR_UNS : HAKKAR_UNS;
            return start.add(unsInDay, 'un').subtract(1);
        }
        return start.add(1, normalized).subtract(1);
    }

    diff(other: CoraabInput, unit: DurationUnitInput = 'millisecond', float = false): number {
        const value = (this.#ms - inputToMs(other)) / unitLength(unit);
        return float ? value : Math.trunc(value);
    }

    isBefore(other: CoraabInput, unit?: StartOfUnitInput): boolean {
        const otherMs = inputToMs(other);
        return unit === undefined ? this.#ms < otherMs : this.endOf(unit).valueOf() < otherMs;
    }

    isAfter(other: CoraabInput, unit?: StartOfUnitInput): boolean {
        const otherMs = inputToMs(other);
        return unit === undefined ? this.#ms > otherMs : this.startOf(unit).valueOf() > otherMs;
    }

    isSame(other: CoraabInput, unit?: StartOfUnitInput): boolean {
        const otherMs = inputToMs(other);
        if (unit === undefined) return this.#ms === otherMs;
        return this.startOf(unit).valueOf() <= otherMs && otherMs <= this.endOf(unit).valueOf();
    }

    format(template: string = DEFAULT_FORMAT): string {
        if (!this.isValid()) return 'Invalid Date';
        const parts = toParts(this.#ms);
        const pad = (value: number) => String(value).padStart(2, '0');

        return template.replace(FORMAT_TOKENS, (token, escaped: string | undefined) => {
            if (escaped !== undefined) return escaped;
            switch (token) {
                case 'G': return String(parts.gul);
                case 'g': return String(parts.tuOfGul);
                case 'gggg': return TU_NAMES[parts.tuOfGul - 1]!;
                case 'Y': return String(parts.tu);
                case 'M': return String(parts.tol);
                case 'MM': return pad(parts.tol);
                case 'MMMM': return TOL_NAMES[parts.tol - 1]!;
                case 'd': return parts.day === 'oonar' ? 'L' : 'H';
                case 'dddd': return parts.day === 'oonar' ? 'Oonar' : 'Hakkar';
                case 'H': return String(parts.un);
                case 'HH': return pad(parts.un);
                case 'm': return String(parts.unt);
                case 'mm': return pad(parts.unt);
                case 's': return String(parts.om);
                case 'ss': return pad(parts.om);
                default: return token;
            }
        });
    }

    clone(): CoraabTime {
        return new CoraabTime(this.#ms);
    }

    valueOf(): number {
        return this.#ms;
    }

    unix(): number {
        return Math.floor(this.#ms / 1000);
    }

    toDate(): Date {
        return new Date(this.#ms);
    }

    toISOString(): string {
        return this.toDate().toISOString();
    }

    // JSON keeps full precision, the Coraab string is only precise to one OM (5 seconds).
    toJSON(): string | null {
        return this.isValid() ? this.toISOString() : null;
    }

    toString(): string {
        return this.format();
    }
}

export function coraab(input?: CoraabInput): CoraabTime {
    return new CoraabTime(input);
}

coraab.unix = (seconds: number): CoraabTime => new CoraabTime(seconds * 1000);

// Missing parts start at the beginning, like in Coraab strings; out-of-range values roll over like in setters.
coraab.from = (parts: CoraabPartsInput): CoraabTime => new CoraabTime(fromParts({
    gul: 0,
    tuOfGul: 0,
    tu: parts.tu,
    tol: parts.tol ?? 1,
    day: parts.day ?? 'oonar',
    un: parts.un ?? 1,
    unt: parts.unt ?? 1,
    om: parts.om ?? 1,
    millisecond: parts.millisecond ?? 0,
}));
coraab.isCoraab = (value: unknown): value is CoraabTime => value instanceof CoraabTime;
