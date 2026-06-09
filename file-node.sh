#!/usr/bin/env bash

set -euo pipefail

APP_NAME="${APP_NAME:-file-node}"
APP_TITLE="${APP_TITLE:-File Node}"
GIT_REPO="${GIT_REPO:-https://github.com/tonyliuzj/file-node.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/file-node}"
PORT="${PORT:-3000}"
NODE_MAJOR="${NODE_MAJOR:-22}"
ENV_FILE=".env.local"
SERVICE_NAME="${SERVICE_NAME:-file-node.service}"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME"
RUN_USER="${SUDO_USER:-$USER}"
RUN_GROUP="$(id -gn "$RUN_USER")"

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

require_systemd() {
  if ! command_exists systemctl; then
    echo "systemd is required for direct install, but systemctl was not found."
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

write_systemd_service() {
  local node_bin npm_bin

  node_bin="$(command -v node)"
  npm_bin="$(command -v npm)"

  step "Writing systemd service"
  as_root tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=$APP_TITLE
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=PATH=$(dirname "$node_bin"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
EnvironmentFile=$INSTALL_DIR/$ENV_FILE
ExecStart=$npm_bin run start -- -p $PORT
Restart=always
RestartSec=5
TimeoutStopSec=20
SyslogIdentifier=$APP_NAME

[Install]
WantedBy=multi-user.target
EOF
}

reload_and_restart_service() {
  step "Reloading systemd and restarting service"
  as_root systemctl daemon-reload
  as_root systemctl enable "$SERVICE_NAME"
  as_root systemctl restart "$SERVICE_NAME"

  echo
  echo "Service: $SERVICE_NAME"
  echo "Visit: http://localhost:$PORT"
  echo "First run setup: http://localhost:$PORT/setup"
  echo "Logs: sudo journalctl -u $SERVICE_NAME -f"
  echo "Status: sudo systemctl status $SERVICE_NAME"
}

stop_and_remove_service() {
  if as_root test -f "$SERVICE_FILE"; then
    step "Stopping and removing systemd service"
    as_root systemctl disable --now "$SERVICE_NAME" || true
    as_root rm -f "$SERVICE_FILE"
    as_root systemctl daemon-reload
  fi
}

install_app() {
  require_linux
  require_systemd
  install_system_dependencies
  ensure_nodejs
  ensure_repo
  ensure_env_file
  install_node_dependencies
  build_app
  write_systemd_service
  reload_and_restart_service
}

update_app() {
  require_linux
  require_systemd
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
  write_systemd_service
  reload_and_restart_service
}

start_app() {
  require_systemd
  as_root systemctl start "$SERVICE_NAME"
  as_root systemctl status "$SERVICE_NAME" --no-pager
}

stop_app() {
  require_systemd
  as_root systemctl stop "$SERVICE_NAME"
  echo "$SERVICE_NAME stopped."
}

restart_app() {
  require_systemd
  as_root systemctl restart "$SERVICE_NAME"
  as_root systemctl status "$SERVICE_NAME" --no-pager
}

status_app() {
  require_systemd
  as_root systemctl status "$SERVICE_NAME" --no-pager
}

logs_app() {
  require_systemd
  as_root journalctl -u "$SERVICE_NAME" -f
}

uninstall_app() {
  echo "Uninstalling $APP_TITLE"
  require_systemd
  stop_and_remove_service

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

show_direct_menu() {
  echo
  echo "====== Direct Deployment (systemd) ======"
  echo "Install dir: $INSTALL_DIR"
  echo "Port:        $PORT"
  echo
  echo "1) Install"
  echo "2) Update"
  echo "3) Start service"
  echo "4) Stop service"
  echo "5) Restart service"
  echo "6) Service status"
  echo "7) Service logs"
  echo "8) Uninstall"
  echo "========================================="
  printf "Select an option [1-8]: "
  read -r choice
  echo

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

show_docker_menu() {
  echo
  echo "====== Docker Deployment (Compose) ======"
  echo "Docker deployment is not configured for this repository yet."
  echo "Add a Dockerfile and docker-compose.yml before using this mode."
  echo "========================================="
  exit 1
}

show_deployment_menu() {
  echo "========== $APP_TITLE Installer =========="
  echo "1) Direct install (systemd)"
  echo "2) Docker install (Compose)"
  echo "============================================"
  printf "Select a deployment mode [1-2]: "
  read -r mode_choice
  echo

  case "$mode_choice" in
    1) show_direct_menu ;;
    2) show_docker_menu ;;
    *) echo "Invalid choice."; exit 1 ;;
  esac
}

show_deployment_menu
