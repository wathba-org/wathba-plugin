#!/usr/bin/env bash
# Installs one built marketplace tree into throwaway Claude Code, Codex and
# Gemini CLI homes and checks what each host actually loaded. All three CLIs
# must be on PATH; a missing CLI fails the run. Cursor needs a signed-in
# account to load a plugin, so its manifest is checked only by sync.mjs.
#
#   scripts/smoke-hosts.sh <marketplace-dir> <dev|prod>
set -euo pipefail

tree="$(cd "$1" && pwd)"
target="$2"
config="$(dirname "$0")/../plugin.config.json"

plugin="$(jq -r --arg t "$target" '.targets[$t].plugin' "$config")"
marketplace="$(jq -r --arg t "$target" '.targets[$t].marketplace' "$config")"
server="$(jq -r --arg t "$target" '.targets[$t].serverKey' "$config")"
url="$(jq -r --arg t "$target" '.targets[$t].apiOrigin + "/mcp"' "$config")"
version="$(jq -r '.version' "$tree/plugins/$plugin/plugin.json")"
id="$plugin@$marketplace"

for cli in claude codex gemini jq; do
  command -v "$cli" >/dev/null || { echo "missing required CLI: $cli" >&2; exit 1; }
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/home" "$work/claude" "$work/codex" "$work/gemini-cwd"
export HOME="$work/home" CLAUDE_CONFIG_DIR="$work/claude" CODEX_HOME="$work/codex"

echo "== Claude Code: validate"
claude plugin validate "$tree" --strict
claude plugin validate "$tree/plugins/$plugin" --strict

echo "== Claude Code: install $id"
claude plugin marketplace add "$tree"
claude plugin install "$id"
claude plugin list --json >"$work/claude.json"
jq -e --arg id "$id" --arg v "$version" --arg s "$server" --arg u "$url" '
  map(select(.id == $id)) | length == 1 and
  (.[0].version == $v) and (.[0].enabled == true) and
  (.[0].mcpServers | keys == [$s]) and
  (.[0].mcpServers[$s] == {type: "http", url: $u})
' "$work/claude.json" >/dev/null || { cat "$work/claude.json"; exit 1; }
claude plugin details "$plugin" | grep -Eq 'Skills \(1\) +wathba' \
  || { echo "Claude Code did not load the wathba skill" >&2; exit 1; }

echo "== Codex: install $id"
codex plugin marketplace add "$tree" --json >/dev/null
codex plugin add "$id" --json >"$work/codex-add.json"
jq -e --arg v "$version" '.version == $v' "$work/codex-add.json" >/dev/null \
  || { cat "$work/codex-add.json"; exit 1; }
installed="$(jq -r '.installedPath' "$work/codex-add.json")"
test -f "$installed/skills/wathba/SKILL.md" \
  || { echo "Codex did not install the wathba skill" >&2; exit 1; }
codex mcp list --json >"$work/codex-mcp.json"
jq -e --arg s "$server" --arg u "$url" '
  map(select(.name == $s)) | length == 1 and
  (.[0].transport.type == "streamable_http") and (.[0].transport.url == $u) and
  (.[0].transport.http_headers == null) and (.[0].transport.bearer_token_env_var == null)
' "$work/codex-mcp.json" >/dev/null || { cat "$work/codex-mcp.json"; exit 1; }

# Gemini CLI installs the whole tree as one extension: the root manifest and
# the root skills/ copy. It prints its JSON list on stderr, so read the files.
echo "== Gemini CLI: install $plugin"
# A local source asks on stdin whether to trust its folder; it is our build.
(cd "$work/gemini-cwd" && printf 'y\n' | gemini extensions install "$tree" --consent --skip-settings)
extension="$HOME/.gemini/extensions/$plugin"
jq -e --arg p "$plugin" --arg v "$version" --arg s "$server" --arg u "$url" '
  .name == $p and .version == $v and (.mcpServers | keys == [$s]) and
  (.mcpServers[$s] == {type: "http", url: $u})
' "$extension/gemini-extension.json" >/dev/null || { cat "$extension/gemini-extension.json"; exit 1; }
cmp -s "$extension/skills/wathba/SKILL.md" "$tree/plugins/$plugin/skills/wathba/SKILL.md" \
  || { echo "Gemini CLI did not install the wathba skill" >&2; exit 1; }
(cd "$work/gemini-cwd" && gemini mcp list 2>&1) >"$work/gemini-mcp.txt"
[[ "$(grep -c " (from " "$work/gemini-mcp.txt")" == 1 ]] \
  && grep -qF "$server (from $plugin): $url (http)" "$work/gemini-mcp.txt" \
  || { cat "$work/gemini-mcp.txt"; echo "Gemini CLI does not list exactly one $server server at $url" >&2; exit 1; }

echo "smoke: $id $version installs in Claude Code, Codex and Gemini CLI with one $server server at $url"
