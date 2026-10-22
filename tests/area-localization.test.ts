import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  russianAreaTitle,
  russianAreaDescription,
} from '../lib/area-localization';

test('Russian source names win and Turkish fallback uses Cyrillic without administrative suffixes', () => {
  assert.equal(russianAreaTitle('Джанкуртаран', 'TR'), 'Джанкуртаран');
  assert.equal(russianAreaTitle('Cankurtaran Mahallesi', 'TR'), 'Джанкуртаран');
  assert.equal(russianAreaTitle('Bankalar Caddesi', 'TR'), 'Банкалар');
  assert.equal(
    russianAreaTitle('Kemankeş Karamustafa Paşa Mahallesi', 'TR'),
    'Кеманкеш Карамустафа Паша',
  );
  assert.equal(
    russianAreaDescription('Джанкуртаран', 'district'),
    'Городской район Джанкуртаран.',
  );
  assert.equal(russianAreaTitle('Rue de Paris', 'FR'), 'Rue de Paris');
});
