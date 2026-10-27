'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from './appearance';

export default function CopyLinkButton({
  value,
  autoCopy = false,
}: {
  value: string;
  autoCopy?: boolean;
}) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef('');
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setFailed(false);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setFailed(true);
    }
  }, [value]);
  useEffect(() => {
    if (autoCopy && value && attempt.current !== value) {
      attempt.current = value;
      void copy();
    }
  }, [value, autoCopy, copy]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <>
      <button
        type="button"
        className="primary copy-link-feedback"
        data-copied={copied}
        onClick={() => void copy()}
        aria-live="polite"
      >
        {t(copied ? 'common.linkCopied' : 'common.copyLink')}
      </button>
      {failed && (
        <p className="fine" role="status">
          {t('trip.selectAndCopyTheLinkFromThe')}
        </p>
      )}
    </>
  );
}
