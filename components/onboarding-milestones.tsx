'use client';

import { useEffect } from 'react';
import { analyticsEnabled, trackGoal } from '@/lib/analytics';
import { api } from './api';

export default function OnboardingMilestones({
  userId,
  hasTrips,
  hasMedia,
}: {
  userId?: string;
  hasTrips: boolean;
  hasMedia: boolean;
}) {
  useEffect(() => {
    if (!analyticsEnabled() || !userId || (!hasTrips && !hasMedia)) return;
    void api<{
      goals: ('onboarding_first_trip' | 'onboarding_first_import')[];
    }>('onboarding-goals', 'POST', {})
      .then(({ goals }) => goals.forEach(trackGoal))
      .catch(() => {});
  }, [userId, hasTrips, hasMedia]);
  return null;
}
