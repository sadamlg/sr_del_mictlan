import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const componentPath = path.join(__dirname, '../src/components/landing/faq/landing-faq.js');
const contentPath = path.join(__dirname, '../src/components/landing/faq/landing-faq-content.js');

test('FAQ preserves the approved origin, agave, and provisional-price information', () => {
  const questions = require(contentPath).default;

  assert.equal(questions.length, 4);
  assert.equal(new Set(questions.map(({ id }) => id)).size, questions.length);
  assert.equal(questions[0].id, 'origen');
  assert.match(questions[0].answer, /Etúcuaro, Michoacán/);
  assert.match(questions[1].answer, /100% agave cupreata/);
  assert.match(questions[2].answer, /750 ml/);
  assert.match(questions[2].answer, /provisional/);
});

test('FAQ renders accessible native details and summary disclosures', () => {
  const component = readFileSync(componentPath, 'utf8');

  assert.match(component, /id="preguntas"/);
  assert.match(component, /aria-labelledby="faq-title"/);
  assert.match(component, /<details/);
  assert.match(component, /<summary/);
  assert.match(component, /<details[\s\S]*?id=\{id\}/);
  assert.match(component, /<summary[\s\S]*?\{question\}/);
});
