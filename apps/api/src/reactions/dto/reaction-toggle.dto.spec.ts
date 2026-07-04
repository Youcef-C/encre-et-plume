import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReactionToggleDto } from './reaction-toggle.dto';

describe('ReactionToggleDto', () => {
  it.each(['work', 'chapter', 'illustration'])('accepts a valid payload for targetType %s', async (targetType) => {
    const dto = plainToInstance(ReactionToggleDto, { targetType, targetId: 'lames-de-brume' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown targetType (BA6)', async () => {
    const dto = plainToInstance(ReactionToggleDto, { targetType: 'planche', targetId: 'x' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'targetType')).toBe(true);
  });

  it('rejects an empty targetId', async () => {
    const dto = plainToInstance(ReactionToggleDto, { targetType: 'work', targetId: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'targetId')).toBe(true);
  });
});
