/**
 * Subset de los campos SNS que nos importan. SNS publica por HTTPS un payload JSON
 * con `Type` indicando si es SubscriptionConfirmation o Notification (también
 * UnsubscribeConfirmation, que tratamos igual que SubscriptionConfirmation).
 */
export interface SnsMessage {
  Type: 'SubscriptionConfirmation' | 'Notification' | 'UnsubscribeConfirmation';
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Subject?: string;
}

/**
 * Notification SES a través de SNS. SES publica el evento con `eventType` (string,
 * MAYÚSCULAS) y un objeto por tipo de evento con detalles.
 */
export interface SesEventNotification {
  eventType: 'Bounce' | 'Complaint' | 'Delivery' | 'Open' | 'Click' | string;
  mail: {
    messageId: string;
    destination: string[];
    tags?: Record<string, string[]>;
  };
  bounce?: {
    bounceType: 'Permanent' | 'Transient' | 'Undetermined';
    bounceSubType?: string;
    bouncedRecipients: Array<{ emailAddress: string; status?: string; diagnosticCode?: string }>;
    timestamp: string;
  };
  complaint?: {
    complainedRecipients: Array<{ emailAddress: string }>;
    timestamp: string;
    complaintFeedbackType?: string;
  };
  delivery?: { timestamp: string; recipients: string[] };
  open?: { timestamp: string; ipAddress?: string; userAgent?: string };
  click?: { timestamp: string; link: string; ipAddress?: string; userAgent?: string };
}
