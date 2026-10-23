'use client';

import type { ReactNode } from 'react';
import { SocialShell, useViewer } from './social-shell';

export default function PrivacyShell({ children }: { children: ReactNode }) {
  const viewer = useViewer();
  return <SocialShell user={viewer.user}>{children}</SocialShell>;
}
