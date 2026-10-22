import { db } from '../lib/db';

console.log(
  'Database migrations applied; schema version ' +
    db.pragma('user_version', { simple: true }),
);

db.close();
