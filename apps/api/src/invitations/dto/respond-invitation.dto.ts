import { IsIn } from 'class-validator';

export class RespondInvitationDto {
  @IsIn(['accepted', 'declined'], { message: 'Statut invalide (accepted ou declined attendu).' })
  status!: 'accepted' | 'declined';
}
