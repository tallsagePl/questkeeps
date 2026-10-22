'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useLocale } from './appearance';
import { moveMentions, type Mention, type MentionUser } from '../lib/mentions';

type Pick = { start: number; end: number; typed?: boolean };

export default function TripDescription({
  tripId,
  value,
  editable,
  onSave,
  mentions = [],
  user,
}: {
  tripId: string;
  value: string;
  editable: boolean;
  mentions?: Mention[];
  user?: MentionUser | null;
  onSave: (value: string, mentions: Mention[]) => void;
}) {
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [links, setLinks] = useState(mentions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<Pick | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MentionUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const pencil = useRef<HTMLButtonElement>(null);
  const paragraph = useRef<HTMLParagraphElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setResults([]);
    setSearchError('');
    if (!selection || !query.trim()) {
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void fetch(
        '/api/profiles?q=' + encodeURIComponent(query.replace(/^@/, '')),
        { signal: controller.signal, cache: 'no-store' },
      )
        .then(async (response) => {
          if (!response.ok) throw Error();
          const result = await response.json();
          if (!controller.signal.aborted) setResults(result.users);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setSearchError(t('tripDescription.couldNotFindThePerson'));
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selection, t]);
  const close = () => {
    setEditing(false);
    setSelection(null);
    setQuery('');
    requestAnimationFrame(() => pencil.current?.focus());
  };
  async function save(description: string, updated: Mention[]) {
    setBusy(true);
    setError('');
    try {
      const result = await api('trips/' + tripId, 'PATCH', {
        description,
        mentions: updated.map(({ start, end, userId }) => ({
          start,
          end,
          userId,
        })),
      });
      onSave(result.description, result.descriptionMentions || []);
      setLinks(result.descriptionMentions || []);
      close();
    } catch {
      setError('tripDescription.couldNotSaveTheDescription');
    } finally {
      setBusy(false);
    }
  }
  function choose(person: MentionUser) {
    if (!selection) return;
    const source = editing ? text : value;
    const current = editing ? links : mentions;
    let next = source;
    let end = selection.end;
    if (selection.typed) {
      const replacement = '@' + person.username;
      next =
        source.slice(0, selection.start) +
        replacement +
        source.slice(selection.end);
      end = selection.start + replacement.length;
    }
    const rest = (
      next === source ? current : moveMentions(source, next, current)
    ).filter((m) => m.end <= selection.start || m.start >= end);
    const updated = [
      ...rest,
      {
        start: selection.start,
        end,
        userId: person.id,
        username: person.username,
        name: person.name,
      },
    ].sort((a, b) => a.start - b.start);
    if (editing) {
      setText(next);
      setLinks(updated);
      setSelection(null);
      setQuery('');
      requestAnimationFrame(() => {
        textarea.current?.focus();
        textarea.current?.setSelectionRange(end, end);
      });
    } else void save(next, updated);
  }
  function selectText() {
    if (!editable || busy) return;
    const selected = window.getSelection();
    const p = paragraph.current;
    if (
      !selected ||
      !p ||
      !selected.rangeCount ||
      selected.isCollapsed ||
      !p.contains(selected.anchorNode) ||
      !p.contains(selected.focusNode)
    ) {
      setSelection(null);
      return;
    }
    const range = selected.getRangeAt(0);
    const before = range.cloneRange();
    before.selectNodeContents(p);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    const end = start + range.toString().length;
    if (
      end > value.length ||
      !value.slice(start, end).trim() ||
      /[\r\n]/.test(value.slice(start, end))
    ) {
      setSelection(null);
      return;
    }
    setSelection({ start, end });
    setQuery('');
  }
  function renderLine(line: string, offset: number) {
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const m of mentions.filter(
      (m) => m.username && m.start >= offset && m.end <= offset + line.length,
    )) {
      parts.push(line.slice(cursor, m.start - offset));
      parts.push(
        <a
          className="person-mention"
          key={m.start}
          href={'/@' + m.username}
          title={m.name + ' · @' + m.username}
        >
          {line.slice(m.start - offset, m.end - offset)}
        </a>,
      );
      cursor = m.end - offset;
    }
    parts.push(line.slice(cursor));
    return parts;
  }
  const picker = selection && (
    <div
      className="description-person-picker"
      role="group"
      aria-label={t('tripDescription.mentionAPerson')}
    >
      <span className="fine">
        {t('tripDescription.mentionInText')} «
        {(editing ? text : value).slice(selection.start, selection.end)}»
      </span>
      <div className="description-person-controls">
        {user && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => choose(user)}
          >
            {t('tripDescription.thatSMe')}
          </button>
        )}
        <label>
          <span className="description-person-label">
            {t('tripDescription.findAPerson')}
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('common.nameOrUsername')}
            maxLength={80}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className="text-button"
          onClick={() => setSelection(null)}
        >
          {t('common.cancel')}
        </button>
      </div>
      <div className="description-person-results" aria-live="polite">
        {searching && (
          <span className="fine">{t('tripDescription.searching')}</span>
        )}
        {searchError && <span role="alert">{searchError}</span>}
        {!searching && query.trim() && !searchError && !results.length && (
          <span className="fine">{t('tripDescription.userNotFound')}</span>
        )}
        {results.map((person) => (
          <button
            type="button"
            className="description-person-result"
            disabled={busy}
            key={person.id}
            onClick={() => choose(person)}
          >
            <strong>{person.name}</strong>
            <span>@{person.username}</span>
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="trip-description">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(text, links);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (!busy) close();
            }
          }}
        >
          <label>
            {t('tripDescription.tripDescription')}
            <textarea
              ref={textarea}
              aria-label={t('tripDescription.tripDescription')}
              autoFocus
              maxLength={3000}
              rows={4}
              value={text}
              disabled={busy}
              onSelect={(e) => {
                const el = e.currentTarget;
                if (el.selectionEnd > el.selectionStart) {
                  setSelection({
                    start: el.selectionStart,
                    end: el.selectionEnd,
                  });
                  setQuery('');
                }
              }}
              onChange={(e) => {
                const next = e.target.value;
                const caret = e.target.selectionStart;
                setLinks(moveMentions(text, next, links));
                setText(next);
                const token = /(?:^|[\s(])@([a-zA-Z0-9_]*)$/.exec(
                  next.slice(0, caret),
                );
                if (token) {
                  setSelection({
                    start: caret - token[1].length - 1,
                    end: caret,
                    typed: true,
                  });
                  setQuery(token[1]);
                } else {
                  setSelection(null);
                  setQuery('');
                }
              }}
            />
          </label>
          <p className="field-hint">
            {t('tripDescription.selectANameToLinkYourselfOr')}
          </p>
          {picker}
          {links.length > 0 && (
            <div className="description-existing-mentions">
              {links
                .filter((m) => !text.slice(m.start, m.end).startsWith('@'))
                .map((m) => (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    key={m.start}
                    onClick={() => setLinks(links.filter((link) => link !== m))}
                  >
                    {t('tripDescription.removeMention')}{' '}
                    {text.slice(m.start, m.end)}
                  </button>
                ))}
            </div>
          )}
          <span className="fine">{text.length} / 3000</span>
          <div className="place-confirm-actions">
            <button className="primary" disabled={busy}>
              {t('common.save')}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={close}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p
            ref={paragraph}
            onMouseUp={selectText}
            onKeyUp={selectText}
            onTouchEnd={selectText}
          >
            {(value || t('tripDescription.addADescriptionOfYourTrip'))
              .split('\n')
              .map((line, index, lines) => {
                const offset = lines
                  .slice(0, index)
                  .reduce((sum, line) => sum + line.length + 1, 0);
                return (
                  <Fragment key={index}>
                    <span
                      className="trip-description-paragraph"
                      data-long={line.length > 200 || undefined}
                    >
                      {renderLine(line, offset)}
                      {editable && index === lines.length - 1 && (
                        <button
                          ref={pencil}
                          type="button"
                          className="icon-button trip-description-pencil"
                          aria-label={t('tripDescription.editTripDescription')}
                          onClick={() => {
                            setText(value);
                            setLinks(mentions);
                            setError('');
                            setSelection(null);
                            setEditing(true);
                          }}
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            aria-hidden="true"
                          >
                            <path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z" />
                          </svg>
                        </button>
                      )}
                    </span>
                    {index < lines.length - 1 ? '\n' : null}
                  </Fragment>
                );
              })}
          </p>
          {picker}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
