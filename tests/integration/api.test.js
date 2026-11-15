'use strict';
const { createApp } = require('../../src/app');

let server;
let base;

beforeEach(async () => {
  server = createApp({ seed: [] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /api/health отвечает HTTP 200', async () => {
  const response = await fetch(`${base}/api/health`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

test('POST /api/tickets создает корректную заявку', async () => {
  const response = await fetch(`${base}/api/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Сбой принтера', description: 'Принтер в аудитории не отвечает',
      category: 'hardware', priority: 'medium'
    })
  });
  const body = await response.json();
  expect(response.status).toBe(201);
  expect(body.ticket.id).toBe(1);
  expect(body.ticket.status).toBe('new');
});

// Добавьте проверки GET с фильтрами, некорректных запросов,
// запретных переходов статуса и последовательных запросов к API.

test('I-01: созданная заявка появляется в списке с правильными данными', async () => {
  // Подготовка данных
  const input = {
    title: 'Сбой принтера',
    description: 'Принтер в аудитории не отвечает',
    category: 'hardware',
    priority: 'high',
  };

  // Создание заявки
  const createResponse = await fetch(`${base}/api/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  expect(createResponse.status).toBe(201);
  const created = await createResponse.json();

  expect(created.ticket).toMatchObject({
    ...input,
    status: 'new',
  });
  expect(created.ticket.id).toEqual(expect.any(Number));
  expect(created.ticket.createdAt).toEqual(expect.any(String));

  // Чтение списка и проверка сохранённой заявки
  const listResponse = await fetch(`${base}/api/tickets`);

  expect(listResponse.status).toBe(200);
  const list = await listResponse.json();

  expect(list.total).toBe(1);
  expect(list.items).toEqual([created.ticket]);
});

test('I-02: ошибка валидации не изменяет список заявок', async () => {
  // Состояние до запроса
  const beforeResponse = await fetch(`${base}/api/tickets`);
  expect(beforeResponse.status).toBe(200);
  const before = await beforeResponse.json();

  // Отправка некорректной заявки
  const response = await fetch(`${base}/api/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Сбой',
      description: 'Принтер в аудитории не отвечает',
      category: 'hardware',
      priority: 'medium',
    }),
  });

  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.errors.title).toBe('Тема должна содержать от 5 до 80 символов');

  // Состояние после отклонённого запроса
  const afterResponse = await fetch(`${base}/api/tickets`);
  expect(afterResponse.status).toBe(200);
  const after = await afterResponse.json();

  expect(after.total).toBe(before.total);
  expect(after.items).toEqual(before.items);
});

test('I-03: поиск, статус и категория работают одновременно', async () => {
  const inputs = [
    { title: 'Сбой VPN', category: 'network' },
    { title: 'Ошибка VPN', category: 'software' },
    { title: 'Настройка VPN', category: 'network' },
    { title: 'Сбой сети', category: 'network' },
  ];

  const tickets = [];

  for (const input of inputs) {
    const response = await fetch(`${base}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...input,
        description: 'Не удается подключиться к учебной сети',
        priority: 'medium',
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    tickets.push(body.ticket);
  }

  // Третью заявку переводим в работу
  const statusResponse = await fetch(
    `${base}/api/tickets/${tickets[2].id}/status`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    }
  );
  expect(statusResponse.status).toBe(200);

  // Ищем "vpn" с пробелами по краям
  const query = new URLSearchParams({
    search: ' vpn ',
    status: 'new',
    category: 'network',
  });

  const response = await fetch(`${base}/api/tickets?${query}`);
  expect(response.status).toBe(200);
  const result = await response.json();

  expect(result.total).toBe(1);
  expect(result.items).toEqual([tickets[0]]);
});

test('I-04: запрещённый переход возвращает 409 и сохраняет статус', async () => {
  // Создание новой заявки
  const createResponse = await fetch(`${base}/api/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Сбой принтера',
      description: 'Принтер в аудитории не отвечает',
      category: 'hardware',
      priority: 'medium',
    }),
  });

  expect(createResponse.status).toBe(201);
  const { ticket } = await createResponse.json();

  // Попытка сразу завершить новую заявку
  const response = await fetch(
    `${base}/api/tickets/${ticket.id}/status`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    }
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: 'Недопустимый переход',
  });

  // Проверка состояния после отклонённого перехода
  const listResponse = await fetch(`${base}/api/tickets`);
  expect(listResponse.status).toBe(200);
  const list = await listResponse.json();

  expect(list.total).toBe(1);
  expect(list.items).toEqual([ticket]);
  expect(list.items[0].status).toBe('new');
});

test('I-05: API сортирует заявки по приоритету и дате', async () => {
  const seed = [
    { id: 1, priority: 'low', createdAt: '2026-10-04T09:00:00.000Z' },
    { id: 2, priority: 'high', createdAt: '2026-10-01T09:00:00.000Z' },
    { id: 3, priority: 'medium', createdAt: '2026-10-03T09:00:00.000Z' },
    { id: 4, priority: 'high', createdAt: '2026-10-02T09:00:00.000Z' },
  ].map((ticket) => ({
    ...ticket,
    title: `Заявка номер ${ticket.id}`,
    description: 'Принтер в аудитории не отвечает',
    category: 'hardware',
    status: 'new',
  }));

  // Для этой проверки запускаем сервер с заданными датами заявок
  await new Promise((resolve) => server.close(resolve));
  server = createApp({ seed });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${base}/api/tickets`);

  expect(response.status).toBe(200);
  const result = await response.json();

  expect(result.total).toBe(4);
  expect(result.items).toEqual([
    seed[3],
    seed[1],
    seed[2],
    seed[0],
  ]);
});

test('TDD-01: фильтр priority=high возвращает только важные заявки', async () => {
  const tickets = [];

  for (const priority of ['low', 'high', 'medium']) {
    const response = await fetch(`${base}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: `Заявка с приоритетом ${priority}`,
        description: 'Принтер в аудитории не отвечает',
        category: 'hardware',
        priority,
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    tickets.push(body.ticket);
  }

  const response = await fetch(`${base}/api/tickets?priority=high`);

  expect(response.status).toBe(200);
  const result = await response.json();

  expect(result.total).toBe(1);
  expect(result.items).toEqual([tickets[1]]);
});