import { Injectable } from '@nestjs/common';
import type { FavoriteWorkDto } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WORK_META_INCLUDE, workMeta } from '../works/work-meta';

/**
 * DR-4 favorites switcher — reads only. DR-9 owns the toggle write path + Work.favoriteCount
 * maintenance; this service only lists the account's existing Favorite rows.
 */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async getFavorites(accountId: string): Promise<FavoriteWorkDto[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      include: { work: { include: WORK_META_INCLUDE } },
    });

    return rows.map((r) => ({
      slug: r.work.slug,
      title: r.work.title,
      cover: r.work.coverImage,
      meta: workMeta(r.work),
    }));
  }
}
