import { IsIn } from 'class-validator';

/** MC-4 owner close-early: the only allowed transition is open → closed. */
export class CloseCallDto {
  @IsIn(['closed'], { message: "Seul le passage à 'closed' est permis." })
  status!: 'closed';
}
