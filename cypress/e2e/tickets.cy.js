import { TicketsPage } from '../pages/TicketsPage';
import { TicketForm } from '../pages/TicketForm';

const page = new TicketsPage();
const form = new TicketForm();

describe('HelpDesk — E2E-проверки', () => {
  beforeEach(() => {
    cy.request('POST', '/api/__reset');
  });

  it('показывает исходные заявки', () => {
    page.open();

    cy.get('[data-testid="page-title"]').should('contain', 'HelpDesk');
    page.items().should('have.length', 4);
    page.count().should('have.text', '4');
  });

  it('E-01: создаёт заявку через форму и показывает её в списке', () => {
    page.open();
    page.items().should('have.length', 4);

    form.fill({
      title: 'Сбой учебного принтера',
      description: 'Принтер в аудитории 205 не печатает документы',
      category: 'hardware',
      priority: 'high',
    });

    form.submit();

    form.message().should('contain', 'Заявка №5 создана');
    page.items().should('have.length', 5);
    page.count().should('have.text', '5');

    page.items()
      .filter('[data-id="5"]')
      .should('have.length', 1)
      .within(() => {
        cy.get('.ticket-title')
          .should('have.text', 'Сбой учебного принтера');

        cy.get('.ticket-description').should(
          'have.text',
          'Принтер в аудитории 205 не печатает документы'
        );

        cy.get('.ticket-meta')
          .should('contain', 'Оборудование')
          .and('contain', 'Высокий')
          .and('contain', 'Новая');
      });
  });

  it('E-02: ищет заявку с учётом статуса и категории', () => {
    cy.intercept('GET', '/api/tickets*', (request) => {
      if (request.query.search === 'vpn') {
        request.alias = 'searchVpn';
      }

      if (request.query.search === 'несуществующая заявка') {
        request.alias = 'searchMissing';
      }
    });

    page.open();
    page.items().should('have.length', 4);

    page.setCategory('network');
    page.items().should('have.length', 2);

    page.setStatus('new');
    page.items().should('have.length', 1);

    page.searchFor('vpn');
    cy.wait('@searchVpn').its('response.statusCode').should('eq', 200);

    page.count().should('have.text', '1');

    page.items()
      .should('have.length', 1)
      .within(() => {
        cy.get('.ticket-title').should('have.text', 'VPN недоступен');

        cy.get('.ticket-meta')
          .should('contain', 'Сеть')
          .and('contain', 'Новая');
      });

    page.searchFor('несуществующая заявка');
    cy.wait('@searchMissing').its('response.statusCode').should('eq', 200);

    page.count().should('have.text', '0');
    page.items().should('not.exist');

    cy.contains('Заявок по заданным условиям нет.').should('be.visible');
  });
  it('E-03: переводит новую заявку в работу и завершает её', () => {
    page.open();
    page.items().should('have.length', 4);

    // Выбираем исходную заявку №1 «VPN недоступен»
    page.items()
      .filter('[data-id="1"]')
      .find('.ticket-meta')
      .should('contain', 'Новая');

    page.items()
      .filter('[data-id="1"]')
      .contains('button', 'В работу')
      .click();

    // После обновления списка заново находим заявку
    page.items()
      .filter('[data-id="1"]')
      .find('.ticket-meta')
      .should('contain', 'В работе');

    page.items()
      .filter('[data-id="1"]')
      .contains('button', 'Завершить')
      .click();

    page.items()
      .filter('[data-id="1"]')
      .find('.ticket-meta')
      .should('contain', 'Завершена');

    page.items()
      .filter('[data-id="1"]')
      .find('button')
      .should('not.exist');

    // Проверяем, что статус сохранился после перезагрузки
    page.open();

    page.items()
      .filter('[data-id="1"]')
      .find('.ticket-meta')
      .should('contain', 'Завершена');
  });
  it('E-04: показывает HTML-разметку в заявке обычным текстом', () => {
    page.open();
    page.items().should('have.length', 4);

    form.fill({
      title: '<b>Сбой принтера</b>',
      description: '<i>Принтер в аудитории не отвечает</i>',
      category: 'hardware',
      priority: 'medium',
    });

    form.submit();

    form.message().should('contain', 'Заявка №5 создана');
    page.items().should('have.length', 5);

    page.items()
      .filter('[data-id="5"]')
      .should('have.length', 1)
      .within(() => {
        cy.get('.ticket-title')
          .should('have.text', '<b>Сбой принтера</b>');

        cy.get('.ticket-description')
          .should('have.text', '<i>Принтер в аудитории не отвечает</i>');

        cy.get('.ticket-title b').should('not.exist');
        cy.get('.ticket-description i').should('not.exist');
      });
  });
  it('E-05: фильтрует по приоритету вместе с другими условиями', () => {
    cy.intercept('GET', '/api/tickets*', (request) => {
      if (request.query.search === 'vpn') {
        request.alias = 'prioritySearch';
      }
    });

    page.open();
    page.items().should('have.length', 4);

    page.setPriority('high');
    page.items().should('have.length', 2);
    page.count().should('have.text', '2');

    page.items().each(($item) => {
      cy.wrap($item).find('.ticket-meta').should('contain', 'Высокий');
    });

    page.setStatus('new');
    page.items().should('have.length', 1);

    page.setCategory('network');
    page.searchFor('vpn');
    cy.wait('@prioritySearch').its('response.statusCode').should('eq', 200);

    page.count().should('have.text', '1');
    page.items()
      .should('have.length', 1)
      .find('.ticket-title')
      .should('have.text', 'VPN недоступен');

    // У подходящей заявки высокий приоритет, поэтому low даст пустой список
    page.setPriority('low');

    page.count().should('have.text', '0');
    page.items().should('not.exist');
  });
});