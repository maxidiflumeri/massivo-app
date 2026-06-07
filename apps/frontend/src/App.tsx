import { Route, Routes, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { HomePage } from './pages/HomePage';
import { DashboardHome } from './pages/DashboardHome';
import { SignInPage } from './pages/auth/SignInPage';
import { SignUpPage } from './pages/auth/SignUpPage';
import { AppLayout } from './layouts/AppLayout';
import { TemplatesListPage } from './features/email/templates/TemplatesListPage';
import { TemplateEditorPage } from './features/email/templates/TemplateEditorPage';
import { CampaignsListPage } from './features/email/campaigns/CampaignsListPage';
import { CampaignDetailPage } from './features/email/campaigns/CampaignDetailPage';
import { SmtpAccountsPage } from './features/email/smtp-accounts/SmtpAccountsPage';
import { DomainsListPage } from './features/email/domains/DomainsListPage';
import { AddDomainPage } from './features/email/domains/AddDomainPage';
import { DomainDetailPage } from './features/email/domains/DomainDetailPage';
import { SuppressionsPage } from './features/email/suppressions/SuppressionsPage';
import { MetricsPage } from './features/email/metrics/MetricsPage';
import { TransactionalListPage } from './features/email/transactional/TransactionalListPage';
import { WapiCampaignsListPage } from './features/wapi/campaigns/WapiCampaignsListPage';
import { WapiCampaignDetailPage } from './features/wapi/campaigns/WapiCampaignDetailPage';
import { ChannelsPage } from './features/channels/ChannelsPage';
import { WapiTemplatesListPage } from './features/wapi/templates/WapiTemplatesListPage';
import { WapiTemplateEditorPage } from './features/wapi/templates/WapiTemplateEditorPage';
import { InboxPage } from './features/inbox/InboxPage';
import { WapiQuickRepliesPage } from './features/wapi/quick-replies/WapiQuickRepliesPage';
import { BotsPage } from './features/bots/BotsPage';
import { WapiLivePage } from './features/wapi/live/WapiLivePage';
import { WapiSimulatorPage } from './features/dev/WapiSimulatorPage';
import { WapiSimulatorChatPage } from './features/dev/WapiSimulatorChatPage';
import { MessengerSimulatorChatPage } from './features/dev/MessengerSimulatorChatPage';
import { AuditLogPage } from './features/audit/AuditLogPage';
import { ContactsListPage } from './features/contacts/ContactsListPage';
import { ContactDetailPage } from './features/contacts/ContactDetailPage';
import { MergeSuggestionsPage } from './features/contacts/MergeSuggestionsPage';
import { ContactsReportsPage } from './features/contacts/ContactsReportsPage';

const DEV_SIMULATOR_ENABLED = import.meta.env.VITE_ENABLE_DEV_SIMULATOR === 'true';

export function App() {
  return (
    <Routes>
      {/* Rutas públicas */}
      <Route path="/" element={<HomePage />} />
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />

      {/* Rutas protegidas */}
      <Route
        path="/dashboard"
        element={
          <>
            <SignedIn>
              <AppLayout />
            </SignedIn>
            <SignedOut>
              <RedirectToSignIn />
            </SignedOut>
          </>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route path="email/templates" element={<TemplatesListPage />} />
        <Route path="email/templates/new" element={<TemplateEditorPage />} />
        <Route path="email/templates/:id" element={<TemplateEditorPage />} />
        <Route path="email/campaigns" element={<CampaignsListPage />} />
        <Route path="email/campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="email/smtp-accounts" element={<SmtpAccountsPage />} />
        <Route path="email/domains" element={<DomainsListPage />} />
        <Route path="email/domains/new" element={<AddDomainPage />} />
        <Route path="email/domains/:id" element={<DomainDetailPage />} />
        <Route path="email/suppressions" element={<SuppressionsPage />} />
        <Route path="email/metrics" element={<MetricsPage />} />
        <Route path="email/transactional" element={<TransactionalListPage />} />
        <Route path="wapi/campaigns" element={<WapiCampaignsListPage />} />
        <Route path="wapi/campaigns/:id" element={<WapiCampaignDetailPage />} />
        <Route path="channels" element={<ChannelsPage />} />
        {/* La gestión de canales (alta/listado/edición de todos los kinds) vive en
            /dashboard/channels. La vieja página "Números" se eliminó; sus ajustes
            WhatsApp (throttle/opt-out/welcome) están en el editor de cada canal. */}
        <Route path="wapi/configs" element={<Navigate to="/dashboard/channels" replace />} />
        <Route path="inbox" element={<InboxPage />} />
        {/* El inbox dejó de ser sub-feature de WhatsApp (es omnicanal) →
            /dashboard/inbox. Redirect del path viejo por compat. */}
        <Route path="wapi/inbox" element={<Navigate to="/dashboard/inbox" replace />} />
        <Route path="wapi/quick-replies" element={<WapiQuickRepliesPage />} />
        <Route path="bots" element={<BotsPage />} />
        {/* Bot dejó de ser sub-feature de WhatsApp (es cross-canal) → /dashboard/bots.
            Redirect del path viejo por compat. */}
        <Route path="wapi/bots" element={<Navigate to="/dashboard/bots" replace />} />
        <Route path="wapi/live" element={<WapiLivePage />} />
        <Route path="wapi/templates" element={<WapiTemplatesListPage />} />
        <Route path="wapi/templates/new" element={<WapiTemplateEditorPage />} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="contacts" element={<ContactsListPage />} />
        <Route path="contacts/merge" element={<MergeSuggestionsPage />} />
        <Route path="contacts/reports" element={<ContactsReportsPage />} />
        <Route path="contacts/:id" element={<ContactDetailPage />} />
        {DEV_SIMULATOR_ENABLED && (
          <Route path="dev/wapi/simulator" element={<WapiSimulatorPage />} />
        )}
        {DEV_SIMULATOR_ENABLED && (
          <Route path="dev/wapi/chat" element={<WapiSimulatorChatPage />} />
        )}
        {DEV_SIMULATOR_ENABLED && (
          <Route path="dev/channels/messenger/chat" element={<MessengerSimulatorChatPage />} />
        )}
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
