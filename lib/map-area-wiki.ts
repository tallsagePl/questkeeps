import {
  russianAreaTitle,
  russianAreaDescription,
  russianText,
} from './area-localization';
import { closestCity } from './city-lookup';
import { one, run } from './db';
import { fail } from './access';
import { osmRequest } from './place-geometry';
import { placeImage } from './places';
import {
  chooseWikiPage,
  readWikiPage,
  readWikiEntity,
  type ArticleLanguage,
} from './wiki-article';
import { MemoryCache } from './memory-cache';
export type AreaWiki = {
  title: string;
  url: string | null;
  image: string | null;
  description: string;
  localizationVersion?: number;
  language?: string;
};
const pending = new MemoryCache<string, Promise<AreaWiki>>();
const empty: AreaWiki = { title: '', url: null, image: null, description: '' };
type AreaContext = {
  title?: string;
  kind?: 'street' | 'district';
  country?: string;
  language?: ArticleLanguage;
};
export async function resolveAreaWiki(
  type: string,
  id: string,
  context: AreaContext = {},
): Promise<AreaWiki> {
  const preferred = context.language || 'ru';
  const data = await osmRequest(
    'https://www.openstreetmap.org/api/0.6/' + type + '/' + id + '.json',
  );
  const tags =
    data.elements?.find((e: any) => e.type === type && String(e.id) === id)
      ?.tags || {};
  let entity: any,
    language = '',
    sourceTitle = '';
  if (/^Q[1-9][0-9]*$/.test(tags.wikidata || ''))
    entity = await readWikiEntity(tags.wikidata);
  const linked = /^(ru|en|tr|de|fr|es|it|pt|nl|pl|uk|ja|zh|ar):(.+)$/.exec(
    tags.wikipedia || '',
  );
  const ruTitle =
    preferred === 'en'
      ? ''
      : entity?.sitelinks?.ruwiki?.title ||
        tags['wikipedia:ru'] ||
        (linked?.[1] === 'ru' ? linked[2] : '');
  if (ruTitle) {
    language = 'ru';
    sourceTitle = ruTitle;
  } else {
    const enTitle =
      tags['wikipedia:en'] || (linked?.[1] === 'en' ? linked[2] : '');
    if (enTitle) {
      language = 'en';
      sourceTitle = enTitle;
    }
    for (const lang of ['en', 'tr']) {
      if (sourceTitle) break;
      if (entity?.sitelinks?.[lang + 'wiki']?.title) {
        language = lang;
        sourceTitle = entity.sitelinks[lang + 'wiki'].title;
        break;
      }
    }
    if (!sourceTitle && linked) {
      language = linked[1];
      sourceTitle = linked[2];
    }
  }
  const kind = context.kind || (tags.highway ? 'street' : 'district');
  const displayTitle = () => {
    if (preferred === 'en') {
      const name =
        entity?.labels?.en?.value ||
        tags['name:en'] ||
        tags.name ||
        context.title ||
        '';
      return /[А-Яа-яЁё]/.test(name)
        ? 'Place'
        : name.replace(/\s+Mahallesi$/i, '');
    }
    const russianName = [tags['name:ru'], entity?.labels?.ru?.value].find(
      russianText,
    );
    return (
      russianName ||
      russianAreaTitle(
        context.title || tags.name || sourceTitle,
        context.country || (language === 'tr' ? 'TR' : ''),
      )
    );
  };
  const fallback = (): AreaWiki => {
    const title = displayTitle();
    return {
      ...empty,
      title,
      description:
        preferred === 'en'
          ? 'No English Wikipedia article is available.'
          : title
            ? russianAreaDescription(title, kind)
            : '',
      language: preferred,
      localizationVersion: 4,
    };
  };
  if (!sourceTitle) return fallback();
  let source = await readWikiPage(language, { title: sourceTitle });
  if (!source && language === 'ru') {
    const enTitle = entity?.sitelinks?.enwiki?.title || tags['wikipedia:en'];
    if (enTitle) {
      source = await readWikiPage('en', { title: enTitle });
      language = 'en';
    }
  }
  const chosen = await chooseWikiPage(source, language, preferred, entity);
  const page = chosen.page;
  language = chosen.language;
  entity = chosen.entity;
  if (!page) return fallback();
  const title =
    preferred === 'en'
      ? page.title
      : language === 'ru' && russianText(page.title)
        ? page.title
        : displayTitle();
  let image: string | null = null;
  try {
    image = await placeImage(page.pageid, language);
  } catch {
    /* Keep the verified article usable without its image. */
  }
  const ruDescription = entity?.descriptions?.ru?.value;
  return {
    title,
    url:
      'https://' +
      language +
      '.wikipedia.org/wiki/' +
      encodeURIComponent(page.title.replaceAll(' ', '_')),
    image,
    description:
      (language === 'ru' && russianText(page.extract)) ||
      (language === 'en' && page.extract)
        ? page.extract
        : preferred === 'en'
          ? entity?.descriptions?.en?.value || 'No description is available.'
          : russianText(ruDescription)
            ? ruDescription.charAt(0).toUpperCase() + ruDescription.slice(1)
            : russianAreaDescription(title, kind),
    localizationVersion: 4,
    language,
  };
}
export async function areaWiki(
  tripId: string,
  areaId: string,
  language: ArticleLanguage = 'ru',
) {
  if (
    !/^osm-(way|relation)-[1-9][0-9]*$/.test(areaId) ||
    !one(
      'SELECT 1 FROM trip_area_candidates WHERE trip_id=? AND area_id=?',
      tripId,
      areaId,
    )
  )
    fail(404, 'Место не найдено');
  const saved = one(
    'SELECT json,updated FROM map_area_wiki_i18n WHERE area_id=? AND language=?',
    areaId,
    language,
  );
  if (saved && Date.now() - saved.updated < 24 * 60 * 60 * 1000) {
    const value = JSON.parse(saved.json) as AreaWiki;
    if (value.localizationVersion === 4) return value;
  }
  const existing = pending.get(areaId + ':' + language);
  if (existing) return existing;
  const [, type, id] = /^osm-(way|relation)-([1-9][0-9]*)$/.exec(areaId)!;
  const area = one(
    'SELECT title,kind,lat,lon FROM map_areas WHERE id=?',
    areaId,
  )!;
  const task = resolveAreaWiki(type, id, {
    language,
    title: area.title,
    kind: area.kind,
    country: closestCity(area.lat, area.lon)?.country,
  })
    .then((value) => {
      run(
        'INSERT OR REPLACE INTO map_area_wiki_i18n VALUES (?,?,?,?)',
        areaId,
        language,
        JSON.stringify(value),
        Date.now(),
      );
      return value;
    })
    .finally(() => pending.delete(areaId + ':' + language));
  pending.set(areaId + ':' + language, task);
  return task;
}
