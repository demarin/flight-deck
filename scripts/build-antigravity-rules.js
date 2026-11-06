#!/usr/bin/env node
// Generates rules/AGENTS.md (the Antigravity always-on rule) from
// skills/flight-deck/SKILL.md, the single source of the protocol.
//   node scripts/build-antigravity-rules.js          write the file
//   node scripts/build-antigravity-rules.js --check  exit 1 if it is stale

'use strict';

const fs = require('fs');
const path = require('path');
const { loadRules } = require('../hooks/lib/state');

const OUT = path.join(__dirname, '..', 'rules', 'AGENTS.md');

const HEADER =
  '<!-- Generated from skills/flight-deck/SKILL.md by scripts/build-antigravity-rules.js; edit the source, then run `npm run build`. -->\n\n' +
  'FLIGHT DECK MODE: always on while the flight-deck plugin is enabled. Follow the protocol below on every turn. ' +
  'The user can switch it for the current conversation with `/flight-deck on|off|status`; ' +
  'while a system note says Flight Deck is OFF, disregard this protocol and respond normally.\n\n';

function render() {
  const rules = loadRules();
  if (!rules) throw new Error('skills/flight-deck/SKILL.md not found or empty');
  return HEADER + rules;
}

if (require.main === module) {
  const expected = render();
  if (process.argv.includes('--check')) {
    const actual = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (actual !== expected) {
      console.error('rules/AGENTS.md is stale: run `npm run build`.');
      process.exit(1);
    }
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, expected);
    console.log('wrote', path.relative(process.cwd(), OUT));
  }
}

module.exports = { render, OUT };
