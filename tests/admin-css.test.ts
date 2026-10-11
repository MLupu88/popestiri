import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('admin stylesheet keeps core layout and Social Intake styles', async () => {
  const css = await readFile(new URL('../apps/web/public/admin.css', import.meta.url), 'utf8');
  for (const selector of [':root{', '.login-card{', '.workspace{', '.sidebar{', '.page{', '.masthead img{', '.social-form,', '.social-grid{']) {
    assert.ok(css.includes(selector), `Missing CSS selector ${selector}`);
  }
  assert.match(css,/\.discovery-list\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.ok(css.includes('.discovery-members{'));
});
