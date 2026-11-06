// Run: node --test tests/
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const SESSION_START = path.join(ROOT, 'hooks', 'session-start.js');
const PROMPT_SUBMIT = path.join(ROOT, 'hooks', 'prompt-submit.js');

function freshConfigDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flight-deck-test-'));
}

function run(script, input, configDir, env = {}) {
  const res = spawnSync(process.execPath, [script], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, FLIGHT_DECK: '', CLAUDE_CONFIG_DIR: configDir, ...env },
  });
  assert.equal(res.status, 0, res.stderr);
  return res.stdout;
}

function prompt(text, configDir, sid = 's1') {
  const out = run(PROMPT_SUBMIT, { session_id: sid, prompt: text }, configDir);
  return out ? JSON.parse(out) : null;
}

test('startup injects the protocol without its frontmatter', () => {
  const dir = freshConfigDir();
  const out = run(SESSION_START, { session_id: 's1', source: 'startup' }, dir);
  assert.match(out, /^FLIGHT DECK MODE ACTIVE/);
  assert.match(out, /# Mode: Flight Deck/);
  assert.doesNotMatch(out, /^name: flight-deck/m);
});

test('FLIGHT_DECK=off starts the session off and injects nothing', () => {
  const dir = freshConfigDir();
  const out = run(SESSION_START, { session_id: 's1', source: 'startup' }, dir, { FLIGHT_DECK: 'off' });
  assert.equal(out, '');
  assert.equal(prompt('hello', dir), null); // no protocol in context -> nothing to override
});

test('/flight-deck off blocks the prompt, then each turn tells the model to disregard the protocol', () => {
  const dir = freshConfigDir();
  run(SESSION_START, { session_id: 's1', source: 'startup' }, dir);

  const res = prompt('/flight-deck off', dir);
  assert.equal(res.decision, 'block');
  assert.match(res.reason, /OFF/);

  const next = prompt('fix the bug', dir);
  assert.match(next.hookSpecificOutput.additionalContext, /^FLIGHT DECK OFF/);
});

test('/flight-deck on after an off start sends the full protocol with the next prompt, once', () => {
  const dir = freshConfigDir();
  run(SESSION_START, { session_id: 's1', source: 'startup' }, dir, { FLIGHT_DECK: 'off' });

  assert.equal(prompt('/flight-deck on', dir).decision, 'block');
  assert.match(prompt('task one', dir).hookSpecificOutput.additionalContext, /# Mode: Flight Deck/);
  assert.match(prompt('task two', dir).hookSpecificOutput.additionalContext, /^FLIGHT DECK ACTIVE\./);
});

test('namespaced command and status work; unknown argument is reported, not applied', () => {
  const dir = freshConfigDir();
  run(SESSION_START, { session_id: 's1', source: 'startup' }, dir);

  assert.match(prompt('/flight-deck:flight-deck status', dir).reason, /ON for this session/);
  assert.match(prompt('/flight-deck turbo', dir).reason, /unknown argument/);
  assert.match(prompt('/flight-deck', dir).reason, /ON for this session/);
});

test('the mode is per session', () => {
  const dir = freshConfigDir();
  run(SESSION_START, { session_id: 'a', source: 'startup' }, dir);
  run(SESSION_START, { session_id: 'b', source: 'startup' }, dir);
  prompt('/flight-deck off', dir, 'a');
  assert.match(prompt('x', dir, 'b').hookSpecificOutput.additionalContext, /^FLIGHT DECK ACTIVE\./);
});

test('resume keeps an off session off; compact re-injects the protocol of an on session', () => {
  const dir = freshConfigDir();
  run(SESSION_START, { session_id: 's1', source: 'startup' }, dir);
  prompt('/flight-deck off', dir);
  assert.equal(run(SESSION_START, { session_id: 's1', source: 'resume' }, dir), '');

  run(SESSION_START, { session_id: 's2', source: 'startup' }, dir);
  assert.match(run(SESSION_START, { session_id: 's2', source: 'compact' }, dir), /# Mode: Flight Deck/);
});

test('a hostile session id never becomes a path', () => {
  const dir = freshConfigDir();
  run(SESSION_START, { session_id: '../../evil', source: 'startup' }, dir);
  assert.equal(fs.existsSync(path.join(dir, 'evil.json')), false);
});
