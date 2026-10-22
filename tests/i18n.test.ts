import assert from 'node:assert/strict';
import test from 'node:test';
import russian from '../lib/i18n/ru.json';
import english from '../lib/i18n/en.json';
import {
  translate,
  localizeMessage,
  type TranslationKey,
} from '../lib/i18n/translate';
import { withMessageTranslations } from '../lib/i18n/messages';

test('locale dictionaries have identical keys and interpolation parameters', () => {
  assert.deepEqual(Object.keys(russian).sort(), Object.keys(english).sort());
  for (const key of Object.keys(russian) as TranslationKey[]) {
    assert.ok(russian[key].length > 0, key);
    assert.ok(english[key].length > 0, key);
    const parameters = (value: string) =>
      [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)]
        .map((match) => match[1])
        .sort();
    assert.deepEqual(parameters(russian[key]), parameters(english[key]), key);
  }
});

test('translation is explicit, interpolates values literally and preserves user text', () => {
  assert.equal(translate('common.save', 'en'), 'Save');
  assert.equal(translate('common.save', 'ru'), 'Сохранить');
  assert.equal(
    translate('validation.minLength', 'en', { count: 12 }),
    'At least 12 characters',
  );
  assert.equal(
    translate('inference.partialDates', 'ru', { dated: 2, total: 3 }),
    'Даты найдены у 2 из 3 фото — проверьте период',
  );
  assert.equal(
    translate('destination.remove', 'en', { name: '$& {name} <hello>' }),
    'Remove: $& {name} <hello>',
  );
  for (const text of ['Start', 'Начало', ' Мой личный маршрут ', 'Save']) {
    assert.equal(localizeMessage(text, 'ru'), text);
    assert.equal(localizeMessage(text, 'en'), text);
  }
  const message = {
    key: 'validation.minLength' as const,
    params: { count: 8 },
  };
  assert.equal(localizeMessage(message, 'en'), 'At least 8 characters');
  assert.equal(localizeMessage(message, 'ru'), 'Минимум 8 символов');
  assert.throws(
    () => translate('validation.minLength', 'en'),
    /Missing translation parameter/,
  );
  assert.throws(
    () => translate('not.a.key' as TranslationKey, 'en'),
    /Unknown translation key/,
  );
});

test('API translation metadata leaves user content and large geometry untouched', () => {
  const geometry = {
    coordinates: [
      [1, 2],
      [3, 4],
    ],
    type: 'LineString',
  };
  const input = {
    error: 'Неверный email, никнейм или пароль',
    title: 'Начало',
    notes: [{ text: 'Сохранить' }],
    geometry,
    fieldErrors: { password: 'Неверный email, никнейм или пароль' },
    sources: [{ error: 'Аккаунт не найден' }],
  };
  const result = withMessageTranslations(input) as any;
  assert.equal(result.error, input.error);
  assert.equal(result.errorTranslation.key, 'auth.invalidCredentials');
  assert.equal(
    result.fieldErrorsTranslations.password.key,
    'auth.invalidCredentials',
  );
  assert.equal(result.title, 'Начало');
  assert.strictEqual(result.notes, input.notes);
  assert.strictEqual(result.geometry, geometry);
  assert.ok(result.sources[0].errorTranslation.key);
  assert.equal((input as any).errorTranslation, undefined);
});
