import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { CollectionDetail, CollectionsListResponse, CollectionSummary } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { CollectionsService } from './collections.service';
import { parseCollectionsListQuery } from '../gallery/parse-gallery-query';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { AddCollectionIllustrationDto, ReorderCollectionDto } from './dto/collection-membership.dto';

/**
 * DR-12 illustration collections. Public read of a collection; every mutation requires a session +
 * the creator role (asserted in the service) + ownership. `/mine` is declared before `/:id` so the
 * static route isn't shadowed by the param route (NestJS matches in declaration order).
 */
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  // BE-6: public, paginated Galerie "Collections" facet. Empty path — no collision with `mine`/`:id`.
  @Get()
  list(@Query() query: Record<string, unknown>): Promise<CollectionsListResponse> {
    return this.collections.findCollections(parseCollectionsListQuery(query));
  }

  @Post()
  @UseGuards(SessionGuard)
  create(@Req() req: AuthRequest, @Body() dto: CreateCollectionDto): Promise<CollectionSummary> {
    return this.collections.create(req.accountId, dto);
  }

  @Get('mine')
  @UseGuards(SessionGuard)
  async getMine(@Req() req: AuthRequest): Promise<CollectionSummary[]> {
    await this.collections.assertCreator(req.accountId);
    return this.collections.getMine(req.accountId);
  }

  @Get(':id')
  @UseGuards(OptionalSessionGuard)
  async getById(@Param('id') id: string, @Req() req: AuthRequest): Promise<CollectionDetail> {
    const detail = await this.collections.getById(id, req.accountId);
    if (!detail) throw new NotFoundException('Collection introuvable');
    return detail;
  }

  @Patch(':id')
  @UseGuards(SessionGuard)
  update(@Param('id') id: string, @Req() req: AuthRequest, @Body() dto: UpdateCollectionDto): Promise<CollectionDetail> {
    return this.collections.update(req.accountId, id, dto);
  }

  @Delete(':id')
  @UseGuards(SessionGuard)
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: AuthRequest): Promise<void> {
    return this.collections.remove(req.accountId, id);
  }

  @Post(':id/illustrations')
  @UseGuards(SessionGuard)
  addIllustration(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() dto: AddCollectionIllustrationDto,
  ): Promise<CollectionDetail> {
    return this.collections.addIllustration(req.accountId, id, dto.illustrationId);
  }

  @Delete(':id/illustrations/:illustrationId')
  @UseGuards(SessionGuard)
  @HttpCode(204)
  removeIllustration(
    @Param('id') id: string,
    @Param('illustrationId') illustrationId: string,
    @Req() req: AuthRequest,
  ): Promise<void> {
    return this.collections.removeIllustration(req.accountId, id, illustrationId);
  }

  @Patch(':id/order')
  @UseGuards(SessionGuard)
  reorder(@Param('id') id: string, @Req() req: AuthRequest, @Body() dto: ReorderCollectionDto): Promise<CollectionDetail> {
    return this.collections.reorder(req.accountId, id, dto.illustrationIds);
  }
}
