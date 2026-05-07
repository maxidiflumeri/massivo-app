export interface Contact {
  id: string;
  organizationId: string;
  teamId: string | null;
  externalId: string | null;
  dni: string | null;
  cuit: string | null;
  email: string | null;
  phone: string | null;
  phoneE164: string | null;
  firstName: string | null;
  lastName: string | null;
  attributes: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ContactPage {
  items: Contact[];
  nextCursor: string | null;
}

export interface SearchFilters {
  q: string;
  tags: string[];
  channel: '' | 'email' | 'wapi';
  hasOpened: boolean;
  hasClicked: boolean;
  hasBounced: boolean;
  sort: 'updatedAt' | 'createdAt' | 'name';
  direction: 'asc' | 'desc';
}

export const EMPTY_SEARCH_FILTERS: SearchFilters = {
  q: '',
  tags: [],
  channel: '',
  hasOpened: false,
  hasClicked: false,
  hasBounced: false,
  sort: 'updatedAt',
  direction: 'desc',
};

export interface MergeSuggestion {
  id: string;
  organizationId: string;
  leftContactId: string;
  rightContactId: string;
  matchType: 'EMAIL' | 'PHONE';
  matchValue: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
  leftContact: Contact;
  rightContact: Contact;
}

export interface MergeSuggestionPage {
  items: MergeSuggestion[];
  nextCursor: string | null;
}

export type TimelineChannel = 'email' | 'wapi' | 'audit';

export type TimelineKind =
  | 'email.queued'
  | 'email.sent'
  | 'email.failed'
  | 'email.bounced'
  | 'email.complained'
  | 'email.suppressed'
  | 'email.canceled'
  | 'email.opened'
  | 'email.clicked'
  | 'wapi.sent'
  | 'wapi.delivered'
  | 'wapi.read'
  | 'wapi.failed'
  | 'wapi.message.in'
  | 'wapi.message.out'
  | 'audit';

export interface TimelineItem {
  id: string;
  at: string;
  channel: TimelineChannel;
  kind: TimelineKind;
  refId: string;
  metadata: Record<string, unknown>;
}

export interface TimelinePage {
  items: TimelineItem[];
  nextCursor: string | null;
}

