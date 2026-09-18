import test from 'node:test';
import assert from 'node:assert/strict';
import {hmacSha256Hex, safeEqualText, verifyIkhokhaWebhookSignature, verifyWebhookSignature} from '../src/index.js';

test('HMAC helper produces the expected SHA-256 digest', () => {
  assert.equal(
    hmacSha256Hex('secret', 'payload'),
    'b82fcb791acec57859b989b430a826488ce2e479fdf92326bd0a2e8375a42ba4'
  );
});

test('safeEqualText rejects different lengths without throwing', () => {
  assert.equal(safeEqualText('abc', 'abc'), true);
  assert.equal(safeEqualText('abc', 'abcd'), false);
});

test('iKhokha webhook signature verifies path plus body', () => {
  const path = '/public-api/v1/api/payment';
  const body = '{"status":"SUCCESS"}';
  const signature = hmacSha256Hex('secret', path + body);
  assert.equal(
    verifyIkhokhaWebhookSignature({rawBody:body,path,signature,appSecret:'secret'}),
    true
  );
  assert.equal(
    verifyIkhokhaWebhookSignature({rawBody:body,path,signature:'bad',appSecret:'secret'}),
    false
  );
});

test('generic webhook verifier supports a signature prefix', () => {
  const signature = hmacSha256Hex('secret', 'body');
  assert.equal(
    verifyWebhookSignature({rawBody:'body',signature:'sha256=' + signature,secret:'secret',prefix:'sha256='}),
    true
  );
});
