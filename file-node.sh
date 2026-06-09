#!/usr/bin/env bash

set -euo pipefail

APP_NAME="${APP_NAME:-file-node}"
APP_TITLE="${APP_TITLE:-File Node}"
GIT_REPO="${GIT_REPO:-https://github.com/tonyliuzj/file-node.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/file-node}"
PORT="${PORT:-3000}"
NODE_MAJOR="${NODE_MAJOR:-22}"
PROCESS_NAME="${PROCESS_NAME:-file-node}"
ENV_FILE=".env.local"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

step() {
  echo
  echo "==> $*"
}

require_linux() {
  if [ "$(uname -s)" != "Linux" ]; then
    echo "This installer targets Linux servers. Clone manually for other systems."
    exit 1
  fi
}

install_system_dependencies() {
  step "Installing system dependencies"
  as_root apt update
  as_root apt install -y git curl ca-certificates build-essential python3 openssl
}

ensure_nodejs() {
  step "Checking Node.js"

  if command_exists node; then
    local version major
    version="$(node -v | sed 's/^v//')"
    major="${version%%.*}"
    if [ "$major" -ge 18 ]; then
      echo "Node.js v$version detected."
      return
    fi
    echo "Node.js v$version detected, but Node.js >=18 is required."
  fi

  read -r -p "Install Node.js ${NODE_MAJOR}.x from NodeSource? [Y/n]: " answer
  answer="${answer:-Y}"
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    echo "Node.js >=18 is required."
    exit 1
  fi

  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | as_root bash -
  as_root apt install -y nodejs
}

ensure_pm2() {
  step "Checking PM2"
  if command_exists pm2; then
    echo "PM2 detected."
    return
  fi

  as_root npm install -g pm2
}

ensure_repo() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    step "Updating existing repository"
    cd "$INSTALL_DIR"
    git pull --ff-only
    return
  fi

  if [ -e "$INSTALL_DIR" ]; then
    echo "$INSTALL_DIR already exists but is not a git repository."
    read -r -p "Remove it and clone fresh? [y/N]: " answer
    if [[ ! "$answer" =~ ^[Yy]$ ]]; then
      echo "Aborted."
      exit 1
    fi
    rm -rf "$INSTALL_DIR"
  fi

  step "Cloning $APP_TITLE"
  git clone "$GIT_REPO" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
}

ensure_env_file() {
  step "Writing environment file"
  if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" <<EOF
PORT=$PORT
EOF
    echo "Created $ENV_FILE"
    return
  fi

  if ! grep -q '^PORT=' "$ENV_FILE"; then
    printf '\nPORT=%s\n' "$PORT" >> "$ENV_FILE"
  fi
  echo "Using existing $ENV_FILE"
}

install_node_dependencies() {
  step "Installing project dependencies"
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
}

build_app() {
  step "Building $APP_TITLE"
  npm run build
}

start_pm2() {
  step "Starting $APP_TITLE with PM2"
  pm2 delete "$PROCESS_NAME" >/dev/null 2>&1 || true
  pm2 start npm --name "$PROCESS_NAME" -- run start -- -p "$PORT"
  pm2 save

  echo
  echo "PM2 process: $PROCESS_NAME"
  echo "Visit: http://localhost:$PORT"
  echo "First run setup: http://localhost:$PORT/setup"
  echo "Logs: pm2 logs $PROCESS_NAME"
  echo "Enable startup after reboot: pm2 startup"
}

install_app() {
  require_linux
  install_system_dependencies
  ensure_nodejs
  ensure_pm2
  ensure_repo
  ensure_env_file
  install_node_dependencies
  build_app
  start_pm2
}

update_app() {
  require_linux
  if [ ! -d "$INSTALL_DIR/.git" ]; then
    echo "$APP_TITLE is not installed in $INSTALL_DIR."
    exit 1
  fi

  cd "$INSTALL_DIR"
  step "Pulling latest code"
  git pull --ff-only
  ensure_env_file
  install_node_dependencies
  build_app
  start_pm2
}

start_app() {
  pm2 start "$PROCESS_NAME"
}

stop_app() {
  pm2 stop "$PROCESS_NAME"
}

restart_app() {
  pm2 restart "$PROCESS_NAME"
}

status_app() {
  pm2 status "$PROCESS_NAME"
}

logs_app() {
  pm2 logs "$PROCESS_NAME"
}

uninstall_app() {
  echo "Uninstalling $APP_TITLE"
  pm2 delete "$PROCESS_NAME" >/dev/null 2>&1 || true
  pm2 save || true

  if [ -d "$INSTALL_DIR" ]; then
    read -r -p "Remove $INSTALL_DIR, including data? [y/N]: " answer
    if [[ "$answer" =~ ^[Yy]$ ]]; then
      rm -rf "$INSTALL_DIR"
      echo "Removed $INSTALL_DIR"
    else
      echo "Kept $INSTALL_DIR"
    fi
  fi
}

show_menu() {
  echo "========== $APP_TITLE Installer =========="
  echo "Install dir: $INSTALL_DIR"
  echo "Port:        $PORT"
  echo
  echo "1) Install"
  echo "2) Update"
  echo "3) Start"
  echo "4) Stop"
  echo "5) Restart"
  echo "6) Status"
  echo "7) Logs"
  echo "8) Uninstall"
  echo "=========================================="
  read -r -p "Select an option [1-8]: " choice

  case "$choice" in
    1) install_app ;;
    2) update_app ;;
    3) start_app ;;
    4) stop_app ;;
    5) restart_app ;;
    6) status_app ;;
    7) logs_app ;;
    8) uninstall_app ;;
    *) echo "Invalid choice."; exit 1 ;;
  esac
}

show_menu
