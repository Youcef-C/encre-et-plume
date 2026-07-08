import { IsIn } from 'class-validator';

/** MC-7 owner decision — pending → accepted | rejected only (400 on any other value). */
export class DecideApplicationDto {
  @IsIn(['accepted', 'rejected'], { message: "Le statut doit être 'accepted' ou 'rejected'." })
  status!: 'accepted' | 'rejected';
}
