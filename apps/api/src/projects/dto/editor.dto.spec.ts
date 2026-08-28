import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AutosaveDocumentDto, CreateCaseCommentDto } from './editor.dto';

// CS-22 — the relative Yjs anchors are opaque base64 at the trust boundary: shape + length only,
// never decoded here (nor anywhere in the API).
describe('CreateCaseCommentDto — CS-22 relative anchors', () => {
  const base = { text: 'À revoir', anchorFrom: 3, anchorTo: 9, quote: 'sous la pluie' };

  it('accepts a payload with base64 relative anchors', async () => {
    const dto = plainToInstance(CreateCaseCommentDto, { ...base, anchorRelFrom: 'AQIDBA==', anchorRelTo: 'BQYHCA==' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a payload without them (pre-CS-22 client)', async () => {
    const dto = plainToInstance(CreateCaseCommentDto, base);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-base64 anchor', async () => {
    const dto = plainToInstance(CreateCaseCommentDto, { ...base, anchorRelFrom: 'not base64 !!' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'anchorRelFrom')).toBe(true);
  });

  it('rejects an over-long anchor (> 512 decoded bytes)', async () => {
    const dto = plainToInstance(CreateCaseCommentDto, { ...base, anchorRelTo: Buffer.alloc(1024).toString('base64') });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'anchorRelTo')).toBe(true);
  });
});

// CS-21 (round 2) — `ydocState` is base64 at the trust boundary, same answer as CS-22's anchors.
// Without this the string reaches `Buffer.from(…, 'base64')`, which turns junk into junk bytes
// silently, and the compaction merge then throws on the app's highest-frequency write path.
describe('AutosaveDocumentDto — CS-21 ydocState', () => {
  const base = { contentJson: { type: 'doc', content: [] }, html: '<p>x</p>' };

  it('accepts a base64 ydocState', async () => {
    const dto = plainToInstance(AutosaveDocumentDto, { ...base, ydocState: 'AQIDBA==' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-base64 ydocState', async () => {
    const dto = plainToInstance(AutosaveDocumentDto, { ...base, ydocState: 'not base64 !!' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'ydocState')).toBe(true);
  });
});
