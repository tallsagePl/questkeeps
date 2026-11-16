import type Database from 'better-sqlite3';

export function onboardingGoals(db: Database.Database) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS onboarding_goals (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, goal TEXT NOT NULL CHECK(goal IN ('onboarding_first_trip','onboarding_first_import')), PRIMARY KEY(user_id,goal))",
  );
}
