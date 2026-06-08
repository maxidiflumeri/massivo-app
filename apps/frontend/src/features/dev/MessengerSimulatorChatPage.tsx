import { MetaSimulatorChatPage } from './MetaSimulatorChatPage';

/**
 * Página dev `/dashboard/dev/channels/messenger/chat` (Fase 2). Wrapper fino sobre
 * el sandbox genérico de Meta Messaging fijando el kind MESSENGER.
 */
export function MessengerSimulatorChatPage() {
  return <MetaSimulatorChatPage kind="MESSENGER" />;
}
