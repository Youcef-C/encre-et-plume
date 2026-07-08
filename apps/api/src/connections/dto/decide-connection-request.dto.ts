import { IsIn } from 'class-validator';

/** MC-8 recipient decision — pending → accepted | declined only (400 on any other value). */
export class DecideConnectionRequestDto {
  @IsIn(['accepted', 'declined'], { message: "Le statut doit être 'accepted' ou 'declined'." })
  status!: 'accepted' | 'declined';
}
