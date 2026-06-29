import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SlugService {
  constructor(private readonly prisma: PrismaService) {}

  /** Normalises a display name to a URL-safe slug. */
  slugify(name: string): string {
    // NFD decomposes "é" into "e" + combining accent; the regex strips the accent
    return name
      .normalize('NFD')
      .replace(/\p{M}/gu, '') // strip all combining marks (accents etc.)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Returns `base` if unused, otherwise appends -2, -3, … until unique.
   * Queries only rows whose slug starts with `base` to keep the scan tight.
   */
  async ensureUniqueSlug(base: string): Promise<string> {
    const existing = await this.prisma.account.findMany({
      where: { profileSlug: { startsWith: base } },
      select: { profileSlug: true },
    });
    const taken = new Set(existing.map((a) => a.profileSlug));
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  }
}
