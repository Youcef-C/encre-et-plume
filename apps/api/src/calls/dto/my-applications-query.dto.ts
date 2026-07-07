import { IsIn, IsOptional } from 'class-validator';
import type { MyApplicationsStatusFilter } from '@encre-et-plume/shared';

/**
 * GET /me/applications query validation. `status` is 400-rejected on unknown values (default 'all'
 * applied in the controller). `page` is NOT validated here — parsed leniently + clamped to ≥ 1 in
 * the controller (bad/absent page → 1, never a 400), mirroring the MC-1 partners board.
 */
export class MyApplicationsQueryDto {
  @IsOptional()
  @IsIn(['all', 'pending', 'accepted', 'rejected'])
  status?: MyApplicationsStatusFilter;
}
