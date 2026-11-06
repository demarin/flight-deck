#!/usr/bin/env node
// flight-deck — UserPromptSubmit hook.
//
// 1. `/flight-deck [on|off|status]` (also `/flight-deck:flight-deck ...`):
//    switch the mode for this session and block the prompt, so the command
//    costs no model turn. The block reason is what the user sees.
// 2. Every other prompt: a one-line reminder of the current mode. The full
//    protocol was injected once at SessionStart; other plugins and output
//    styles inject competing instructions every turn, and the reminder keeps
//    Flight Deck in view. When the mode was switched on mid-session, the full
//    protocol goes along with the next prompt.

'use strict';

const { defaultMode, loadRules, readState, readStdinJson, rulesBanner, writeState } = require('./lib/state');

const COMMAND = /^\/flight-deck(?::flight-deck)?(?:\s+(\S+))?\s*$/i;

const REMINDER_ON =
  'FLIGHT DECK ACTIVE. While tools run: 1-2 telegraphic log lines per key step, no chatter, ' +
  'no teaching asides or Insight blocks. Atomic queries: payload only. ' +
  'Final turn: fully self-contained debrief per the protocol.';

const REMINDER_OFF =
  'FLIGHT DECK OFF for this session (the user ran /flight-deck off). ' +
  'Disregard the Flight Deck protocol injected earlier and respond in your normal style.';

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

function addContext(text) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } })
  );
}

function handleCommand(sessionId, arg, state) {
  const action = (arg || 'status').toLowerCase();

  if (action === 'on' || action === 'enable') {
    // rulesLoaded stays as it was: if the protocol is already in context there
    // is no need to send it again; if not, the next prompt carries it.
    writeState(sessionId, { mode: 'on', rulesLoaded: state.rulesLoaded });
    block('Flight Deck: ON for this session.');
    return;
  }
  if (action === 'off' || action === 'disable') {
    writeState(sessionId, { mode: 'off', rulesLoaded: state.rulesLoaded });
    block('Flight Deck: OFF for this session. New sessions start ON unless FLIGHT_DECK=off is set.');
    return;
  }
  if (action === 'status') {
    block('Flight Deck: ' + state.mode.toUpperCase() + ' for this session. Switch with /flight-deck on|off.');
    return;
  }
  block('Flight Deck: unknown argument "' + arg.slice(0, 32) + '". Use /flight-deck on|off|status.');
}

function main() {
  const input = readStdinJson();
  const sessionId = input.session_id;
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  const state = readState(sessionId) || { mode: defaultMode(), rulesLoaded: false };

  const match = COMMAND.exec(prompt);
  if (match) {
    handleCommand(sessionId, match[1], state);
    return;
  }

  if (state.mode === 'off') {
    // Nothing to override if the protocol never reached this session.
    if (state.rulesLoaded) addContext(REMINDER_OFF);
    return;
  }

  if (!state.rulesLoaded) {
    const rules = loadRules();
    if (rules) {
      writeState(sessionId, { mode: 'on', rulesLoaded: true });
      addContext(rulesBanner(rules));
      return;
    }
  }
  addContext(REMINDER_ON);
}

try {
  main();
} catch (e) {
  // A hook must never block a session.
}
