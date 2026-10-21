'use client';
import SmoothDetails, { Collapse } from './smooth-details';

import { routeLabel, type RouteCity } from '@/lib/route-label';
import { useLocale } from '@/components/appearance';
import { translateCurrent } from '@/lib/i18n/translate';
const t = translateCurrent;
import { useState, useEffect, useRef, useId } from 'react';
import { api } from './api';
import DestinationPicker from './destination-picker';
import {
  readFolderPages,
  mergeFolders,
  FolderSearchButton,
} from './folder-search';
import AccountPicker, { ConnectedAccount } from './account-picker';
import { FeedbackForm, FeedbackButton, Field } from './feedback';
type Account = {
  id: string;
  label: string;
};
type Source = {
  accountId: string;
  path: string;
};
type Inference = {
  photoCount: number;
  videoCount?: number;
  dateYears?: string[];
  route?: RouteCity[];
  datedCount: number;
  gpsCount: number;
  start: string | null;
  end: string | null;
  destination: string | null;
  warnings: Record<string, string>;
};
export default function CreateTrip({
  busy,
  yandexEnabled,
  onCreate,
}: {
  busy: boolean;
  yandexEnabled: boolean;
  onCreate: (input: Record<string, unknown>) => Promise<void>;
}) {
  const { t, language } = useLocale();
  const [accounts, setAccounts] = useState<Account[]>([]),
    [loadingAccounts, setLoadingAccounts] = useState(true),
    [picker, setPicker] = useState(false),
    [accountId, setAccountId] = useState(''),
    [folder, setFolder] = useState('disk:/'),
    [folders, setFolders] = useState<
      {
        name: string;
        path: string;
      }[]
    >([]),
    [nextOffset, setNextOffset] = useState<number | null>(null),
    [browsing, setBrowsing] = useState(false),
    [source, setSource] = useState<Source | null>(null),
    [sourceError, setSourceError] = useState(''),
    [folderStatus, setFolderStatus] = useState(''),
    [autoDates, setAutoDates] = useState(false),
    [autoDestination, setAutoDestination] = useState(false),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [destination, setDestination] = useState(''),
    [analyzing, setAnalyzing] = useState(false),
    [dateHint, setDateHint] = useState(''),
    [destinationHint, setDestinationHint] = useState(''),
    [count, setCount] = useState<number | null>(null);
  const cache = useRef<{
    key: string;
    dates: boolean;
    destination: boolean;
    value: Inference;
  } | null>(null);
  const [inferredRoute, setInferredRoute] = useState<RouteCity[]>([]);
  const browseGeneration = useRef(0);
  const folderId = useId();
  useEffect(() => {
    const controller = new AbortController();
    void api('accounts', 'GET', undefined, controller.signal)
      .then((r) => setAccounts(r.accounts))
      .catch((e) => {
        if (!controller.signal.aborted) setSourceError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingAccounts(false);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (picker && accounts.length === 1 && !accountId)
      void browse(accounts[0].id, 'disk:/');
  }, [picker, accounts, accountId]);
  async function browse(
    account: string,
    path: string,
    offset = 0,
    search = false,
  ) {
    const version = ++browseGeneration.current;
    setBrowsing(true);
    setSourceError('');
    setFolderStatus('');
    setAccountId(account);
    if (!search) {
      setFolders([]);
      setNextOffset(null);
    }
    setFolder(path);
    try {
      const result = await readFolderPages(
        account,
        path,
        offset,
        search,
        () => version === browseGeneration.current,
      );
      if (version !== browseGeneration.current) return;
      const merged = search
        ? mergeFolders(folders, result.folders)
        : result.folders;
      setFolders(merged);
      if (search)
        setFolderStatus(
          result.nextOffset !== null && !result.folders.length
            ? 'Пока подпапок не найдено. Можно продолжить поиск.'
            : merged.length === 0
              ? 'Подпапок не найдено. Можно выбрать текущую папку.'
              : merged.length === folders.length
                ? 'Новых подпапок не найдено.'
                : 'Подпапки найдены. Выберите нужную из списка.',
        );
      setNextOffset(result.nextOffset);
    } catch (e) {
      if (version === browseGeneration.current)
        setSourceError(
          e instanceof Error ? e.message : t('Не удалось открыть папку'),
        );
    } finally {
      if (version === browseGeneration.current) setBrowsing(false);
    }
  }
  useEffect(() => {
    if (!source || (!autoDates && !autoDestination)) {
      setAnalyzing(false);
      return;
    }
    const controller = new AbortController();
    const key = source.accountId + ':' + source.path;
    function apply(value: Inference) {
      if (controller.signal.aborted) return;
      setCount(value.photoCount + (value.videoCount || 0));
      if (autoDates) {
        setStart(value.start || '');
        setEnd(value.end || '');
        setDateHint(
          (value.warnings.dates
            ? (value.dateYears && value.dateYears.length > 1
                ? t('Годы в файлах:') + ' ' + value.dateYears.join(', ') + '. '
                : '') + t(value.warnings.dates)
            : '') ||
            (value.start
              ? t('От первого до последнего фото или видео по дате съёмки')
              : ''),
        );
      }
      if (autoDestination) {
        setInferredRoute(value.route || []);
        const localized = value.route?.length
          ? routeLabel(value.route, language)
          : value.destination;
        if (localized) setDestination(localized);
        setDestinationHint(
          value.warnings.destination ||
            (value.destination
              ? t('Ближайшие города по GPS — проверьте направление')
              : ''),
        );
      }
    }
    if (
      cache.current?.key === key &&
      (!autoDates || cache.current.dates) &&
      (!autoDestination || cache.current.destination)
    ) {
      apply(cache.current.value);
      setAnalyzing(false);
      return () => controller.abort();
    }
    setAnalyzing(true);
    setSourceError('');
    const timer = setTimeout(() => {
      void api(
        'trips/infer',
        'POST',
        {
          ...source,
          dates: autoDates,
          destination: autoDestination,
          language,
        },
        controller.signal,
      )
        .then((value) => {
          if (controller.signal.aborted) return;
          cache.current = {
            key,
            dates: autoDates,
            destination: autoDestination,
            value,
          };
          apply(value);
        })
        .catch((e) => {
          if (controller.signal.aborted) return;
          const message =
            e instanceof Error
              ? e.message
              : t('Не удалось прочитать фотографии');
          if (autoDates) setDateHint(message);
          if (autoDestination) setDestinationHint(message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setAnalyzing(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [source, autoDates, autoDestination, language]);
  return (
    <FeedbackForm
      className="stack create-trip-form"
      onSubmit={(event) => {
        event.preventDefault();
        if ((autoDates || autoDestination) && !source) {
          setPicker(true);
          setSourceError(
            t('Выберите папку с фотографиями для автоопределения'),
          );
          return;
        }
        if (!destination.trim() || destination.length > 1000) {
          setDestinationHint(
            t(
              'Выбери страну, город или добавь маршрут. Максимум 1000 символов.',
            ),
          );
          return;
        }
        const form = new FormData(event.currentTarget);
        void onCreate({
          title: form.get('title'),
          destination,
          start,
          end,
          description: form.get('description'),
          ...(source
            ? {
                source,
              }
            : {}),
        });
      }}
    >
      <p className="muted">{t('Соберём фотографии в одну историю.')}</p>

      <section className="creation-source" aria-labelledby={folderId}>
        <div className="creation-source-heading">
          <strong id={folderId}>{t('Фотографии')}</strong>
          <span>{source ? t('Папка выбрана') : t('необязательно')}</span>
        </div>
        {source ? (
          <>
            <ConnectedAccount
              account={
                accounts.find((a) => a.id === source.accountId) || {
                  id: source.accountId,
                  label: t('Яндекс Диск'),
                }
              }
            />
            <div className="selected-folder">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
              </svg>
              <strong>
                {source.path === 'disk:/'
                  ? t('Мой Диск')
                  : source.path.replace('disk:/', '')}
              </strong>
              <span aria-hidden="true">✓</span>
            </div>
            <div className="creation-source-actions">
              <FeedbackButton
                type="button"
                className="text-button"
                onClick={() => {
                  setPicker(!picker);
                  if (!picker) void browse(source.accountId, source.path);
                }}
              >
                {t('Изменить папку')}
              </FeedbackButton>
              <FeedbackButton
                type="button"
                className="text-button"
                onClick={() => {
                  setSource(null);
                  setPicker(false);
                  setAutoDates(false);
                  setAutoDestination(false);
                  setDateHint('');
                  setDestinationHint('');
                  setCount(null);
                }}
              >
                {t('Убрать папку')}
              </FeedbackButton>
            </div>
          </>
        ) : (
          <FeedbackButton
            type="button"
            className="secondary"
            disabled={loadingAccounts}
            onClick={() => setPicker(!picker)}
          >
            {loadingAccounts
              ? t('Проверяем аккаунты…')
              : t('Выбрать папку Яндекс Диска')}
          </FeedbackButton>
        )}
        <Collapse open={picker}>
          <div className="creation-picker stack">
            {accounts.length ? (
              <>
                <AccountPicker
                  accounts={accounts}
                  value={accountId}
                  onChange={(id) => void browse(id, 'disk:/')}
                />
                {accountId && (
                  <>
                    <div className="folder-path">
                      <FeedbackButton
                        type="button"
                        className="text-button"
                        aria-label={t('На папку выше')}
                        disabled={browsing || folder === 'disk:/'}
                        onClick={() => {
                          const last = folder.lastIndexOf('/');
                          void browse(
                            accountId,
                            last <= 5 ? 'disk:/' : folder.slice(0, last),
                          );
                        }}
                      >
                        ↑
                      </FeedbackButton>
                      <code>{folder}</code>
                    </div>
                    <div className="folder-list" aria-busy={browsing}>
                      {folders.map((f) => (
                        <FeedbackButton
                          type="button"
                          key={f.path}
                          className="folder"
                          disabled={browsing}
                          onClick={() => void browse(accountId, f.path)}
                        >
                          {f.name}
                          <span aria-hidden="true">→</span>
                        </FeedbackButton>
                      ))}
                      {browsing && !folders.length && (
                        <p className="folder-empty">{t('Ищем подпапки…')}</p>
                      )}
                      {!browsing && !folders.length && !folderStatus && (
                        <p className="folder-empty">
                          {t(
                            nextOffset !== null
                              ? 'На этой странице подпапок нет. Продолжите поиск.'
                              : 'Вложенных папок нет. Можно выбрать текущую папку.',
                          )}
                        </p>
                      )}
                      <FolderSearchButton
                        busy={browsing}
                        onClick={() =>
                          void browse(accountId, folder, nextOffset ?? 0, true)
                        }
                      />
                    </div>
                    <div
                      className="folder-feedback"
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {t(folderStatus)}
                    </div>
                    <FeedbackButton
                      type="button"
                      className="secondary"
                      disabled={browsing || folder === 'disk:/'}
                      onClick={() => {
                        if (autoDates) {
                          setStart('');
                          setEnd('');
                        }
                        if (autoDestination) setDestination('');
                        setSource({
                          accountId,
                          path: folder,
                        });
                        setPicker(false);
                        setSourceError('');
                        setDateHint('');
                        setDestinationHint('');
                        setCount(null);
                      }}
                    >
                      {t('Выбрать эту папку')}
                    </FeedbackButton>
                  </>
                )}
              </>
            ) : (
              <p className="fine">
                {t('Пока нет подключённых аккаунтов Яндекса.')}
              </p>
            )}
            {yandexEnabled && !accounts.length ? (
              <a
                className="text-button"
                href="/api/auth/yandex?intent=link&returnTo=%2F%3Fcreate%3D1"
              >
                {t('Подключить аккаунт Яндекса ↗')}
              </a>
            ) : (
              !accounts.length && (
                <p className="fine">
                  {t(
                    'Подключение Яндекс Диска ещё не настроено. Обратитесь к владельцу приложения; пока поездку можно создать вручную.',
                  )}
                </p>
              )
            )}
          </div>
        </Collapse>

        {sourceError && (
          <p className="field-error" role="alert">
            {t(sourceError)}
          </p>
        )}
        {analyzing && (
          <p className="analysis-status" role="status">
            <span className="spinner" />
            {t(
              'Читаем даты и координаты фотографий… Это может занять несколько минут.',
            )}
          </p>
        )}
        {count !== null && !analyzing && (
          <p className="fine" role="status">
            {t('Проверено файлов:')}
            {count}
          </p>
        )}
      </section>
      <Field
        label={t('Название поездки')}
        name="title"
        required
        maxLength={120}
        placeholder={t('Например, осень в Грузии')}
      />
      <div className="auto-field-group">
        <DestinationPicker
          onChange={setDestination}
          inferredRoute={autoDestination ? inferredRoute : []}
          onManualChange={() => {
            setAutoDestination(false);
            setDestinationHint('');
          }}
          disabled={busy}
          hint={
            autoDestination && !source
              ? t('Сначала выберите папку с фотографиями')
              : destinationHint
          }
        />
        <label className="auto-toggle">
          <input
            type="checkbox"
            checked={autoDestination}
            onChange={(event) => {
              setAutoDestination(event.target.checked);
              setDestinationHint('');
              if (event.target.checked && !source) setPicker(true);
            }}
          />
          <span>
            <strong>{t('Определить место по фото')}</strong>
          </span>
        </label>
        {autoDestination && source && destination && (
          <p className="fine geodata-attribution">
            {t('Города:')}{' '}
            <a
              href="https://www.geonames.org/"
              target="_blank"
              rel="noreferrer"
            >
              GeoNames
            </a>{' '}
            /{' '}
            <a
              href="https://github.com/lutangar/cities.json"
              target="_blank"
              rel="noreferrer"
            >
              cities.json
            </a>{' '}
            · CC BY 4.0
          </p>
        )}
      </div>
      <div className="auto-field-group">
        <div className="form-row">
          <Field
            label={t('Начало')}
            name="start"
            type="date"
            required
            value={start}
            onChange={(event) => {
              setStart(event.target.value);
              setAutoDates(false);
              setDateHint('');
            }}
          />
          <Field
            label={t('Окончание')}
            name="end"
            type="date"
            required
            value={end}
            onChange={(event) => {
              setEnd(event.target.value);
              setAutoDates(false);
              setDateHint('');
            }}
          />
        </div>
        <label className="auto-toggle">
          <input
            type="checkbox"
            checked={autoDates}
            onChange={(event) => {
              setAutoDates(event.target.checked);
              setDateHint('');
              if (event.target.checked && !source) setPicker(true);
            }}
          />
          <span>
            <strong>{t('Определить даты по фото и видео')}</strong>
          </span>
        </label>
        <p className="field-hint" role="status">
          {autoDates && !source
            ? t('Сначала выберите папку с фотографиями')
            : t(dateHint)}
        </p>
      </div>
      <SmoothDetails className="trip-description">
        <summary>{t('Добавить описание')}</summary>
        <label className="field">
          <span>{t('Пара слов о поездке')}</span>
          <textarea
            name="description"
            rows={3}
            maxLength={3000}
            placeholder={t('Что хочется запомнить?')}
          />
        </label>
      </SmoothDetails>
      <FeedbackButton className="primary" disabled={busy || analyzing}>
        {analyzing
          ? t('Определяем данные…')
          : busy
            ? t('Создаём путешествие…')
            : t('Создать путешествие')}
        <span aria-hidden="true">→</span>
      </FeedbackButton>
      <p className="creation-privacy">
        {t('Оригиналы останутся на вашем Диске.')}
      </p>
    </FeedbackForm>
  );
}
