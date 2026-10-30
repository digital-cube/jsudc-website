#!/usr/bin/env bash
# Deploy https://jsudc.dev on digitalcube-production-websites, build-and-swap:
#   clone or fetch digital-cube/jsudc-website into $ROOT/src -> check out
#   origin/main (origin/v1 while main does not exist) -> npm ci -> npm run build
#   with SITE_URL=https://jsudc.dev and EXAMPLE_URL=https://examples.jsudc.dev
#   -> dist/ to releases/<short sha> -> atomically repoint `current` -> keep the
#   last three releases -> the site through nginx and through the edge.
# Idempotent: when releases/<short sha> already holds that commit built for the
# same SITE_URL and EXAMPLE_URL and `current` points at it, nothing is rebuilt or
# moved; the script only checks the site again.
# The vhost (deploy/nginx/jsudc.dev.conf) is a symlink into $ROOT/src, so a
# deploy that changes it reloads nginx; --install links it the first time.
# Works from any copy of the script (scp it to /tmp for the first run): it
# deploys what origin has, not the checkout it was started from. After the first
# run it lives in $ROOT/src/deploy/prod.sh.
#
# Usage: deploy/prod.sh [--install] [--ref <committish>] [--force]
set -euo pipefail

ROOT=/home/digital/sites/jsudc.dev
SRC="$ROOT/src"
RELEASES="$ROOT/releases"
CURRENT="$ROOT/current"
NODE_LINK="$ROOT/node" # -> the nvm bin dir the build runs with
REPO_URL=https://github.com/digital-cube/jsudc-website.git
HOST=jsudc.dev
SITE_URL="https://$HOST"
EXAMPLE_URL="${EXAMPLE_URL:-https://examples.jsudc.dev}"
EXPECTED_HOST=digitalcube-production-websites
EXPECTED_USER=digital
VHOST_SRC="$SRC/deploy/nginx/$HOST.conf"
VHOST_AVAILABLE="/etc/nginx/sites-available/$HOST"
VHOST_ENABLED="/etc/nginx/sites-enabled/$HOST"
KEEP=3

