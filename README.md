# Coraab-time

Work with time in the units of Coraab, the planet of the [Coraabia](https://coraabia.fandom.com/wiki/Coraabia_Wiki) universe.
The API is similar to [Day.js](https://day.js.org/), and the package also ships an optional Day.js plugin.

Live clock and converter: <https://jjetmar.github.io/coraab-time>

## Coraab units

| Unit | Length | Notes |
| --- | --- | --- |
| OM | 5 Earth seconds | 60 OM = 1 UNT |
| UNT | 5 Earth minutes | 12 UNT = 1 UN |
| UN | 1 Earth hour | |
| Oonar (Light Day) | 96 UN | first day of a TOL |
| Hakkar (Haze Day) | 72 UN | second day of a TOL |
| TOL | 168 UN = 7 Earth days | 8 TOL = 1 TU (Ta'Tol … Raa'Tol) |
| TU | 56 Earth days | the Coraab "year", TU 0 starts on 1358-08-14 UTC |
| GUL | 6 TU = 336 Earth days | Ta'Tu … Ro'Tu |

TU starts at 0 and can be negative. GUL, TOL, UN, UNT and OM start at 1, so GUL 1 is TU 0–5 and GUL 714 ends when TU 4284 starts.

## Install

```sh
npm install coraab-time
```

## Usage

```ts
import { coraab } from 'coraab-time';

const now = coraab();                  // current time
now.toString();                        // "53H|2|4358 Tu 4 Unt 60 Om"
now.format('MMMM, dddd');              // "Nuu'Tol, Hakkar"
now.tu();                              // 4358
now.tol(3);                            // new instance in TOL 3 (instances are immutable)

coraab('54L|6|4273 Tu').toDate();      // Coraab -> Earth
coraab(new Date('2026-11-01'));        // Earth -> Coraab
coraab('2026-11-01T12:00:00Z');        // Earth strings work too

now.add(2, 'tol').subtract(3, 'days');
now.startOf('tu').add(1, 'tu').diff(now, 'second'); // seconds until the next TU
```

### Creating a date from parts

`coraab.from(parts)` creates an exact date. Only `tu` is required, and missing parts start at the beginning (Oonar, 1, 0 ms), like in Coraab strings:

```ts
const time = coraab.from({ tu: 4360, tol: 5, un: 12, unt: 3, om: 30 });

time.toString();                       // "12L|5|4360 Tu 3 Unt 30 Om"
time.format('MMMM, dddd');             // "Tha'Tol, Oonar"

coraab.from({ tu: 4360, tol: 5, day: 'hakkar', un: 10 }).toString(); // "10H|5|4360 Tu 1 Unt 1 Om"
```

Values out of range roll over, for example `un: 97` on Oonar gives Hakkar UN 1.

### Changing units

Setters change one unit and keep the rest. Each one returns a new instance, so they can be chained:

```ts
time.tol(6).un(20).toString();         // "20L|6|4360 Tu 3 Unt 30 Om"
time.gul(800).toString();              // "12L|5|4798 Tu 3 Unt 30 Om" (TU 5 of GUL 800)
time.set('tol', 6).set('un', 20);      // the same as the first line
```

`un()` counts within the current day. There is no setter for the day itself, so use `coraab.from` to pick Oonar or Hakkar.

### Input

`coraab(input?)` accepts a `Date`, a timestamp in milliseconds, a Coraab string, an Earth date string, another `CoraabTime`,
or any object with `valueOf()` (for example a Day.js instance). `null` and unparsable strings give an invalid instance, like in Day.js.

Coraab strings can be written as `4273 Tu`, `6|4273 Tu` (TOL|TU), `54L|6|4273 Tu`, `54L|6|4273 Tu 5 Unt` or `54L|6|4273 Tu 5 Unt 31 Om`.
Unit names and `Tu` are not case-sensitive.
Missing parts default to 1.
`coraab.unix(seconds)` creates an instance from Unix seconds, and `coraab.from(parts)` from Coraab parts (see above).

### Units

- `add` / `subtract` / `diff`: `gul`, `tu`, `tol`, `un`, `unt`, `om` and Earth units `millisecond`, `second`, `minute`, `hour`, `day`, `week`.
  Plurals (`tols`, `days`) and short names (`ms`, `s`, `m`, `h`, `d`, `w`) work too.
- `startOf` / `endOf` / `isSame` / `isBefore` / `isAfter`: `gul`, `tu`, `tol`, `coraabDay` (Oonar or Hakkar), `un`, `unt`, `om` (plurals work too).
- Fractional amounts are rounded to whole milliseconds. Unknown units throw an error.
- Getters and setters: `gul()`, `tu()`, `tol()`, `un()`, `unt()`, `om()`, plus `get(unit)` and `set(unit, value)`.
  Values out of range roll over, for example `un(97)` in Oonar moves to Hakkar UN 1.
- Read only: `tuOfGul()`, `coraabDay()` (`'oonar'` or `'hakkar'`), `toParts()`.

### Format tokens

| Token | Output | Example |
| --- | --- | --- |
| `Y` | TU | `4358` |
| `G` | GUL | `727` |
| `g` | TU in GUL (1–6) | `3` |
| `gggg` | TU name | `Ka'Tu` |
| `M` / `MM` | TOL (1–8) | `2` / `02` |
| `MMMM` | TOL name | `Nuu'Tol` |
| `d` | day letter | `L` (Oonar) / `H` (Hakkar) |
| `dddd` | day name | `Oonar` / `Hakkar` |
| `H` / `HH` | UN in the day | `7` / `07` |
| `m` / `mm` | UNT | `4` / `04` |
| `s` / `ss` | OM | `9` / `09` |
| `[text]` | escaped text | `[Tu]` |

`toString()` uses `Hd|M|Y [Tu] m [Unt] s [Om]`, which extends the wiki's notation (`54L|6|4273 Tu`) with UNT and OM: `54L|6|4273 Tu 5 Unt 31 Om`.
The wiki text only ever uses `L`. `H` for Hakkar comes from the news images on [coraabopedia.cz](https://coraabopedia.cz/wiki/Coraabia_News), which are named `TU_TOL_L` / `TU_TOL_H` and whose upload times match this library's Oonar/Hakkar periods.
Coraab strings are precise to one OM (5 seconds). `toJSON()` returns an ISO string so no precision is lost.

### Conversion

`valueOf()`, `unix()`, `toDate()`, `toISOString()`, `toJSON()`, `clone()`, `isValid()`.

## Day.js plugin

```ts
import dayjs from 'dayjs';
import coraabPlugin from 'coraab-time/dayjs';

dayjs.extend(coraabPlugin);

dayjs().add(1, 'tol');
dayjs().startOf('tu');
dayjs().diff(other, 'tu');
dayjs().toCoraab().toString();
dayjs.fromCoraab('54L|6|4273 Tu');
```

With CommonJS use `dayjs.extend(require('coraab-time/dayjs'))`.

With the `timezone` plugin, extend `timezone` first and this plugin after it.
In the other order `timezone` passes a shifted wall-clock time to `startOf`, so Coraab units would be off by the timezone offset.

## Development

```sh
npm install
npm test
npm run typecheck
npm run build        # builds dist/ and the browser bundle in public/lib/
```

To preview the page, run `npm run build` and then `npx http-server public -c-1` (`-c-1` turns off caching, so you always see the latest files).

Publishing to npm is done by hand: bump the version in `package.json`, then run `npm publish` (it runs typecheck, tests and build first).

## Sources

[Coraabopedia](https://coraabopedia.cz) (the official Czech wiki):

- [Tu](https://coraabopedia.cz/wiki/Tu): TU, 8 TOL names, TU 0 = start of the Excavation
- [Tol](https://coraabopedia.cz/wiki/Tol): TOL names, Oonar and Hakkar, the older "small tols"
- [Gul](https://coraabopedia.cz/wiki/Gul): 6 TU names, GUL numbering ("V 4284 Tu tak bude završen 714 Gul")
- [Un](https://coraabopedia.cz/wiki/Un), [Unt](https://coraabopedia.cz/wiki/Unt), [Om](https://coraabopedia.cz/wiki/Om): lengths of the small units
- [Den Světla](https://coraabopedia.cz/wiki/Den_Sv%C4%9Btla) (Oonar) and [Den Šera](https://coraabopedia.cz/wiki/Den_%C5%A0era) (Hakkar): 96 and 72 UN
- [Časová osa](https://coraabopedia.cz/wiki/%C4%8Casov%C3%A1_osa): timeline with dates in TU
- [Coraabia News](https://coraabopedia.cz/wiki/Coraabia_News): dated news; its image names and upload times confirm the epoch and the `L` / `H` letters

[Coraabia Wiki](https://coraabia.fandom.com/wiki/Coraabia_Wiki) (English, on Fandom):

- [Tu](https://coraabia.fandom.com/wiki/Tu), [Tol](https://coraabia.fandom.com/wiki/Tol), [Gul](https://coraabia.fandom.com/wiki/Gul),
  [Un](https://coraabia.fandom.com/wiki/Un), [Unt](https://coraabia.fandom.com/wiki/Unt), [Om](https://coraabia.fandom.com/wiki/Om),
  [Light Day](https://coraabia.fandom.com/wiki/Light_Day), [Haze Day](https://coraabia.fandom.com/wiki/Haze_Day)
- [Gu-Rang](https://coraabia.fandom.com/wiki/Gu-Rang): examples of the date notation (`7L|6|4270 Tu`)

The epoch (TU 0 = 1358-08-14 UTC) comes from the original version of this page.

## Credits

Background video generated with Google Gemini. Font [Anton](https://fonts.google.com/specimen/Anton) by The Anton Project Authors, self-hosted under the SIL Open Font License (see `public/fonts/Anton-OFL.txt`).

## License

MIT
