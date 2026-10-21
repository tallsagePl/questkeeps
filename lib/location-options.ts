import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const codes =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  );
export function locationOptions(
  type: string,
  query: string,
  language: 'ru' | 'en',
  countries: string[],
) {
  const names = new Intl.DisplayNames([language], { type: 'region' });
  const fold = (text: string) =>
    text
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const q = fold(query.trim());
  if (type === 'countries')
    return codes
      .map((id) => ({ id, label: names.of(id) || id }))
      .filter(
        (item) =>
          !q || fold(item.label).includes(q) || item.id.toLowerCase() === q,
      )
      .sort((a, b) => a.label.localeCompare(b.label, language));
  if (type !== 'cities' || q.length < 2) return [];
  const localized = {
    ...require('./data/place-names.json'),
    ...require('./data/place-name-overrides.json'),
  };
  const cities = require('cities.json') as {
    name: string;
    country: string;
    lat: string;
    lng: string;
  }[];
  const matches: { id: string; label: string; country: string }[] = [];
  for (const city of cities) {
    if (countries.length && !countries.includes(city.country)) continue;
    const key =
      city.country +
      '|' +
      city.name +
      '|' +
      Number(city.lat).toFixed(5) +
      '|' +
      Number(city.lng).toFixed(5);
    const label = localized[key]?.[language] || city.name;
    if (fold(label).includes(q) || fold(city.name).includes(q))
      matches.push({ id: key, label, country: city.country });
  }
  return matches
    .sort(
      (a, b) =>
        Number(!fold(a.label).startsWith(q)) -
          Number(!fold(b.label).startsWith(q)) ||
        a.label.localeCompare(b.label, language),
    )
    .slice(0, 40);
}
