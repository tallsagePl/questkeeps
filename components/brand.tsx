'use client';
import BackButton from './back-button';

export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={'qk-mark ' + className}
      width="52"
      height="32"
      viewBox="30 12 528 324"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fillRule="evenodd"
        d="M166 32C89 32 42 86 42 168C42 250 89 304 166 304C243 304 290 250 290 168C290 86 243 32 166 32ZM166 77C214 77 242 110 242 168C242 226 214 259 166 259C118 259 90 226 90 168C90 110 118 77 166 77Z"
      />
      <path d="M144 156L210 166L194 182L312 300L288 324L170 206L154 222Z" />
      <path d="M332 40H379V151L477 53L461 37L541 23L527 103L511 87L420 178L547 310H483L379 201V310H332Z" />
    </svg>
  );
}
export default function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <a
      href="/"
      onClick={(event) => {
        if (window.location.pathname === '/' && !window.location.search)
          event.preventDefault();
      }}
      className={'brand qk-brand' + (footer ? ' qk-brand-footer' : '')}
      aria-label="QuestKeeps"
    >
      <LogoMark />
      <span className="qk-wordmark">QuestKeeps</span>
    </a>
  );
}

export function HeaderBrand({ back = true }: { back?: boolean }) {
  return (
    <div className="header-brand">
      {back && <BackButton />}
      <Brand />
    </div>
  );
}
