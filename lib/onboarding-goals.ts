import { db, one, run } from './db';

export function claimOnboardingGoals(userId: string) {
  return db
    .transaction(() => {
      const goals: ('onboarding_first_trip' | 'onboarding_first_import')[] = [];
      const eligible = one(
        'SELECT 1 FROM users u JOIN schema_migrations s ON s.name=? WHERE u.id=? AND u.created>=s.applied',
        'onboarding-goals',
        userId,
      );
      if (!eligible) return goals;
      const created = run(
        'INSERT OR IGNORE INTO onboarding_goals SELECT ?,? WHERE EXISTS(SELECT 1 FROM trips WHERE owner_id=?)',
        userId,
        'onboarding_first_trip',
        userId,
      );
      if (created.changes) goals.push('onboarding_first_trip');
      const imported = run(
        'INSERT OR IGNORE INTO onboarding_goals SELECT ?,? WHERE EXISTS(SELECT 1 FROM trips t JOIN sources s ON s.trip_id=t.id JOIN media m ON m.source_id=s.id WHERE t.owner_id=? AND s.user_id=t.owner_id AND s.approved=1 AND m.hidden=0 AND m.missing=0 AND substr(m.taken,1,10) BETWEEN t.start AND t.end)',
        userId,
        'onboarding_first_import',
        userId,
      );
      if (imported.changes) goals.push('onboarding_first_import');
      return goals;
    })
    .immediate();
}
