#!/bin/sh
set -eu

db_path="${DATABASE_URL:-/app/data/data.db}"

case "$db_path" in
  file:*)
    db_path="${db_path#file:}"
    ;;
esac

db_dir=""
case "$db_path" in
  */*)
    db_dir="$(dirname "$db_path")"
    ;;
esac

mkdir -p /app/data
if [ -n "$db_dir" ] && [ "$db_dir" != "." ]; then
  mkdir -p "$db_dir"
fi

# The database holds password hashes and encrypted backend credentials: keep new files private to
# the app user (existing ones are tightened below).
umask 077

# Bind mounts arrive owned by whoever created them on the host, so hand the data directory to the app
# user before dropping root. A database kept outside /app/data only gets its own directory and files
# changed, never the whole tree around it.
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /app/data
  chmod -R go-rwx /app/data

  if [ -n "$db_dir" ] && [ "$db_dir" != "." ]; then
    case "$(cd "$db_dir" && pwd -P)" in
      /app/data|/app/data/*)
        ;;
      *)
        chown node:node "$db_dir"
        for db_file in "$db_path" "$db_path-wal" "$db_path-shm"; do
          if [ -e "$db_file" ]; then
            chown node:node "$db_file"
            chmod go-rwx "$db_file"
          fi
        done
        ;;
    esac
  fi

  exec gosu node "$@"
fi

exec "$@"
