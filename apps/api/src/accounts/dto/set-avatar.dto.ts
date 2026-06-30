import { IsString, IsNotEmpty } from 'class-validator';

export class SetAvatarDto {
  @IsString()
  @IsNotEmpty()
  mediaId!: string;
}
