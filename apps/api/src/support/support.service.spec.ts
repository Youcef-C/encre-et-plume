/**
 * SupportService unit tests (F-21).
 * Persists the ticket, enqueues the staff notification (no inline transport), trusts the
 * session e-mail over the body when authenticated, and never logs PII (email/message/name).
 */

import { Logger } from '@nestjs/common';
import { SupportService } from './support.service';
import type { CreateSupportTicketDto } from './dto/create-support-ticket.dto';

const TICKET = { id: 'tkt-1', status: 'new' };

function makeDeps() {
  const prisma = {
    supportTicket: { create: jest.fn().mockResolvedValue(TICKET) },
    account: { findUnique: jest.fn().mockResolvedValue({ id: 'acc-1', email: 'session@real.com' }) },
  };
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  return { prisma, email };
}

const VISITOR_DTO: CreateSupportTicketDto = {
  category: 'bug',
  name: 'Yuki Moreau',
  email: 'visitor@test.com',
  message: 'La page ne charge pas.',
  context: { url: '/oeuvre/x', userAgent: 'Firefox', requestId: 'req-9' },
};

describe('SupportService', () => {
  let service: SupportService;
  let prisma: ReturnType<typeof makeDeps>['prisma'];
  let email: ReturnType<typeof makeDeps>['email'];

  beforeEach(() => {
    const deps = makeDeps();
    prisma = deps.prisma;
    email = deps.email;
    service = new SupportService(prisma as never, email as never);
  });

  it('persists a ticket with status defaulted and context stored', async () => {
    await service.create(VISITOR_DTO);

    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: 'bug',
        accountId: undefined,
        name: 'Yuki Moreau',
        email: 'visitor@test.com',
        message: 'La page ne charge pas.',
        context: { url: '/oeuvre/x', userAgent: 'Firefox', requestId: 'req-9' },
      }),
    });
  });

  it('enqueues the staff notification via EmailService.send (no inline transport) with an idempotency key', async () => {
    await service.create(VISITOR_DTO);

    expect(email.send).toHaveBeenCalledWith(
      'support_ticket_received',
      expect.any(String),
      expect.objectContaining({
        ticketId: 'tkt-1',
        category: 'bug',
        name: 'Yuki Moreau',
        email: 'visitor@test.com',
        message: 'La page ne charge pas.',
        contextSummary: expect.stringContaining('/oeuvre/x'),
      }),
      { idempotencyKey: 'support-ticket-tkt-1' },
    );
  });

  it('sends to the configured SUPPORT_EMAIL inbox', async () => {
    process.env['SUPPORT_EMAIL'] = 'inbox@encre-et-plume.fr';
    await service.create(VISITOR_DTO);
    expect(email.send).toHaveBeenCalledWith(
      'support_ticket_received',
      'inbox@encre-et-plume.fr',
      expect.anything(),
      expect.anything(),
    );
    delete process.env['SUPPORT_EMAIL'];
  });

  it('empty contextSummary when no context provided', async () => {
    const { context, ...noCtx } = VISITOR_DTO;
    void context;
    await service.create(noCtx);

    const data = email.send.mock.calls[0]?.[2] as { contextSummary: string };
    expect(data.contextSummary).toBe('');
  });

  it('when authenticated: binds accountId and overrides body email with the session account email', async () => {
    await service.create(VISITOR_DTO, 'acc-1');

    expect(prisma.account.findUnique).toHaveBeenCalledWith({ where: { id: 'acc-1' } });
    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc-1',
        email: 'session@real.com', // session e-mail trusted over body
        name: 'Yuki Moreau', // name stays as submitted
      }),
    });
  });

  it('RGPD: never logs the submitter email, message, or name', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    await service.create(VISITOR_DTO);

    const logged = [...logSpy.mock.calls, ...debugSpy.mock.calls].flat().join(' ');
    expect(logged).not.toContain('visitor@test.com');
    expect(logged).not.toContain('La page ne charge pas.');
    expect(logged).not.toContain('Yuki Moreau');

    logSpy.mockRestore();
    debugSpy.mockRestore();
  });
});
