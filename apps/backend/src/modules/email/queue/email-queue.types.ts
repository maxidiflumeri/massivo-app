/**
 * Payload que viaja en cada job de la queue email-send.
 * Contiene SOLO ids — el worker reconstruye TenantContext y carga via prisma.scoped.
 * No incluir HTML/datos personales acá: el job se persiste en Redis.
 */
export interface EmailSendJob {
  reportId: string;
  organizationId: string;
  teamId: string;
}

export const EMAIL_QUEUE_NAME = 'email-send';
