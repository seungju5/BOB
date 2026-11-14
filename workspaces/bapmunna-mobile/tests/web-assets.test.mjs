import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { assertRootAssetPaths, isAllowedWebAsset, protectHtml } from '../scripts/web-assets.mjs';

test('packaging preserves original UI and permits only its exact inline bootstrap script', () => {
  const script = 'self.__next_f.push([1,"existing app"]);';
  const html = `<html><head><script>${script}</script><script src="/_next/static/app.js"></script></head><body><main>기존 밥뭇나 화면</main></body></html>`;
  const protectedHtml = protectHtml(html);
  assert.ok(protectedHtml.includes(`<main>기존 밥뭇나 화면</main>`));
  assert.ok(protectedHtml.includes(`<script>${script}</script>`));
  assert.ok(protectedHtml.includes(`sha256-${createHash('sha256').update(script).digest('base64')}`));
  assert.match(protectedHtml, /script-src 'self' 'sha256-/);
  assert.doesNotMatch(protectedHtml, /script-src[^;]*'unsafe-inline'/);
  assert.match(protectedHtml, /frame-src 'none'/);
});

test('packaging rejects remote code and framed content before copying', () => {
  for (const fragment of [
    '<script src="https://example.org/remote.js"></script>',
    '<script src="//example.org/remote.js"></script>',
    '<script src=https://example.org/remote.js></script>',
    '<iframe src="https://example.org"></iframe>',
    '<object data="anything"></object>', '<base href="https://example.org">',
  ]) assert.throws(() => protectHtml(`<html><head>${fragment}</head><body></body></html>`));
  assert.throws(() => protectHtml('<html><body>incomplete export</body></html>'));
});

test('only route exports, compiled static assets, and existing public files are packaged', () => {
  const publicFiles = new Set(['brand/bunny.png', 'icon.svg']);
  for (const valid of ['index.html', 's/index.html', 'auth/callback/index.html', 's/index.txt', '__next._tree.txt', '_next/static/chunks/a.js', 'brand/bunny.png']) {
    assert.equal(isAllowedWebAsset(valid, publicFiles), true, valid);
  }
  for (const privateFile of ['.env', '.env.local', 'server/app/index.html', 'trace', 'package.json', 'node_modules/secret.js', '_next/server/app.js', '_next/static/a.js.map', 'README.txt', 's/.env', '../index.html']) {
    assert.equal(isAllowedWebAsset(privateFile, publicFiles), false, privateFile);
  }
});

test('all hosted base-path variants are rejected while correctly resolved local assets remain valid', () => {
  for (const prefix of ['/bapmunna', '/bapmunna/app', '/other/product', '/x%2Fy']) {
    assert.throws(() => protectHtml(`<html><head><script src="${prefix}/_next/static/app.js"></script></head></html>`), /root-relative/);
  }
  assert.throws(() => assertRootAssetPaths('<link href="https://remote.example/_next/static/app.css">'), /root-relative/);
  assert.doesNotThrow(() => assertRootAssetPaths('<script src="/_next/static/app.js"></script>', 's/index.html'));
  assert.doesNotThrow(() => assertRootAssetPaths('<link href="../_next/static/app.css">', 's/index.html'));
  assert.doesNotThrow(() => assertRootAssetPaths('<script src="./_next/static/app.js"></script>', 'index.html'));
  assert.throws(() => assertRootAssetPaths('<script src="./_next/static/app.js"></script>', 's/index.html'), /root-relative/);
});