usage() {
  cat <<EOF
Usage: deploy/prod.sh [--install] [--ref <committish>] [--force]

Runs ON $EXPECTED_HOST as $EXPECTED_USER. Builds $SITE_URL from
$REPO_URL into $ROOT:
  src/                   the checkout (detached at origin/main, origin/v1 until main exists)
  releases/<short sha>/  one built dist/ per commit, the last $KEEP kept
  current -> releases/…  what nginx serves, swapped atomically
  node -> ~/.nvm/…/bin   the Node the build runs with (newest installed v24)
then checks / through nginx on 127.0.0.1 (the site, not the "coming soon"
page), the www redirect, and $SITE_URL/ through the edge.

  --install        link the vhost (the hand-written "coming soon" vhost is kept
                   as $VHOST_AVAILABLE.coming-soon), nginx -t, reload, then
                   deploy (once per VM; harmless to repeat)
  --ref <c>        deploy this committish instead of origin/main (a tag, a sha,
                   origin/<branch>); for a rollback or a pinned build
  --force          rebuild even when the release for this commit is already current
  -h, --help       this text

EXAMPLE_URL (default https://examples.jsudc.dev, the production example) is where
the site's live-example links point.

Exit codes: 0 deployed, 1 a step failed, 2 usage, 3 refused (root, another host
or user, missing tool), 5 nginx on this VM does not serve the site, 6 this VM
serves it but $SITE_URL does not (the edge).
EOF
}

INSTALL=0
REF=""
FORCE=0
while (($#)); do
  case "$1" in
    --install) INSTALL=1 ;;
    --ref)
      [[ $# -ge 2 && -n "$2" ]] || { echo "prod.sh: --ref needs a committish" >&2; exit 2; }
      REF="$2"
      shift
      ;;
    --force) FORCE=1 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "prod.sh: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

die() { # die <exit code> <message...>
  local code="$1"
  shift
  echo "prod.sh: $*" >&2
  exit "$code"
}
step() { printf '==> %s\n' "$*"; }

# Everything below is in functions, read whole before they run: when this script
# is $SRC/deploy/prod.sh, the checkout step rewrites it under a running bash.
main() {
  [[ $EUID -ne 0 ]] || die 3 "refusing to run as root — run it as $EXPECTED_USER"
  [[ "$(hostname)" == "$EXPECTED_HOST" ]] ||
    die 3 "refusing to run on $(hostname) — this script deploys production on $EXPECTED_HOST"
  [[ "$(id -un)" == "$EXPECTED_USER" ]] || die 3 "refusing to run as $(id -un) — the site belongs to $EXPECTED_USER"
  local tool
  for tool in git curl flock sudo; do
    command -v "$tool" >/dev/null || die 3 "$tool is required (sudo apt install $tool)"
  done
  sudo -n true 2>/dev/null || die 3 "passwordless sudo is required (nginx)"

  mkdir -p "$ROOT" "$RELEASES"
  exec 9>"$ROOT/.deploy.lock"
  flock -n 9 || die 1 "another deploy of $HOST is running"

  step "node"
  pick_node
  export PATH="$NODE_LINK:$PATH"
  echo "    $NODE_LINK -> $(readlink "$NODE_LINK") ($(node --version), npm $(npm --version))"

  step "source ($SRC)"
  if [[ ! -d "$SRC/.git" ]]; then
    timeout 300 git clone --quiet "$REPO_URL" "$SRC"
  fi
  timeout 120 git -C "$SRC" fetch --quiet --prune origin
  if [[ -z "$REF" ]]; then
    if git -C "$SRC" rev-parse --verify --quiet origin/main >/dev/null; then
      REF=origin/main
    else
      REF=origin/v1
      echo "    origin has no main yet, building v1"
    fi
  fi
  git -C "$SRC" rev-parse --verify --quiet "$REF^{commit}" >/dev/null ||
    die 1 "no such commit: $REF (origin was fetched)"
  # sites-enabled links into this checkout: a commit without the vhost would leave
  # nginx a dangling include, and the next reload of any site on the VM would fail.
  git -C "$SRC" cat-file -e "$REF:deploy/nginx/$HOST.conf" 2>/dev/null ||
    die 1 "$REF has no deploy/nginx/$HOST.conf, refusing to check it out"

  local vhost_before="" vhost_after=""
  [[ -f "$VHOST_SRC" ]] && vhost_before="$(sha256sum <"$VHOST_SRC")"
  git -C "$SRC" checkout --quiet --force --detach "$REF"
  git -C "$SRC" clean --quiet -ffdx -e node_modules
  [[ -f "$VHOST_SRC" ]] && vhost_after="$(sha256sum <"$VHOST_SRC")"

  local sha
  sha="$(git -C "$SRC" rev-parse --short=7 HEAD)"
  echo "    $REF at $sha: $(git -C "$SRC" log -1 --format=%s)"

  # What a release was built from; a release is reused only when all of it matches.
  local stamp release="$RELEASES/$sha"
  stamp="$(printf 'commit=%s\nsite_url=%s\nexample_url=%s\n' \
    "$(git -C "$SRC" rev-parse HEAD)" "$SITE_URL" "$EXAMPLE_URL")"

  if ((!FORCE)) && [[ -f "$release/.release" && "$(cat "$release/.release")" == "$stamp" ]]; then
    step "build: releases/$sha already has $sha for $SITE_URL, not rebuilding"
  else
    step "npm ci"
    (cd "$SRC" && timeout 600 npm ci --no-audit --no-fund --loglevel=error)
    step "npm run build (SITE_URL=$SITE_URL EXAMPLE_URL=$EXAMPLE_URL)"
    (cd "$SRC" && SITE_URL="$SITE_URL" EXAMPLE_URL="$EXAMPLE_URL" timeout 600 npm run build)
    [[ -f "$SRC/dist/index.html" ]] || die 1 "the build left no dist/index.html"

    local next="$release.new"
    rm -rf "$next"
    cp -a "$SRC/dist" "$next"
    printf '%s\n' "$stamp" >"$next/.release"
    if [[ -e "$release" ]]; then
      # A rebuild of the same commit: serve .new while the old copy is replaced.
      swap "$sha.new"
      rm -rf "$release"
      cp -a "$next" "$release"
      swap "$sha"
      rm -rf "$next"
    else
      mv "$next" "$release"
    fi
  fi

  if [[ "$(readlink "$CURRENT" 2>/dev/null)" == "releases/$sha" ]]; then
    step "current: already releases/$sha"
  else
    touch "$release"
    swap "$sha"
    step "current -> releases/$sha"
  fi

  # After `current` exists: the vhost's root follows it, there is never a moment
  # when nginx serves this site from a missing directory.
  step "nginx vhost"
  if ((INSTALL)); then
    install_vhost
  elif [[ "$(readlink -f "$VHOST_ENABLED" 2>/dev/null)" != "$VHOST_SRC" ]]; then
    die 1 "$VHOST_ENABLED is not linked to $VHOST_SRC; run deploy/prod.sh --install"
  elif [[ "$vhost_before" != "$vhost_after" ]]; then
    sudo -n nginx -t
    sudo -n systemctl reload nginx
    echo "    the vhost changed, nginx reloaded"
  else
    echo "    unchanged"
  fi

  step "prune (keep $KEEP)"
  local old
  # newest first by the time each release became current; never the current one
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2- |
    tail -n +$((KEEP + 1)) | while read -r old; do
    [[ "$old" == "$RELEASES/$sha" ]] && continue
    echo "    removing releases/${old##*/}"
    rm -rf "$old"
  done

  check
  echo "prod.sh: $SITE_URL serves $REF at $sha  (TLS at the edge; this VM answers on :80)"
}

# The bin dir of the newest nvm v24, or nothing.
newest_node24() {
  find "$HOME/.nvm/versions/node" -mindepth 1 -maxdepth 1 -type d -name 'v24.*' 2>/dev/null |
    sort -V | tail -n 1 | sed 's:$:/bin:'
}

# $NODE_LINK -> the newest installed nvm v24 (installs one when there is none).
pick_node() {
  local bin
  bin="$(newest_node24)"
  if [[ -z "$bin" || ! -x "$bin/node" ]]; then
    [[ -s "$HOME/.nvm/nvm.sh" ]] || die 1 "no Node 24 under ~/.nvm and no nvm to install one"
    echo "    no Node 24 under ~/.nvm — nvm install 24"
    # shellcheck source=/dev/null
    (. "$HOME/.nvm/nvm.sh" && timeout 600 nvm install 24 >/dev/null)
    bin="$(newest_node24)"
    [[ -n "$bin" && -x "$bin/node" ]] || die 1 "nvm install 24 left no node"
  fi
  if [[ "$(readlink "$NODE_LINK" 2>/dev/null)" != "$bin" ]]; then
    ln -sfn "$bin" "$ROOT/.node.tmp"
    mv -T "$ROOT/.node.tmp" "$NODE_LINK"
  fi
}

# sites-available/jsudc.dev -> $VHOST_SRC, sites-enabled -> sites-available.
# The hand-written "coming soon" vhost that was there stays beside it as
# $VHOST_AVAILABLE.coming-soon (nginx includes only sites-enabled/*); its page in
# /var/www/jsudc.dev is not touched.
install_vhost() {
  [[ -f "$VHOST_SRC" ]] || die 1 "no $VHOST_SRC in the checkout"
  if [[ -f "$VHOST_AVAILABLE" && ! -L "$VHOST_AVAILABLE" ]]; then
    echo "    keeping the previous regular file as $VHOST_AVAILABLE.coming-soon"
    sudo -n mv -f "$VHOST_AVAILABLE" "$VHOST_AVAILABLE.coming-soon"
  fi
  sudo -n ln -sfn "$VHOST_SRC" "$VHOST_AVAILABLE"
  sudo -n ln -sfn "$VHOST_AVAILABLE" "$VHOST_ENABLED"
  sudo -n nginx -t
  sudo -n systemctl reload nginx
  echo "    $VHOST_ENABLED -> $VHOST_AVAILABLE -> $VHOST_SRC, nginx reloaded"
}

# Point `current` at releases/<name> with one rename(2): no moment without it.
swap() {
  ln -sfn "releases/$1" "$ROOT/.current.tmp"
  mv -T "$ROOT/.current.tmp" "$CURRENT"
}

# The built home page: the site's canonical origin and the production example,
# not the "coming soon" page (which also answered 200 on every path).
is_site() { # is_site <html>
  grep -q "<link rel=\"canonical\" href=\"$SITE_URL/\"" <<<"$1" && grep -qF "$EXAMPLE_URL" <<<"$1"
}

check() {
  step "http://127.0.0.1/ (Host: $HOST, up to 30 s)"
  # For a moment after a reload nginx's old workers still answer with the old vhost.
  local deadline=$((SECONDS + 30)) page
  until page="$(curl -fsS -m 10 -H "Host: $HOST" http://127.0.0.1/ 2>/dev/null)" && is_site "$page"; do
    ((SECONDS < deadline)) ||
      die 5 "nginx on this VM does not serve the built site for $HOST: $(head -c 300 <<<"${page:-}") — tail /var/log/nginx/$HOST.error.log"
    sleep 2
  done
  echo "    200, canonical $SITE_URL/, live-example links to $EXAMPLE_URL"

  step "http://127.0.0.1/no-such-page/ is the site's 404"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 -H "Host: $HOST" http://127.0.0.1/no-such-page/ || true)"
  [[ "$code" == 404 ]] || die 5 "a missing page answers $code, not 404"
  echo "    404"

  step "http://127.0.0.1/ (Host: www.$HOST) redirects"
  local location
  location="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -m 10 -H "Host: www.$HOST" http://127.0.0.1/ || true)"
  [[ "$location" == "301 $SITE_URL/" ]] || die 5 "www.$HOST answers \"$location\", not \"301 $SITE_URL/\""
  echo "    $location"

  step "$SITE_URL/ through the edge"
  page="$(curl -fsS -m 30 "$SITE_URL/" 2>/dev/null || true)"
  is_site "$page" || die 6 "this VM serves the site but $SITE_URL/ does not: the edge does not route $HOST here"
  echo "    ok"
}

main
exit
