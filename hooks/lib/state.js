// flight-deck — shared state helpers for the Claude Code and Antigravity hooks.
//
// State is kept per session (Claude Code) or per conversation (Antigravity),
// so `/flight-deck off` in one does not switch the mode off in another one
// running at the same time:
//   <state dir>/<id>.json   { "mode": "on" | "off", "rulesLoaded": true | false }
//
// Every read and write is best-effort: a hook must never break a session, so
// all filesystem errors are swallowed and the caller falls back to defaults.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const MODES = new Set(['on', 'off']);
const STATE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_STATE_BYTES = 256;

function configDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function claudeStateDir() {
  return path.join(configDir(), 'flight-deck', 'state');
}

// Antigravity documents a per-plugin data folder in PLUGIN_DATA, but agy 1.5.0
// does not pass it to hooks, so in practice the fallback ~/.gemini/flight-deck
// is used.
function antigravityStateDir() {
  const base = process.env.PLUGIN_DATA || path.join(os.homedir(), '.gemini', 'flight-deck');
  return path.join(base, 'state');
}

// Ids come from the host, but they become a file name: keep only a safe
// alphabet so a crafted id cannot escape the state directory.
function safeSessionId(id) {
  if (typeof id !== 'string') return null;
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}

// Mode a new session starts in. FLIGHT_DECK=off opts out per shell.
function defaultMode() {
  return (process.env.FLIGHT_DECK || '').trim().toLowerCase() === 'off' ? 'off' : 'on';
}

function createStore(dir) {
  function filePath(id) {
    const safe = safeSessionId(id);
    return safe ? path.join(dir, safe + '.json') : null;
  }

  function read(id) {
    const file = filePath(id);
    if (!file) return null;
    try {
      const st = fs.lstatSync(file);
      if (!st.isFile() || st.size > MAX_STATE_BYTES) return null; // refuses symlinks too
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!data || !MODES.has(data.mode)) return null;
      return { mode: data.mode, rulesLoaded: data.rulesLoaded === true };
    } catch (e) {
      return null;
    }
  }

  function write(id, state) {
    const file = filePath(id);
    if (!file || !MODES.has(state.mode)) return false;
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      try {
        if (fs.lstatSync(file).isSymbolicLink()) return false;
      } catch (e) {
        /* does not exist yet */
      }
      const tmp = file + '.' + process.pid + '.tmp';
      const flags =
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0);
      const fd = fs.openSync(tmp, flags, 0o600);
      try {
        fs.writeSync(fd, JSON.stringify({ mode: state.mode, rulesLoaded: state.rulesLoaded === true }));
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, file);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Drop state files nobody has touched for two weeks.
  function prune(now = Date.now()) {
    try {
      for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name);
        try {
          if (now - fs.lstatSync(file).mtimeMs > STATE_TTL_MS) fs.unlinkSync(file);
        } catch (e) {
          /* raced with another session */
        }
      }
    } catch (e) {
      /* no state dir yet */
    }
  }

  return { dir, filePath, read, write, prune };
}

// The protocol text: SKILL.md without its frontmatter. One source for the
// Claude Code skill, its SessionStart injection and the Antigravity rule.
function loadRules() {
  try {
    const skill = path.join(__dirname, '..', '..', 'skills', 'flight-deck', 'SKILL.md');
    return fs.readFileSync(skill, 'utf8').replace(/^---[\s\S]*?---\s*/, '');
  } catch (e) {
    return '';
  }
}

function rulesBanner(rules) {
  return (
    'FLIGHT DECK MODE ACTIVE for this session (loaded by the flight-deck plugin). ' +
    'Follow the protocol below on every turn. For the in-flight phase it takes precedence over any output style. ' +
    'The user can switch it with /flight-deck on|off|status.\n\n' +
    rules
  );
}

function readStdinJson() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch (e) {
    return {};
  }
}

// Claude Code's store, kept under the original names its hooks use.
const claude = {
  readState: (id) => createStore(claudeStateDir()).read(id),
  writeState: (id, state) => createStore(claudeStateDir()).write(id, state),
  pruneOldState: (now) => createStore(claudeStateDir()).prune(now),
  stateDir: claudeStateDir,
  statePath: (id) => createStore(claudeStateDir()).filePath(id),
};

module.exports = {
  ...claude,
  antigravityStateDir,
  createStore,
  defaultMode,
  loadRules,
  readStdinJson,
  rulesBanner,
  safeSessionId,
};
