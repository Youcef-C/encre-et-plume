// QA regression (CS-3): RequestUploadDto's class-validator @IsIn(...) allowlist for `contentType`
// only unions UPLOAD_ALLOWED_CONTENT_TYPES + DOCUMENT_ALLOWED_CONTENT_TYPES — it was never extended
// with the CS-3 asset-only types (DOCX_CONTENT_TYPE, PSD_CONTENT_TYPE). Nest's global ValidationPipe
// runs this DTO BEFORE MediaService.requestUpload ever executes, so every `.docx`/`.psd` asset
// upload 400s at the HTTP boundary with "contentType must be one of the following values: …" —
// discovered via the real POST /media/uploads request (cs3-fichiers.spec.ts CS3-E2), NOT by
// media.service.spec.ts's "accepts docx/psd… for the asset kind" unit test, which calls
// MediaService.requestUpload() directly and so never exercises this DTO/ValidationPipe layer.
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DOCX_CONTENT_TYPE, PSD_CONTENT_TYPE } from '@encre-et-plume/shared';
import { RequestUploadDto } from './request-upload.dto';

async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(RequestUploadDto, body);
  const errors = await validate(dto, { whitelist: true });
  return errors.map((e) => e.property);
}

describe('RequestUploadDto — CS-3 asset content types', () => {
  it('accepts kind:"asset" + DOCX_CONTENT_TYPE (currently rejected — CS-3 docx import is broken end-to-end)', async () => {
    expect(
      await errorsFor({ kind: 'asset', contentType: DOCX_CONTENT_TYPE, size: 1024 }),
    ).toEqual([]);
  });

  it('accepts kind:"asset" + PSD_CONTENT_TYPE (currently rejected — CS-3 psd import is broken end-to-end)', async () => {
    expect(
      await errorsFor({ kind: 'asset', contentType: PSD_CONTENT_TYPE, size: 1024 }),
    ).toEqual([]);
  });
});
