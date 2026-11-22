// The server-rendered pages are TSX components on a small JSX runtime (src/views/jsx.ts).
// These tests pin down its safety contract: user data is always escaped, in text and attributes.
import { test, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { newUser, pool } from './helpers.js';
import { h, raw, escapeHtml } from '../src/views/jsx.js';

describe('JSX runtime', () => {
  test('escapes text and attribute values; raw() is the only bypass', () => {
    const evil = `<img src=x onerror="alert('x')">&`;
    const html = (
      <p title={evil} data-on hidden={false}>
        {evil}
        {raw('<b>trusted</b>')}
        {null}{undefined}{false}{0}
      </p>
    ).value;
    const escaped = '&lt;img src=x onerror=&#34;alert(&#39;x&#39;)&#34;&gt;&amp;';
    assert.equal(html, `<p title="${escaped}" data-on>${escaped}<b>trusted</b>0</p>`);
    assert.equal(escapeHtml(`"'<>&`), '&#34;&#39;&lt;&gt;&amp;');
  });

  test('void elements have no closing tag; components receive children', () => {
    const Box = ({ label, children }: { label: string; children?: unknown }) => <div aria-label={label}>{children as string}</div>;
    assert.equal((<input value="a" required />).value, '<input value="a" required>');
    assert.equal((<Box label="x">inner</Box>).value, '<div aria-label="x">inner</div>');
  });
});

describe('pages escape user-supplied content', () => {
  after(() => pool.end());

  test('names and titles with HTML are shown as text, never as markup', async () => {
    const u = await newUser('<img src=x onerror=alert(1)>');
    const orgName = '<script>alert("org")</script>';
    const org = (await u.as('post', '/api/orgs').send({ name: orgName }).expect(201)).body;
    const project = (await u.as('post', `/api/orgs/${org.id}/projects`).send({ name: 'P"><svg onload=alert(2)>', budget: '10' }).expect(201)).body;
    await u.as('post', `/api/orgs/${org.id}/projects/${project.id}/tasks`).send({ title: `T" onmouseover="alert(3)` }).expect(201);

    for (const url of ['/orgs', `/orgs/${org.id}`, `/orgs/${org.id}/projects/${project.id}`, `/orgs/${org.id}/activity`]) {
      const { text } = await u.as('get', url).expect(200);
      assert.ok(!text.includes('<script>alert'), `${url}: raw <script> from the org name`);
      assert.ok(!text.includes('<svg onload'), `${url}: raw <svg> from the project name`);
      assert.ok(!text.includes('<img src=x'), `${url}: raw <img> from the user name`);
      assert.ok(!text.includes('" onmouseover="'), `${url}: attribute injection from the task title`);
      assert.ok(text.includes('&lt;script&gt;alert(&#34;org&#34;)&lt;/script&gt;'), `${url}: org name shown escaped`);
    }
  });
});
