import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAttraction } from '../lib/attractions';

test('отбор достопримечательностей исключает события, районы и обычные улицы, сохраняя физические памятники', () => {
  const no = [
    {
      title: 'Галата (станция метро)',
      terms: { description: ['станция в историческом районе города'] },
    },
    {
      title: 'Румянцево (станция метро)',
      categories: [{ title: 'Категория:Колонные станции мелкого заложения' }],
    },
    { title: 'Аэропорт Внуково (станция метро)' },
    { title: 'Красные Ворота (станция метро)' },
    {
      title: 'Румянцево',
      terms: { description: ['станция Московского метрополитена'] },
      categories: [{ title: 'Категория:Достопримечательности Москвы' }],
    },
    {
      title: 'Станция без пометки',
      categories: [{ title: 'Категория:Колонные станции мелкого заложения' }],
    },
    { title: 'Аэропорт Внуково' },
    { title: 'Катастрофа Ту-104 во Внукове' },
    {
      title: 'Внуково (район Москвы)',
      categories: [{ title: 'Категория:Достопримечательности Москвы' }],
    },
    {
      title: 'Насосная улица (Москва)',
      terms: { description: ['улица в Москве'] },
      categories: [{ title: 'Категория:Улицы Москвы' }],
    },
    {
      title: 'Осада Константинополя (1203)',
      categories: [{ title: 'Категория:Сражения' }],
    },
    { title: 'Внуково', terms: { description: ['район Москвы'] } },
  ];
  for (const page of no) assert.equal(isAttraction(page), false, page.title);
  const yes = [
    {
      title: 'Галата',
      terms: { description: ['исторический район Стамбула'] },
    },
    {
      title: 'Старый квартал (район города)',
      categories: [
        { title: 'Категория:Исторические районы Стамбула' },
        { title: 'Категория:Административные единицы' },
      ],
    },
    {
      title: 'Старый город',
      categories: [{ title: 'Категория:Исторические центры городов' }],
    },
    { title: 'Музей Московского метрополитена' },
    {
      title: 'Музей аэропорта',
      terms: { description: ['музей истории аэропорта'] },
    },
    { title: 'Памятник самолёту Ту-104 (Москва, Внуково)' },
    { title: 'Ворота Адриана' },
    { title: 'Археологический музей Стамбула' },
    { title: 'Тюнель', categories: [{ title: 'Категория:Фуникулёры Турции' }] },
    { title: 'Галатская башня' },
    {
      title: 'Айя-София',
      categories: [{ title: 'Категория:Объекты культурного наследия Турции' }],
    },
  ];
  for (const page of yes) assert.equal(isAttraction(page), true, page.title);
  assert.equal(isAttraction({ title: 'Неизвестная статья' }), false);
});
