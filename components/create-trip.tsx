'use client';

import SmoothDetails, { Collapse } from './smooth-details';
import { routeLabel, type RouteCity } from '@/lib/route-label';
import { useLocale } from '@/components/appearance';
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
  const { t, m, language } = useLocale();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [picker, setPicker] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [folder, setFolder] = useState('disk:/');
  const [folders, setFolders] = useState<
    {
      name: string;
      path: string;
    }[]
  >([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [sourceError, setSourceError] = useState('');
  const [folderStatus, setFolderStatus] = useState('');
  const [autoDates, setAutoDates] = useState(false);
  const [autoDestination, setAutoDestination] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [destination, setDestination] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [dateHint, setDateHint] = useState('');
  const [destinationHint, setDestinationHint] = useState('');
  const [count, setCount] = useState<number | null>(null);
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
            ? 'common.noSubfoldersFoundYetYouCanKeep'
            : merged.length === 0
              ? 'common.noSubfoldersFoundYouCanSelectThe'
              : merged.length === folders.length
                ? 'common.noNewSubfoldersFound'
                : 'common.subfoldersFoundSelectOneFromTheList',
        );
      setNextOffset(result.nextOffset);
    } catch (e) {
      if (version === browseGeneration.current)
        setSourceError(
          e instanceof Error
            ? e.message
            : t('createTrip.couldNotOpenTheFolder'),
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
                ? t('createTrip.yearsInFiles') +
                  ' ' +
                  value.dateYears.join(', ') +
                  '. '
                : '') + m(value.warnings.dates)
            : '') ||
            (value.start ? t('createTrip.fromTheFirstToTheLastPhotoOr') : ''),
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
              ? t('createTrip.nearestTownsFromGpsPleaseCheckThe')
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
              : t('createTrip.couldNotReadThePhotos');
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
            t('createTrip.chooseAPhotoFolderForAutomaticDetection'),
          );
          return;
        }
        if (!destination.trim() || destination.length > 1000) {
          setDestinationHint(t('createTrip.chooseACountryCityOrAddA'));
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
      <p className="muted">
        {t('createTrip.bringYourPhotosTogetherIntoOneStory')}
      </p>

      <section className="creation-source" aria-labelledby={folderId}>
        <div className="creation-source-heading">
          <strong id={folderId}>{t('gallery.photos')}</strong>
          <span>
            {source ? t('createTrip.folderSelected') : t('createTrip.optional')}
          </span>
        </div>
        {source ? (
          <>
            <ConnectedAccount
              account={
                accounts.find((a) => a.id === source.accountId) || {
                  id: source.accountId,
                  label: t('common.yandexDisk'),
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
                  ? t('createTrip.myDrive')
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
                {t('createTrip.changeFolder')}
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
                {t('createTrip.removeFolder')}
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
              ? t('createTrip.checkingAccounts')
              : t('createTrip.chooseAYandexDiskFolder')}
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
                        aria-label={t('createTrip.parentFolder')}
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
                        <p className="folder-empty">
                          {t('createTrip.lookingForSubfolders')}
                        </p>
                      )}
                      {!browsing && !folders.length && !folderStatus && (
                        <p className="folder-empty">
                          {t(
                            nextOffset !== null
                              ? 'common.noSubfoldersOnThisPageKeepSearching'
                              : 'createTrip.noSubfoldersYouCanSelectTheCurrent',
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
                      {m(folderStatus)}
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
                      {t('common.selectThisFolder')}
                    </FeedbackButton>
                  </>
                )}
              </>
            ) : (
              <p className="fine">
                {t('createTrip.noYandexAccountsConnectedYet')}
              </p>
            )}
            {yandexEnabled && !accounts.length ? (
              <a
                className="text-button"
                href="/api/auth/yandex?intent=link&returnTo=%2F%3Fcreate%3D1"
              >
                {t('disk.connectAccountExternal')}
              </a>
            ) : (
              !accounts.length && (
                <p className="fine">
                  {t('common.yandexDiskIsNotConfiguredYetContact')}
                </p>
              )
            )}
          </div>
        </Collapse>

        {sourceError && (
          <p className="field-error" role="alert">
            {m(sourceError)}
          </p>
        )}
        {analyzing && (
          <p className="analysis-status" role="status">
            <span className="spinner" />
            {t('createTrip.readingPhotoDatesAndCoordinatesThisMay')}
          </p>
        )}
        {count !== null && !analyzing && (
          <p className="fine" role="status">
            {t('createTrip.filesChecked')}
            {count}
          </p>
        )}
      </section>
      <Field
        label={t('createTrip.tripName')}
        name="title"
        required
        maxLength={120}
        placeholder={t('createTrip.forExampleAutumnInGeorgia')}
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
              ? t('createTrip.chooseAPhotoFolderFirst')
              : m(destinationHint)
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
            <strong>{t('createTrip.detectDestinationFromPhotos')}</strong>
          </span>
        </label>
        {autoDestination && source && destination && (
          <p className="fine geodata-attribution">
            {t('createTrip.towns')}{' '}
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
            label={t('dates.start')}
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
            label={t('dates.end')}
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
            <strong>{t('createTrip.detectDatesFromPhotosAndVideos')}</strong>
          </span>
        </label>
        <p className="field-hint" role="status">
          {autoDates && !source
            ? t('createTrip.chooseAPhotoFolderFirst')
            : m(dateHint)}
        </p>
      </div>
      <SmoothDetails className="trip-description">
        <summary>{t('createTrip.addADescription')}</summary>
        <label className="field">
          <span>{t('createTrip.aFewWordsAboutTheTrip')}</span>
          <textarea
            name="description"
            rows={3}
            maxLength={3000}
            placeholder={t('createTrip.whatWouldYouLikeToRemember')}
          />
        </label>
      </SmoothDetails>
      <FeedbackButton className="primary" disabled={busy || analyzing}>
        {analyzing
          ? t('createTrip.detectingDetails')
          : busy
            ? t('createTrip.creatingYourTrip')
            : t('createTrip.createTrip')}
        <span aria-hidden="true">→</span>
      </FeedbackButton>
      <p className="creation-privacy">{t('disk.originalsStayHint')}</p>
    </FeedbackForm>
  );
}
