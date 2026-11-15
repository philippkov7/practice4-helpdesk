'use strict';
const {
  normalizeTitle,
  validateTicketInput,
  canChangeStatus,
  filterAndSort,
} = require('../../src/core');

describe('Базовые unit-тесты (дополните своими)', () => {
  test('удаляет пробелы в начале и конце темы', () => {
    expect(normalizeTitle('  Ошибка принтера  ')).toBe('Ошибка принтера');
  });

  test('отклоняет неизвестную категорию', () => {
    const errors = validateTicketInput({
      title: 'Ошибка печати', description: 'Принтер не печатает документ',
      category: 'unknown', priority: 'low'
    });
    expect(errors).toHaveProperty('category');
  });

  test('запрещает возвращение из закрытого статуса', () => {
    expect(canChangeStatus('resolved', 'new')).toBe(false);
  });

  // Добавьте самостоятельные проверки границ, переходов и сортировки.
});

test('U-01: заменяет три пробела между словами одним', () => {
  expect(normalizeTitle('Сбой   принтера')).toBe('Сбой принтера');
});

test('U-02: запрещает завершить новую заявку без этапа «В работе»', () => {
  expect(canChangeStatus('new', 'resolved')).toBe(false);
});

test.each([
  ['Сбой', true],
  ['Принт', false],
  [' Сбой ', true],
])('U-03: проверка длины темы "%s"', (title, expectedError) => {
  const errors = validateTicketInput({
    title,
    description: 'Принтер в кабинете не отвечает',
    category: 'hardware',
    priority: 'medium',
  });

  expect(Boolean(errors.title)).toBe(expectedError);
});

test('U-04: сортирует заявки от высокого приоритета к низкому', () => {
  const tickets = [
    { id: 1, priority: 'low', createdAt: '2026-10-01T09:00:00.000Z' },
    { id: 2, priority: 'high', createdAt: '2026-10-01T09:00:00.000Z' },
    { id: 3, priority: 'medium', createdAt: '2026-10-01T09:00:00.000Z' },
  ];

  const result = filterAndSort(tickets);

  expect(result.map((ticket) => ticket.id)).toEqual([2, 3, 1]);
});

test('U-05: при одинаковом приоритете новые заявки идут первыми', () => {
  const tickets = [
    { id: 1, priority: 'high', createdAt: '2026-10-01T09:00:00.000Z' },
    { id: 2, priority: 'high', createdAt: '2026-10-03T09:00:00.000Z' },
    { id: 3, priority: 'high', createdAt: '2026-10-02T09:00:00.000Z' },
  ];

  const result = filterAndSort(tickets);

  expect(result.map((ticket) => ticket.id)).toEqual([2, 3, 1]);
});

test.each([
  [79, false],
  [80, false],
  [81, true],
])('U-06: проверка темы длиной %i символов', (length, expectedError) => {
  const errors = validateTicketInput({
    title: 'А'.repeat(length),
    description: 'Принтер в кабинете не отвечает',
    category: 'hardware',
    priority: 'medium',
  });

  expect(Boolean(errors.title)).toBe(expectedError);
});

