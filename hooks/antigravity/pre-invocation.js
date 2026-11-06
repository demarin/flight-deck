#!/usr/bin/env node
// flight-deck — Antigravity PreInvocation hook (runs before every model call).
//
// In Antigravity the protocol is an always-on plugin rule (rules/AGENTS.md),
// re-read into the system prompt on every turn, so this hook does not inject
// it. It only handles the per-conversation switch:
//
// 1. `/flight-deck [on|off|status]` (the slash is optional, in case a surface
//    swallows unknown slash commands): store the mode for this conversation,
//    show the answer to the user via an errorMessage step (never sent to the
//    model) and terminate the turn, so the command costs no model call.
//    errorMessage is required: without it `terminate` is ignored and the
//    model runs (measured on agy 1.5.0). Side effect: `agy -p --output-format
//    json` keeps reporting that message as `error` on later turns.
// 2. Any other input while the mode is off: an ephemeral note telling the
//    model to disregard the rule. A rule cannot be removed from the prompt for
//    one conversation, only overridden.
//
// Input (stdin, camelCase): conversationId, lastUserInput, invocationNum, ...
// Output (stdout): {} or { injectSteps: [...], terminationBehavior }.

'use strict';

const { antigravityStateDir, createStore, defaultMode, readStdinJson } = require('../lib/state');

const COMMAND = /^\/?flight-deck(?::flight-deck)?(?:\s+(\S+))?\s*$/i;

const REMINDER_OFF =
  'FLIGHT DECK OFF for this conversation (the user ran /flight-deck off). ' +
  'Disregard the Flight Deck rule and respond in your normal style.';

function reply(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function stopWith(message) {
  reply({ injectSteps: [{ errorMessage: { userMessage: message } }], terminationBehavior: 'terminate' });
}

function handleCommand(store, id, arg, mode) {
  const action = (arg || 'status').toLowerCase();
  if (action === 'on' || action === 'enable') {
    store.write(id, { mode: 'on', rulesLoaded: true });
    stopWith('Flight Deck: ON for this conversation.');
  } else if (action === 'off' || action === 'disable') {
    store.write(id, { mode: 'off', rulesLoaded: true });
    stopWith(
      'Flight Deck: OFF for this conversation. To turn it off everywhere, disable the flight-deck plugin.'
    );
  } else if (action === 'status') {
    stopWith('Flight Deck: ' + mode.toUpperCase() + ' for this conversation. Switch with /flight-deck on|off.');
  } else {
    stopWith('Flight Deck: unknown argument "' + arg.slice(0, 32) + '". Use /flight-deck on|off|status.');
  }
}

function main() {
  const input = readStdinJson();
  const id = input.conversationId;
  const text = typeof input.lastUserInput === 'string' ? input.lastUserInput.trim() : '';
  const store = createStore(antigravityStateDir());
  const state = store.read(id);
  const mode = state ? state.mode : defaultMode();

  // First time this conversation is seen: a cheap moment to drop stale state.
  // (Measured on agy 1.5.0: the hook runs once per user turn, invocationNum 0.)
  if (!state) store.prune();

  const match = COMMAND.exec(text);
  if (match) {
    handleCommand(store, id, match[1], mode);
    return;
  }

  if (mode === 'off') {
    reply({ injectSteps: [{ ephemeralMessage: REMINDER_OFF }] });
    return;
  }
  reply({});
}

try {
  main();
} catch (e) {
  // A hook must never block a conversation.
  process.stdout.write('{}');
}
