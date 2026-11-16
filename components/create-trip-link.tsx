'use client';

import type { ReactNode } from 'react';
import { trackGoal } from '@/lib/analytics';
import { createTripEntry } from '@/lib/trip-entry';

const goals = {
  home: 'onboarding_create_from_home',
  about: 'onboarding_create_from_about',
  example: 'onboarding_create_from_example',
  guide: 'onboarding_create_from_guide',
  guest: 'onboarding_create_from_guest',
} as const;

export default function CreateTripLink({
  source,
  children,
  className,
}: {
  source: keyof typeof goals;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={createTripEntry}
      className={className}
      onClick={() => trackGoal(goals[source])}
    >
      {children}
    </a>
  );
}
