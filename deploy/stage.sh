#!/usr/bin/env bash
# Deploy https://stage.jsudc.dev on this VM, build-and-swap:
#   clone or fetch digital-cube/jsudc-website into $ROOT/src -> check out main
#   (v1 while main does not exist) -> npm ci -> npm run build with
#   SITE_URL=https://stage.jsudc.dev and EXAMPLE_URL=https://examples.stage.jsudc.dev
#   -> dist/ to releases/<short sha> -> atomically
#   repoint `current` -> keep the last three releases -> 200 through nginx.
# Idempotent: when releases/<short sha> already holds that commit built for the
# same SITE_URL and EXAMPLE_URL and `current` points at it, nothing is rebuilt or
# moved; the script only checks the site again.
# The vhost (deploy/nginx/stage.jsudc.dev.conf) is linked from $ROOT/src, so a
# deploy that changes it reloads nginx; --install links it the first time.
# Works from any copy of the script: it deploys what the remote branch has, not
# the checkout it was started from.
#
# Usage: deploy/stage.sh [--install] [--branch <name>] [--force]
set -euo pipefail

ROOT=/home/digital/sites/stage.jsudc.dev
SRC="$ROOT/src"
RELEASES="$ROOT/releases"
CURRENT="$ROOT/current"
REPO_URL=https://github.com/digital-cube/jsudc-website.git
HOST=stage.jsudc.dev
SITE_URL="https://$HOST"
EXAMPLE_URL="${EXAMPLE_URL:-https://examples.stage.jsudc.dev}"
NODE_BIN=/home/digital/.nvm/versions/node/v24.19.0/bin
VHOST_SRC="$SRC/deploy/nginx/$HOST.conf"
VHOST_ENABLED="/etc/nginx/sites-enabled/$HOST"
KEEP=3

