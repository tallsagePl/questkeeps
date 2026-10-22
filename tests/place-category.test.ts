import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeCategory } from '../lib/place-category';

test('place filters distinguish streets, districts, squares, parks and individual attractions', () => {
  for (const [title, summary, kind] of [
    ['Улица Банкалар', 'Улица Банкалар — улица в районе Каракёй.', 'street'],
    ['Галата', 'Галата — исторический район Стамбула.', 'district'],
    ['Таксим', 'Таксим — площадь в Стамбуле.', 'square'],
    ['Гюльхане', 'Гюльхане — городской парк Стамбула.', 'park'],
    ['Таксим (мечеть)', 'Таксим — мечеть в районе Таксим.', 'attraction'],
    ['Central Park', 'Central Park is an urban park in Manhattan.', 'park'],
    ['Trafalgar Square', 'A square in London.', 'square'],
    ['Bankalar Street', 'Bankalar Street is a street in Istanbul.', 'street'],
  ])
    assert.equal(placeCategory({ title, summary }), kind, title);
});
