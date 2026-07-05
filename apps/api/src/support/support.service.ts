import { Injectable, Logger } from '@nestjs/common';
import type { SupportTicketContext } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import type { CreateSupportTicketDto } from './dto/create-support-ticket.dto';

// F-21: staff inbox. Env-overridable; a safe default keeps dev/CI working without config.
const supportInbox = (): string => process.env['SUPPORT_EMAIL'] ?? 'support@encre-et-plume.fr';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Validate-and-persist a support ticket, then ENQUEUE the staff notification (F-8/F-16) —
   * the request path never touches a transport. When authenticated, bind the accountId and
   * trust the session account e-mail over the body (the FE prefills it read-only).
   */
  async create(dto: CreateSupportTicketDto, accountId?: string): Promise<void> {
    let email = dto.email;
    if (accountId) {
      const account = await this.prisma.account.findUnique({ where: { id: accountId } });
      if (account?.email) email = account.email; // session e-mail wins over body
    }

    const context = dto.context as SupportTicketContext | undefined;

    const ticket = await this.prisma.supportTicket.create({
      data: {
        category: dto.category,
        accountId,
        name: dto.name,
        email,
        message: dto.message,
        context: context ? (context as object) : undefined,
      },
    });

    await this.email.send(
      'support_ticket_received',
      supportInbox(),
      {
        ticketId: ticket.id,
        category: dto.category,
        name: dto.name,
        email,
        message: dto.message,
        contextSummary: summarizeContext(context),
      },
      { idempotencyKey: `support-ticket-${ticket.id}` },
    );

    // RGPD: id + category only — never the submitter's email/message/name.
    this.logger.log(`Support ticket created id=${ticket.id} category=${dto.category}`);
  }
}

/** Flatten the bug-report context into a single line for the staff e-mail (or '' when absent). */
function summarizeContext(ctx?: SupportTicketContext): string {
  if (!ctx) return '';
  const parts: string[] = [];
  if (ctx.url) parts.push(`url: ${ctx.url}`);
  if (ctx.userAgent) parts.push(`UA: ${ctx.userAgent}`);
  if (ctx.requestId) parts.push(`requestId: ${ctx.requestId}`);
  return parts.join(' / ');
}
