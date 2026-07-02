// F-14: RGPD — account deletion & data export shared contracts.

export type DataExportStatus = 'idle' | 'pending' | 'ready' | 'failed' | 'expired';
// DB stores only pending|ready|failed|expired; 'idle' is the API-only "no export yet" value.

export interface DataExportDto {
  status: DataExportStatus;
  requestedAt: string | null; // ISO
  readyAt: string | null; // ISO
  expiresAt: string | null; // ISO — archive TTL (7d)
  downloadUrl: string | null; // signed URL, only when status='ready' & not expired
  expiresIn: number | null; // signed-URL lifetime seconds
}

export interface DeleteAccountRequest {
  password: string;
}

export interface DeleteAccountResponse {
  deleted: true;
}

export const ANONYMIZED_DISPLAY_NAME = 'Utilisateur supprimé';
export const PENDING_BALANCE_MSG =
  'Solde à verser en attente — retirez vos gains avant de supprimer votre compte.';
export const DATA_EXPORT_ARCHIVE_TTL_DAYS = 7;
