/**
 * Payload de cada job en la queue wapi-send. Solo IDs — el worker reconstruye
 * TenantContext y carga via prisma.scoped.
 */
export interface WapiSendJob {
  reportId: string;
  organizationId: string;
  teamId: string;
}

export const WAPI_QUEUE_NAME = 'wapi-send';
