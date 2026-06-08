import { MetaSimulatorChatPage } from './MetaSimulatorChatPage';

/**
 * Página dev `/dashboard/dev/channels/instagram/chat` (Fase 3). Wrapper fino sobre
 * el sandbox genérico de Meta Messaging fijando el kind INSTAGRAM.
 */
export function InstagramSimulatorChatPage() {
  return <MetaSimulatorChatPage kind="INSTAGRAM" />;
}
