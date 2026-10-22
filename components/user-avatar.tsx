'use client';
import { useState } from 'react';
export type ProfileUser = {
  id: string;
  name: string;
  username?: string;
  email?: string | null;
  linkedEmails?: string[];
  avatarVersion?: string | null;
  yandexAccountId?: string | null;
};
export default function UserAvatar({
  user,
  large = false,
}: {
  user: ProfileUser;
  large?: boolean;
}) {
  const key = (user.avatarVersion || '') + ':' + (user.yandexAccountId || '');
  return <AvatarImage key={key} user={user} large={large} />;
}
function AvatarImage({ user, large }: { user: ProfileUser; large: boolean }) {
  const [failed, setFailed] = useState(false);
  const version = user.avatarVersion || user.yandexAccountId || '';
  return (
    <span
      className={'avatar user-avatar' + (large ? ' profile-avatar' : '')}
      aria-hidden="true"
    >
      {user.name.slice(0, 1).toUpperCase()}
      {!failed && version && (
        <img
          src={'/api/me/avatar?v=' + encodeURIComponent(version)}
          alt=""
          width={large ? 88 : 36}
          height={large ? 88 : 36}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
