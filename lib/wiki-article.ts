import { wiki } from './places';
import { MemoryCache } from './memory-cache';
import { placeTextContent } from './place-text';
export type ArticleLanguage = 'ru' | 'en';
export type WikiArticle = {
  title: string;
  url: string | null;
  description: string;
  summary: string;
  language: ArticleLanguage;
  pageId: number | null;
  available: boolean;
};
const articles = new MemoryCache<string, Promise<WikiArticle>>();
export async function readWikiPage(
  language: string,
  identity: { pageId?: number; title?: string },
) {
  const data = await wiki(
    {
      ...(identity.pageId
        ? { pageids: String(identity.pageId) }
        : { titles: identity.title! }),
      redirects: '1',
      prop: 'extracts|pageterms|langlinks|pageprops',
      lllimit: '500',
      exintro: '1',
      explaintext: '1',
      wbptterms: 'description',
    },
    language,
  );
  return (Object.values(data.query?.pages || {}) as any[]).find(
    (p) =>
      p.pageid > 0 &&
      p.missing === undefined &&
      p.pageprops?.disambiguation === undefined,
  );
}
export async function readWikiEntity(id: string) {
  if (!/^Q[1-9][0-9]*$/.test(id)) return undefined;
  const response = await fetch(
    'https://www.wikidata.org/wiki/Special:EntityData/' + id + '.json',
    { signal: AbortSignal.timeout(12000) },
  );
  if (!response.ok) throw Error('Wikidata unavailable');
  return (await response.json()).entities?.[id];
}
export async function chooseWikiPage(
  source: any,
  sourceLanguage: string,
  preferred: ArticleLanguage,
  entity?: any,
) {
  let page = source,
    language = sourceLanguage;
  if (source && sourceLanguage === preferred)
    return { page: source, language: sourceLanguage, entity };
  if (
    !entity &&
    source?.pageprops?.wikibase_item &&
    !source?.langlinks?.some((l: any) => l.lang === preferred)
  ) {
    try {
      entity = await readWikiEntity(source.pageprops.wikibase_item);
    } catch {}
  }
  for (const target of preferred === 'en' ? ['en'] : ['ru', 'en']) {
    if (page && language === target) return { page, language, entity };
    const title =
      entity?.sitelinks?.[target + 'wiki']?.title ||
      source?.langlinks?.find((l: any) => l.lang === target)?.['*'];
    if (!title) continue;
    const candidate = await readWikiPage(target, { title });
    if (candidate) return { page: candidate, language: target, entity };
  }
  return { page: null, language: preferred, entity };
}
export function localizedWikiArticle(
  pageId: number,
  preferred: ArticleLanguage,
  sourceLanguage = 'ru',
): Promise<WikiArticle> {
  const key = sourceLanguage + ':' + pageId + ':' + preferred;
  const existing = articles.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const source = await readWikiPage(sourceLanguage, { pageId });
    const { page, language, entity } = await chooseWikiPage(
      source,
      sourceLanguage,
      preferred,
    );
    if (!page)
      return {
        title: entity?.labels?.[preferred]?.value || '',
        url: null,
        description:
          preferred === 'en'
            ? 'No English Wikipedia article is available.'
            : 'Русская и английская статьи не найдены.',
        summary: '',
        language: preferred,
        pageId: null,
        available: false,
      };
    const text = placeTextContent(
      String(page.extract || ''),
      page.terms?.description?.[0],
    );
    return {
      ...text,
      title: String(page.title),
      url: 'https://' + language + '.wikipedia.org/?curid=' + page.pageid,
      language: language as ArticleLanguage,
      pageId: Number(page.pageid),
      available: true,
    };
  })();
  articles.set(key, pending);
  void pending.catch(() => {
    if (articles.get(key) === pending) articles.delete(key);
  });
  return pending;
}
