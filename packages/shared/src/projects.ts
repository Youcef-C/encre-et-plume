// CS-1 seam — minimal project contract so MC-3's invite picker + ownership validation work.
// CS-1 extends this (never renames): adds creation, workspace, collaborators.

export interface ProjectSummary {
  id: string;
  title: string;
  /** Server-composed meta line, e.g. "Manga · Seinen · en cours". */
  meta: string;
  /** Cover image URL; null -> FE halftone placeholder. */
  cover: string | null;
}

export interface MyProjectsResponse {
  items: ProjectSummary[];
}
