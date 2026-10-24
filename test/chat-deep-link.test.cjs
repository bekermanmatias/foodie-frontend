const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Compile only the service under test; no framework runner or browser is required.
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const { loadLinkedConversation } = require('../components/chat/chat-deep-link-service.ts');
const { chatApi } = require('../components/chat/chat-api.ts');
const user = { role: 'client', clientId: 'restaurant-chat-client' };
const chat = { chatId: '5491112345678', clientId: user.clientId };

test('opens an exact chat directly, without depending on the first page of chats', async () => {
  let requested;
  chatApi.defaults.adapter = async config => {
    requested = config.url;
    return { config, status: 200, statusText: 'OK', headers: {}, data: { chat, messages: [] } };
  };
  const result = await loadLinkedConversation(chat.chatId, user);
  assert.equal(requested, `/chats/${chat.chatId}`); assert.equal(result.chat.chatId, chat.chatId);
});

test('rejects missing sessions, wrong chat identifiers and cross-client results', async () => {
  await assert.rejects(loadLinkedConversation(chat.chatId, null), /sesión/);
  for (const bad of [{ ...chat, clientId: 'another-restaurant' }, { ...chat, chatId: 'another-chat' }]) {
    chatApi.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { chat: bad, messages: [] } });
    await assert.rejects(loadLinkedConversation(chat.chatId, user), /no pertenece/);
  }
});

test('missing, expired and unauthorized conversations give actionable errors; retry recovers', async () => {
  for (const [status, pattern] of [[404, /disponible/], [401, /venció/], [403, /permiso/]]) {
    chatApi.defaults.adapter = async () => { throw { response: { status } }; };
    await assert.rejects(loadLinkedConversation(chat.chatId, user), pattern);
  }
  chatApi.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { chat, messages: [] } });
  assert.equal((await loadLinkedConversation(chat.chatId, user)).chat.chatId, chat.chatId);
  const controller = new AbortController(); controller.abort();
  assert.equal(await loadLinkedConversation(chat.chatId, user, controller.signal), null);
});
