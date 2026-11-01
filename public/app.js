import { coraab, TOL_NAMES } from './lib/coraab-time.js';
import { LaserText } from './lasers.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const IDLE_MS = 2000;
const FONT_FAMILY = 'Anton';

const dateText = document.getElementById('date-text');
const tuEnd = document.getElementById('tu-end');
const converter = document.getElementById('converter');

function plural(count, unit) {
    return `${count} Earth ${unit}${count === 1 ? '' : 's'}`;
}

function describeDuration(ms) {
    const days = Math.floor(ms / DAY);
    if (days > 1) return plural(days, 'day');

    const hours = Math.floor(ms / HOUR);
    if (hours > 1) return plural(hours, 'hour');

    const minutes = Math.floor(ms / MINUTE);
    if (minutes > 1) return plural(minutes, 'minute');

    return plural(Math.floor(ms / SECOND), 'second');
}

function describeCoraab(time) {
    return time.format("MMMM[, ]dddd[ · ]gggg[ of GUL ]G");
}

function buildLines(time, isPortrait) {
    const un = { key: 'un', text: time.format('Hd'), slot: '00H', label: time.format('[UN · ]dddd').toUpperCase() };
    const tol = { key: 'tol', text: time.format('M'), slot: '0', label: time.format('[TOL · ]MMMM').toUpperCase() };
    const tu = { key: 'tu', text: time.format('Y'), slot: '0000', label: time.format('[TU · ]gggg').toUpperCase() };
    const tuUnit = { text: ' Tu' };
    const separator = { text: ' | ' };
    const timeLine = {
        size: 0.6,
        segments: [
            { key: 'unt', text: time.format('m'), slot: '00' },
            { text: ' Unt   ' },
            { key: 'om', text: time.format('s'), slot: '00' },
            { text: ' Om' },
        ],
    };

    // Narrow screens put TU on its own line, so the date can stay large, and keep the same gap between all three lines.
    if (isPortrait) {
        return [
            { size: 1, labelSize: 0.16, segments: [un, separator, tol] },
            { size: 1, labelSize: 0.16, segments: [tu, tuUnit] },
            timeLine,
        ];
    }
    return [
        { size: 1, labelSize: 0.16, segments: [un, separator, tol, separator, tu, tuUnit] },
        { ...timeLine, gapBefore: 0.84, shift: -0.03 },
    ];
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const video = document.querySelector('.background');
if (!reducedMotion) {
    video.preload = 'auto';
    video.play().catch(() => {});
}

let lasers = null;
try {
    lasers = new LaserText(document.getElementById('lasers'), { fontFamily: FONT_FAMILY, animate: !reducedMotion });
} catch (error) {
    console.warn('Falling back to plain text:', error);
    document.body.classList.add('no-webgl');
}
const laserCanvas = document.getElementById('lasers');
laserCanvas.addEventListener('webglcontextlost', () => document.body.classList.add('no-webgl'));
laserCanvas.addEventListener('webglcontextrestored', () => document.body.classList.remove('no-webgl'));

let previousText = null;
let previousLines = null;
let previousIsPortrait = null;

function renderDate() {
    const now = coraab();
    tuEnd.textContent = describeDuration(now.startOf('tu').add(1, 'tu').diff(now));

    const isPortrait = window.innerWidth / window.innerHeight < 0.8;
    const text = now.toString();
    if (text === previousText && isPortrait === previousIsPortrait) return;

    const lines = buildLines(now, isPortrait);
    const changedKeys = new Set();
    for (const [lineIndex, line] of lines.entries()) {
        for (const [segmentIndex, segment] of line.segments.entries()) {
            const previous = previousLines?.[lineIndex]?.segments[segmentIndex]?.text;
            const isLayoutChange = isPortrait !== previousIsPortrait;
            if (segment.key !== undefined && previousLines !== null && !isLayoutChange && previous !== segment.text) {
                changedKeys.add(segment.key);
            }
        }
    }

    dateText.textContent = text;
    lasers?.setLines(lines, changedKeys);
    previousText = text;
    previousLines = lines;
    previousIsPortrait = isPortrait;
}

let idleTimer;

function wake() {
    document.body.classList.add('awake');
    lasers?.setLabelsVisible(true);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(sleep, IDLE_MS);
}

function sleep() {
    if (converter.open) return;
    document.body.classList.remove('awake');
    lasers?.setLabelsVisible(false);
}

// The first press on a sleeping screen only wakes it, so it can't hit the still invisible controls.
let swallowClick = false;
window.addEventListener('pointerdown', () => {
    swallowClick = !document.body.classList.contains('awake');
}, { capture: true });
window.addEventListener('click', (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
}, { capture: true });

for (const eventName of ['pointermove', 'pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(eventName, wake, { passive: true });
}

function pad(value) {
    return String(value).padStart(2, '0');
}

// Date inputs want local time and a year with at least 4 digits.
function toDateValue(date) {
    return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeValue(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

const earthDate = document.getElementById('earth-date');
const earthTime = document.getElementById('earth-time');
const earthSource = document.getElementById('earth-source');
const coraabSource = document.getElementById('coraab-source');
const sourceName = document.getElementById('source-name');
const targetName = document.getElementById('target-name');
const swapButton = document.getElementById('swap');
const result = document.getElementById('result');
const resultDetail = document.getElementById('result-detail');
const fields = {
    tu: document.getElementById('field-tu'),
    tol: document.getElementById('field-tol'),
    day: document.getElementById('field-day'),
    un: document.getElementById('field-un'),
    unt: document.getElementById('field-unt'),
    om: document.getElementById('field-om'),
};

for (const [index, name] of TOL_NAMES.entries()) {
    fields.tol.add(new Option(`${index + 1} ${name}`, String(index + 1)));
}

let fromEarth = true;

function readSource() {
    // An empty time counts as midnight; an empty date makes the result invalid.
    if (fromEarth) return coraab(new Date(`${earthDate.value}T${earthTime.value || '00:00'}`));

    fields.un.max = fields.day.value === 'L' ? '96' : '72';
    const isComplete = [fields.tu, fields.un, fields.unt, fields.om].every((input) => input.value.trim() !== '');
    if (!isComplete) return coraab(null);
    return coraab(`${fields.un.value}${fields.day.value}|${fields.tol.value}|${fields.tu.value} Tu ${fields.unt.value} Unt ${fields.om.value} Om`);
}

function fillSource(time) {
    if (fromEarth) {
        earthDate.value = time.isValid() ? toDateValue(time.toDate()) : '';
        earthTime.value = time.isValid() ? toTimeValue(time.toDate()) : '';
        return;
    }
    if (!time.isValid()) {
        for (const input of [fields.tu, fields.un, fields.unt, fields.om]) input.value = '';
        return;
    }
    const parts = time.toParts();
    fields.tu.value = String(parts.tu);
    fields.tol.value = String(parts.tol);
    fields.day.value = parts.day === 'oonar' ? 'L' : 'H';
    fields.un.value = String(parts.un);
    fields.unt.value = String(parts.unt);
    fields.om.value = String(parts.om);
}

function convert() {
    const time = readSource();
    result.classList.toggle('result-earth', !fromEarth);
    if (!time.isValid()) {
        result.textContent = '—';
        resultDetail.textContent = fromEarth
            ? 'Pick an Earth date and time. The picker only goes back to year 1.'
            : `Use whole numbers: UN 1–${fields.un.max}, UNT 1–12, OM 1–60.`;
        return;
    }
    if (fromEarth) {
        result.textContent = time.toString();
        resultDetail.textContent = describeCoraab(time);
    } else {
        const date = time.toDate();
        // Without the era, 15508 BC would read as AD 15508.
        const era = date.getFullYear() < 1 ? 'short' : undefined;
        result.textContent = date.toLocaleString(undefined, {
            era, year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
        });
        resultDetail.textContent = `UTC ${time.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')}`;
    }
}

// Like a translator: the current result becomes the new source after swapping.
function swap() {
    const time = readSource();
    fromEarth = !fromEarth;
    earthSource.hidden = !fromEarth;
    coraabSource.hidden = fromEarth;
    sourceName.textContent = fromEarth ? 'Earth time' : 'Coraab time';
    targetName.textContent = fromEarth ? 'Coraab time' : 'Earth time';
    swapButton.classList.toggle('turned');
    fillSource(time);
    convert();
}

earthDate.addEventListener('input', convert);
earthTime.addEventListener('input', convert);
for (const field of Object.values(fields)) {
    field.addEventListener('input', convert);
}
for (const field of [fields.un, fields.unt, fields.om]) {
    field.addEventListener('change', () => {
        if (field.value === '' || Number(field.value) >= 1) return;
        field.value = '1';
        convert();
    });
}
swapButton.addEventListener('click', swap);
document.getElementById('converter-now').addEventListener('click', () => {
    fillSource(coraab());
    convert();
});
document.getElementById('open-converter').addEventListener('click', () => {
    fillSource(coraab(startOfToday()));
    convert();
    converter.showModal();
});
converter.addEventListener('close', wake);
converter.addEventListener('click', (event) => {
    if (event.target === converter) converter.close();
});

// The laser mask is drawn with canvas text, so the font must be ready before the first frame.
await document.fonts.load(`100px ${FONT_FAMILY}`).catch(() => {});
renderDate();
setInterval(renderDate, 250);
wake();
