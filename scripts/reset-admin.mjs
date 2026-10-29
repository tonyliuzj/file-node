// Resets the admin password from the command line, for when you are locked out.
//
//   node scripts/reset-admin.mjs [--username NAME]
//   FILE_NODE_NEW_PASSWORD='...' node scripts/reset-admin.mjs
//
// Docker:  docker compose exec -u node file-node node scripts/reset-admin.mjs
// Run it as the user that owns the data directory (the `node` user in Docker), not as root.
//
// Every signed-in session ends, because sessions are tied to the password that was current when
// they were issued.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;

function resolveDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return path.resolve(process.cwd(), 'data', 'data.db');
  if (databaseUrl.startsWith('file:')) return new URL(databaseUrl).pathname;
  return path.resolve(process.cwd(), databaseUrl);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

// Piped input (`printf 'pw\npw\n' | node scripts/reset-admin.mjs`) is read once and handed out
// line by line; a readline interface per prompt would swallow the lines meant for the next one.
let pipedLines;

function promptHidden(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      pipedLines ??= fs.readFileSync(0, 'utf8').split(/\r?\n/);
      resolve(pipedLines.shift() ?? '');
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    let muted = false;
    rl._writeToOutput = (text) => {
      if (!muted) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const databasePath = resolveDatabasePath();
if (!fs.existsSync(databasePath)) {
  fail(`No database at ${databasePath}. Set DATABASE_URL if yours lives elsewhere.`);
}
if (typeof process.getuid === 'function' && process.getuid() === 0) {
  console.warn(
    'Warning: running as root can leave root-owned database files that the app then cannot open. ' +
      'Prefer the user that owns the data directory.'
  );
}

const db = new Database(databasePath);
try {
  const users = db.prepare('SELECT id, username FROM users ORDER BY id').all();
  if (users.length === 0) {
    fail('There is no admin account yet. Open /setup in the browser to create one.');
  }

  const wanted = argValue('--username');
  let user;
  if (wanted) {
    user = users.find((candidate) => candidate.username === wanted);
    if (!user) fail(`No account named "${wanted}". Accounts: ${users.map((u) => u.username).join(', ')}`);
  } else if (users.length === 1) {
    user = users[0];
  } else {
    fail(`Several accounts exist (${users.map((u) => u.username).join(', ')}); choose one with --username.`);
  }

  let password = process.env.FILE_NODE_NEW_PASSWORD;
  if (password === undefined) {
    password = await promptHidden(`New password for "${user.username}": `);
    const again = await promptHidden('Repeat the new password: ');
    if (password !== again) fail('The passwords do not match.');
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    fail(`The password must be at most ${MAX_PASSWORD_BYTES} bytes.`);
  }

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(
    bcrypt.hashSync(password, 12),
    user.id
  );
  console.log(`Password updated for "${user.username}". All existing sessions have been signed out.`);
} finally {
  db.close();
}
