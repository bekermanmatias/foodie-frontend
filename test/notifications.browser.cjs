// Run against a local production build. All API requests are intercepted with fixtures.
const { chromium } = require(process.env.FOODIE39_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const base = process.env.FOODIE39_FRONTEND_URL || 'http://localhost:3019';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const user = { sub: 'host1', scope: 'restaurant', role: 'host', fullName: 'Recepción', restaurantId: 'r1', email: 'host@test.local' };
      const chatUser = { name: 'Recepción', role: 'client', clientId: 'channel1' };
      const chat = { chatId: '5491112345678', clientId: 'channel1', phoneNumber: '5491112345678', contactName: 'Cliente de prueba', lastMessage: 'Quiero pedir comida', lastMessageTimestamp: '2026-10-23T21:00:00Z', unreadCount: 1, chatStatus: 'human', tags: [] };
      let read = false, attended = false, readCalls = 0, attendCalls = 0, countCalls = 0, chatMissing = false;
      await page.addInitScript(({ user, chatUser }) => {
        localStorage.setItem('foodie_token', 'test-only'); localStorage.setItem('foodie_user', JSON.stringify(user));
        localStorage.setItem('foodie_user_name', user.fullName); localStorage.setItem('auth_token', 'test-chat-only');
        localStorage.setItem('user_data', JSON.stringify(chatUser));
      }, { user, chatUser });
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
        const json = (body, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
        if (request.method() === 'OPTIONS') return json({});
        if (url.pathname.endsWith('/restaurant/bootstrap')) return json({ id: 'r1', name: 'Foodie Prueba', branches: [] });
        if (url.pathname.endsWith('/restaurant/notifications/counts')) { countCalls++; return json({ unread: attended || read ? 0 : 1, pending: attended ? 0 : 1 }); }
        if (url.pathname.endsWith('/n1/read')) { read = true; readCalls++; return json({}); }
        if (url.pathname.endsWith('/n1/attend')) { attended = true; attendCalls++; return json({ attended: true }); }
        if (url.pathname.endsWith('/restaurant/notifications')) {
          const status = attended ? 'attended' : 'pending';
          const items = url.searchParams.has('status') && url.searchParams.get('status') !== status ? [] : [{
            id: 'n1', type: 'chat_order', status, chatId: chat.chatId, channelId: 'channel1',
            contactName: chat.contactName, contactPhone: chat.phoneNumber, orderMode: 'delivery',
            summary: 'El cliente quiere realizar un pedido de dos hamburguesas para entrega.', occurredAt: '2026-10-23T21:00:00Z',
            readAt: read ? '2026-10-23T21:01:00Z' : null, attendedAt: attended ? '2026-10-23T21:02:00Z' : null,
            attendedBy: attended ? { fullName: 'Recepción' } : null
          }];
          return json({ items, total: items.length, page: 1, pageSize: 25 });
        }
        if (url.pathname === '/api/auth') return json(chatUser);
        if (url.pathname === '/api/chats') return json([]); // The linked conversation is outside the first page.
        if (url.pathname === `/api/chats/${chat.chatId}`) return chatMissing ? json({ message: 'Not found' }, 404) : json({ chat, messages: [{ id: 'm1', chatId: chat.chatId, sender: 'user', content: 'Quiero pedir comida', timestamp: '2026-10-23T21:00:00Z', status: 'received' }] });
        if (url.pathname === '/api/tags') return json({ tags: [] });
        if (url.pathname.includes('/restaurant/')) return json([]);
        if (url.origin !== base) return route.abort(); // No requests reach external services.
        return route.continue();
      });

      await page.goto(`${base}/notificaciones`);
      await page.getByRole('heading', { name: 'Notificaciones', exact: true }).waitFor();
      await page.getByRole('article').waitFor();
      await page.getByRole('link', { name: /Notificaciones: 1 sin leer/ }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(os.tmpdir(), `foodie39-notifications-${viewport.width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Marcar leída' }).click();
      await page.getByRole('link', { name: /Notificaciones: 0 sin leer/ }).waitFor();
      assert.equal(readCalls, 1); assert.equal(attendCalls, 0);
      await page.getByRole('button', { name: 'Abrir chat', exact: true }).click();
      await page.waitForURL(`**/chat?chatId=${chat.chatId}`);
      await page.locator('.chat-messages').waitFor({ state: 'visible' });
      await page.getByText('Quiero pedir comida', { exact: true }).last().waitFor();
      if (viewport.width < 1024) assert(!(await page.locator('.chat-inbox').isVisible()));
      assert.equal(attendCalls, 0);
      await page.screenshot({ path: path.join(os.tmpdir(), `foodie39-chat-${viewport.width}.png`), fullPage: true });

      chatMissing = true;
      await page.goto(`${base}/chat?chatId=${chat.chatId}`);
      await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
      assert.equal(attendCalls, 0);
      chatMissing = false;
      await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
      await page.locator('.chat-messages').waitFor({ state: 'visible' });
      await page.goto(`${base}/notificaciones`);
      await page.getByRole('button', { name: 'Marcar atendida' }).click();
      await page.getByText('No hay notificaciones en esta vista.').waitFor();
      assert.equal(attendCalls, 1);
      await page.getByRole('combobox').selectOption('attended');
      await page.getByText(/Atendida por Recepción/).waitFor();
      const before = countCalls;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForFunction(() => true);
      await new Promise(resolve => setTimeout(resolve, 300));
      assert(countCalls > before);
      assert.deepEqual(errors, []);
      console.log(`Browser checks passed at ${viewport.width}px`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
