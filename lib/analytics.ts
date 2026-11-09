const goals = [
  'trip_gallery_ready',
  'trip_day_selected',
  'trip_map_opened',
  'trip_places_opened',
  'trip_place_selected',
  'trip_journal_opened',
  'trip_settings_opened',
  'trip_review_opened',
  'trip_photo_opened',
  'trip_video_opened',
  'trip_guest_link_copied',
  'trip_selection_exported',
  'trip_selection_prepared',
  'trip_photo_review_clicked',
  'trip_video_review_clicked',
] as const;

export type AnalyticsGoal = (typeof goals)[number];

export const analyticsGoals: ReadonlySet<string> = new Set(goals);

export const analyticsEvent = 'questkeeps:analytics-goal';

export function trackGoal(goal: AnalyticsGoal) {
  if (
    typeof window !== 'undefined' &&
    location.origin === 'https://questkeeps.ru'
  )
    window.dispatchEvent(new CustomEvent(analyticsEvent, { detail: goal }));
}
