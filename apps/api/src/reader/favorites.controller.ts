import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { FavoriteWorkDto } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { FavoritesService } from './favorites.service';

/** GET /me/favorites — authenticated; "★ MES FAVORIS" quick-switch (DR-4). */
@Controller('me/favorites')
@UseGuards(SessionGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  getFavorites(@Req() req: AuthRequest): Promise<FavoriteWorkDto[]> {
    return this.favoritesService.getFavorites(req.accountId);
  }
}
