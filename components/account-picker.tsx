'use client';

import { useLocale } from './appearance';
import { useState } from 'react';
import { driveIconPaths } from '@/lib/drive-icon';

type Account = { id: string; label: string };

function AccountAvatar({ accountId }: { accountId: string }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>(
    'loading',
  );
  return (
    <span
      className="account-avatar"
      aria-hidden="true"
      data-loaded={status === 'loaded'}
    >
      <svg
        width="25"
        height="25"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {driveIconPaths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      {status !== 'failed' && (
        <img
          src={'/api/accounts/' + encodeURIComponent(accountId) + '/avatar'}
          alt=""
          width="42"
          height="42"
          decoding="async"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('failed')}
        />
      )}
    </span>
  );
}

export function ConnectedAccount({ account }: { account: Account }) {
  const { t } = useLocale();
  return (
    <div className="connected-account">
      <AccountAvatar key={account.id} accountId={account.id} />
      <div className="account-identity">
        <strong title={account.label}>{account.label}</strong>
        <span>{t('common.yandexDisk')}</span>
      </div>
      <span className="connection-state">
        <span aria-hidden="true">✓</span>
        {t('disk.connectedAccount')}
      </span>
    </div>
  );
}

export default function AccountPicker({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useLocale();
  if (accounts.length === 1) return <ConnectedAccount account={accounts[0]} />;
  return (
    <fieldset className="account-picker">
      <legend>{t('common.yandexAccount')}</legend>
      {accounts.map((account) => (
        <label
          key={account.id}
          className={
            'account-option' + (account.id === value ? ' is-selected' : '')
          }
        >
          <input
            type="radio"
            name="yandex-account"
            value={account.id}
            checked={value === account.id}
            onChange={() => onChange(account.id)}
          />
          <AccountAvatar key={account.id} accountId={account.id} />
          <span className="account-identity">
            <strong>{account.label}</strong>
            <span>{t('common.yandexDisk')}</span>
          </span>
          <span className="connection-state">
            <span aria-hidden="true">✓</span>
            {t('disk.connectedAccount')}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
