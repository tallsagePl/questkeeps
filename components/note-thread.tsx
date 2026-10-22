'use client';

import { useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocale } from './appearance';
import { api } from './api';
import { Collapse } from './smooth-details';

type Note = {
  id: string;
  user_id: string;
  author: string;
  text: string;
  day: string;
  deleted?: boolean | number;
};

export type NoteReply = {
  id: string;
  note_id: string;
  parent_id: string | null;
  user_id: string;
  author: string;
  text: string;
  created: number;
  deleted?: boolean | number;
};

export default function NoteThread({
  note,
  replies,
  tripId,
  userId,
  guest,
  onChange,
}: {
  note: Note;
  replies: NoteReply[];
  tripId: string;
  userId?: string;
  guest: boolean;
  onChange: () => Promise<void>;
}) {
  const { t, language } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState<{
    id: string | null;
    author: string;
  } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const threadId = useId();
  const inputId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const replyTrigger = useRef<HTMLButtonElement>(null);
  const branch = useMemo(() => {
    const children = new Map<string | null, NoteReply[]>();
    for (const reply of replies) {
      const siblings = children.get(reply.parent_id);
      if (siblings) siblings.push(reply);
      else children.set(reply.parent_id, [reply]);
    }
    const rows: { reply: NoteReply; depth: number; parent?: NoteReply }[] = [];
    const seen = new Set<string>();
    const byId = new Map(replies.map((reply) => [reply.id, reply]));
    const pending = [...(children.get(null) || [])]
      .reverse()
      .map((reply) => ({ reply, depth: 0 }));
    while (pending.length) {
      const item = pending.pop()!;
      if (seen.has(item.reply.id)) continue;
      seen.add(item.reply.id);
      rows.push({
        ...item,
        parent: item.reply.parent_id
          ? byId.get(item.reply.parent_id)
          : undefined,
      });
      for (const reply of [...(children.get(item.reply.id) || [])].reverse())
        pending.push({ reply, depth: item.depth + 1 });
    }
    return rows;
  }, [replies]);
  const startReply = (id: string | null, author: string) => {
    if (target?.id === id) {
      input.current?.focus();
      return;
    }
    setTarget({ id, author });
    setText('');
    setError('');
    if (id) setExpanded(true);
    requestAnimationFrame(() => {
      input.current?.focus({ preventScroll: true });
      input.current?.scrollIntoView({
        block: 'nearest',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
    });
  };
  const remove = async (replyId?: string) => {
    setBusy(true);
    setError('');
    try {
      await api(
        'trips/' +
          tripId +
          '/notes/' +
          note.id +
          (replyId ? '/replies/' + replyId : ''),
        'DELETE',
      );
      await onChange();
    } catch {
      setError('messages.couldNotDeleteTheMessageTryAgain');
    } finally {
      setBusy(false);
    }
  };
  const composer = (parentId: string | null) =>
    target?.id === parentId ? (
      <form
        className="note-reply-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!text.trim() || busy) return;
          setBusy(true);
          setError('');
          try {
            await api(
              'trips/' + tripId + '/notes/' + note.id + '/replies',
              'POST',
              { text: text.trim(), parentId },
            );
            await onChange();
            setTarget(null);
            requestAnimationFrame(() => replyTrigger.current?.focus());
            setText('');
            setExpanded(true);
          } catch {
            setError('messages.couldNotSendTheReplyTryAgain');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor={inputId}>
          {t('messages.replyTo')} {target.author}
        </label>
        <textarea
          id={inputId}
          ref={input}
          rows={3}
          maxLength={3000}
          required
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) {
              event.preventDefault();
              setTarget(null);
              requestAnimationFrame(() => replyTrigger.current?.focus());
            }
          }}
        />
        <div className="note-actions">
          <button
            type="submit"
            className="primary"
            disabled={busy || !text.trim()}
          >
            {t(busy ? 'messages.sending' : 'messages.sendReply')}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setTarget(null);
              requestAnimationFrame(() => replyTrigger.current?.focus());
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </form>
    ) : null;
  const actions = (item: Note | NoteReply, replyId?: string) =>
    !guest &&
    !item.deleted && (
      <div className="note-actions">
        {item.user_id === userId ? (
          <button
            type="button"
            className="text-button danger"
            disabled={busy}
            onClick={() => void remove(replyId)}
          >
            {t(replyId ? 'messages.deleteReply' : 'messages.deleteEntry')}
          </button>
        ) : (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={(event) => {
              replyTrigger.current = event.currentTarget;
              startReply(replyId || null, item.author);
            }}
          >
            {t('messages.reply')}
          </button>
        )}
      </div>
    );
  return (
    <article className="note-entry note-thread" data-note-id={note.id}>
      <span className="eyebrow">
        {new Date(note.day + 'T12:00:00').toLocaleDateString(
          language === 'en' ? 'en-GB' : 'ru-RU',
          { day: 'numeric', month: 'short' },
        )}{' '}
        · {note.author}
      </span>
      <p className={note.deleted ? 'note-deleted' : ''}>
        {note.deleted ? t('messages.entryDeletedByItsAuthor') : note.text}
      </p>
      {actions(note)}
      {composer(null)}
      {!!branch.length && (
        <>
          <button
            type="button"
            className="text-button note-thread-toggle"
            aria-expanded={expanded}
            aria-controls={threadId}
            onClick={() => {
              setExpanded(!expanded);
              if (expanded && target?.id) setTarget(null);
            }}
          >
            {t(expanded ? 'messages.hideReplies' : 'messages.showReplies')} (
            {branch.length})
          </button>
          <Collapse id={threadId} open={expanded}>
            <ol
              className="note-replies"
              aria-label={t('messages.repliesToThisEntry')}
            >
              {branch.map(({ reply, depth, parent }) => (
                <li
                  key={reply.id}
                  className="note-reply"
                  data-reply-id={reply.id}
                  style={
                    { '--reply-depth': Math.min(depth, 3) } as CSSProperties
                  }
                >
                  <div className="note-reply-meta">
                    <strong>{reply.author}</strong>
                    <time dateTime={new Date(reply.created).toISOString()}>
                      {new Date(reply.created).toLocaleString(
                        language === 'en' ? 'en-GB' : 'ru-RU',
                        {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        },
                      )}
                    </time>
                  </div>
                  {parent && (
                    <span className="fine note-reply-recipient">
                      {t('messages.replyTo')} {parent.author}
                    </span>
                  )}
                  <p className={reply.deleted ? 'note-deleted' : ''}>
                    {reply.deleted
                      ? t('messages.replyDeletedByItsAuthor')
                      : reply.text}
                  </p>
                  {actions(reply, reply.id)}
                  {composer(reply.id)}
                </li>
              ))}
            </ol>
          </Collapse>
        </>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
