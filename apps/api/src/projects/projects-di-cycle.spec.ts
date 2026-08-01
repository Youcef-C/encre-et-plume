import 'reflect-metadata';
// Regression guard for the CS-5 r3 P0: a CommonJS circular require
// (assets.service → corrections.service → scenario-documents.service → assets.service) left
// AssetsService `undefined` when it was baked into ScenarioDocumentsService's `design:paramtypes`,
// so Nest DI injected undefined and the app failed to boot. Importing ProjectsModule first forces the
// real controller/service load order (assets.controller is registered before the scenario/correction
// ones), reproducing the cycle exactly as `node dist/main.js` does.
import './projects.module';
import { ScenarioDocumentsService } from './scenario-documents.service';
import { CorrectionsService } from './corrections.service';
import { ChaptersService } from './chapters.service';

describe('ProjectsModule DI wiring (no circular-require holes)', () => {
  it('ScenarioDocumentsService constructor paramtypes have no undefined entry', () => {
    const params = Reflect.getMetadata('design:paramtypes', ScenarioDocumentsService) as unknown[];
    expect(params).toBeDefined();
    expect(params).not.toContain(undefined);
  });

  it('CorrectionsService constructor paramtypes have no undefined entry', () => {
    const params = Reflect.getMetadata('design:paramtypes', CorrectionsService) as unknown[];
    expect(params).toBeDefined();
    expect(params).not.toContain(undefined);
  });

  // CS-7 R6-1b: the chapter strip's thumbnails go through AssetsService, adding a
  // chapters → assets → corrections edge. Same guard, so that edge can never go undefined either.
  it('ChaptersService constructor paramtypes have no undefined entry', () => {
    const params = Reflect.getMetadata('design:paramtypes', ChaptersService) as unknown[];
    expect(params).toBeDefined();
    expect(params).not.toContain(undefined);
  });
});
