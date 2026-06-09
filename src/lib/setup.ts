import db from '@/utils/db';

export function hasAdminUser() {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM users')
    .get() as { count: number };

  return row.count > 0;
}

export function assertSetupAvailable() {
  return !hasAdminUser();
}