usage() {
  cat <<EOF
Usage: deploy/stage.sh [--install] [--branch <name>] [--force]

Builds $SITE_URL from $REPO_URL into $ROOT:
  src/                   the checkout (detached at origin/<branch>)
  releases/<short sha>/  one built dist/ per commit, the last $KEEP kept
  current -> releases/…  what nginx serves, swapped atomically
then checks / through nginx on 127.0.0.1 and through the edge.

  --install        link the vhost into $VHOST_ENABLED, nginx -t, reload,
                   then deploy (once per VM; harmless to repeat)
  --branch <name>  branch to build (default: main, or v1 while main does not exist)
  --force          rebuild even when the release for this commit is already current
  -h, --help       this text

EXAMPLE_URL (default https://examples.stage.jsudc.dev, the stage example) is where
the site's live-example links point.

Exit codes: 0 deployed, 1 a step failed, 2 usage, 5 nginx on this VM does not
answer 200, 6 this VM answers 200 but https://$HOST does not (the edge).
EOF
}

INSTALL=0
BRANCH=""
FORCE=0
while (($#)); do
  case "$1" in
    --install) INSTALL=1 ;;
    --branch)
      [[ $# -ge 2 ]] || { echo "stage.sh: --branch needs a name" >&2; exit 2; }
      BRANCH="$2"
      shift
      ;;
    --force) FORCE=1 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "stage.sh: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

# Everything below is one function, read whole before it runs: when this script
# is $SRC/deploy/stage.sh, the checkout step rewrites it under a running bash.
main() {
  export PATH="$NODE_BIN:$PATH"
  [[ -x "$NODE_BIN/node" ]] || { echo "stage.sh: no node at $NODE_BIN (nvm install 24.19.0)" >&2; exit 1; }

  mkdir -p "$RELEASES"
  exec 9>"$ROOT/.deploy.lock"
  flock -n 9 || { echo "stage.sh: another deploy of $HOST is running" >&2; exit 1; }

  echo "==> source ($SRC)"
  if [[ ! -d "$SRC/.git" ]]; then
    timeout 300 git clone --quiet "$REPO_URL" "$SRC"
  fi
  timeout 120 git -C "$SRC" fetch --quiet --prune origin
  if [[ -z "$BRANCH" ]]; then
    if git -C "$SRC" rev-parse --verify --quiet origin/main >/dev/null; then
      BRANCH=main
    else
      BRANCH=v1
      echo "    origin has no main yet, building v1"
    fi
  fi
  git -C "$SRC" rev-parse --verify --quiet "origin/$BRANCH" >/dev/null ||
    { echo "stage.sh: origin has no branch $BRANCH" >&2; exit 1; }
  # sites-enabled links into this checkout: a commit without the vhost would leave
  # nginx a dangling include, and the next reload of any site on the VM would fail.
  git -C "$SRC" cat-file -e "origin/$BRANCH:deploy/nginx/$HOST.conf" 2>/dev/null ||
    { echo "stage.sh: origin/$BRANCH has no deploy/nginx/$HOST.conf, refusing to check it out" >&2; exit 1; }

  local vhost_before="" vhost_after=""
  [[ -f "$VHOST_SRC" ]] && vhost_before="$(sha256sum <"$VHOST_SRC")"
  git -C "$SRC" checkout --quiet --force --detach "origin/$BRANCH"
  git -C "$SRC" clean --quiet -ffdx -e node_modules
  [[ -f "$VHOST_SRC" ]] && vhost_after="$(sha256sum <"$VHOST_SRC")"

  local sha
  sha="$(git -C "$SRC" rev-parse --short=7 HEAD)"
  echo "    $BRANCH at $sha: $(git -C "$SRC" log -1 --format=%s)"

  echo "==> nginx vhost"
  if ((INSTALL)); then
    [[ -f "$VHOST_SRC" ]] || { echo "stage.sh: $sha has no $VHOST_SRC" >&2; exit 1; }
    sudo ln -sfn "$VHOST_SRC" "$VHOST_ENABLED"
    sudo nginx -t
    sudo systemctl reload nginx
    echo "    $VHOST_ENABLED -> $VHOST_SRC, nginx reloaded"
  elif [[ "$(readlink "$VHOST_ENABLED" 2>/dev/null)" != "$VHOST_SRC" ]]; then
    echo "stage.sh: $VHOST_ENABLED is not linked to $VHOST_SRC; run deploy/stage.sh --install" >&2
    exit 1
  elif [[ "$vhost_before" != "$vhost_after" ]]; then
    sudo nginx -t
    sudo systemctl reload nginx
    echo "    the vhost changed, nginx reloaded"
  else
    echo "    unchanged"
  fi

  # What a release was built from; a release is reused only when all of it matches.
  local stamp release="$RELEASES/$sha"
  stamp="$(printf 'commit=%s\nsite_url=%s\nexample_url=%s\n' \
    "$(git -C "$SRC" rev-parse HEAD)" "$SITE_URL" "$EXAMPLE_URL")"

  if ((!FORCE)) && [[ -f "$release/.release" && "$(cat "$release/.release")" == "$stamp" ]]; then
    echo "==> build: releases/$sha already has $sha for $SITE_URL, not rebuilding"
  else
    echo "==> npm ci"
    (cd "$SRC" && timeout 600 npm ci --no-audit --no-fund --loglevel=error)
    echo "==> npm run build (SITE_URL=$SITE_URL EXAMPLE_URL=$EXAMPLE_URL)"
    (cd "$SRC" && SITE_URL="$SITE_URL" EXAMPLE_URL="$EXAMPLE_URL" timeout 600 npm run build)
    [[ -f "$SRC/dist/index.html" ]] || { echo "stage.sh: the build left no dist/index.html" >&2; exit 1; }

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
    echo "==> current: already releases/$sha"
  else
    touch "$release"
    swap "$sha"
    echo "==> current -> releases/$sha"
  fi

  echo "==> prune (keep $KEEP)"
  local old
  # newest first by the time each release became current; never the current one
  ls -1dt "$RELEASES"/*/ 2>/dev/null | sed 's:/$::' | tail -n +$((KEEP + 1)) | while read -r old; do
    [[ "$old" == "$RELEASES/$sha" ]] && continue
    echo "    removing releases/${old##*/}"
    rm -rf "$old"
  done

  check
  echo "stage.sh: $SITE_URL serves $BRANCH at $sha"
}

# Point `current` at releases/<name> with one rename(2): no moment without it.
swap() {
  ln -sfn "releases/$1" "$ROOT/.current.tmp"
  mv -T "$ROOT/.current.tmp" "$CURRENT"
}

check() {
  local code
  echo "==> http://127.0.0.1/ (Host: $HOST)"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H "Host: $HOST" http://127.0.0.1/ || true)"
  if [[ "$code" != 200 ]]; then
    echo "stage.sh: FAILED — nginx on this VM answers $code for $HOST, not 200" >&2
    echo "  curl -sI -H 'Host: $HOST' http://127.0.0.1/ ; tail /var/log/nginx/stage.jsudc.error.log" >&2
    exit 5
  fi
  echo "    200"
  echo "==> $SITE_URL/"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$SITE_URL/" || true)"
  if [[ "$code" != 200 ]]; then
    echo "stage.sh: FAILED — this VM answers 200 but $SITE_URL/ answers $code:" >&2
    echo "  the edge in front of this VM does not route $HOST here" >&2
    exit 6
  fi
  echo "    200"
}

main
exit
