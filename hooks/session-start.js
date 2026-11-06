#!/usr/bin/env node
// flight-deck — SessionStart hook.
//
// Plain stdout of a SessionStart hook becomes hidden context of the session.
//   startup / clear : start in the default mode (FLIGHT_DECK=off opts out)
//   resume          : keep the mode the session had (e.g. after /flight-deck off)
//   compact         : compaction dropped the rules from context, so re-inject them

'use strict';

const {
  defaultMode,
  loadRules,
  pruneOldState,
  readState,
  readStdinJson,
  rulesBanner,
  writeState,
} = require('./lib/state');

function main() {
  const input = readStdinJson();
  const sessionId = input.session_id;
  const source = input.source || 'startup';

  pruneOldState();

  const previous = source === 'resume' || source === 'compact' ? readState(sessionId) : null;
  const mode = previous ? previous.mode : defaultMode();

  if (mode === 'off') {
    writeState(sessionId, { mode: 'off', rulesLoaded: false });
    return;
  }

  const rules = loadRules();
  if (!rules) return; // broken install: stay silent rather than inject half a protocol

  writeState(sessionId, { mode: 'on', rulesLoaded: true });
  process.stdout.write(rulesBanner(rules));
}

try {
  main();
} catch (e) {
  // A hook must never block a session.
}
