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
import { SuppressionsPage } from './features/email/suppressions/SuppressionsPage';
import { MetricsPage } from './features/email/metrics/MetricsPage';
import { WapiCampaignsListPage } from './features/wapi/campaigns/WapiCampaignsListPage';
import { WapiCampaignDetailPage } from './features/wapi/campaigns/WapiCampaignDetailPage';
import { WapiConfigsPage } from './features/wapi/configs/WapiConfigsPage';
import { WapiTemplatesListPage } from './features/wapi/templates/WapiTemplatesListPage';
import { WapiTemplateEditorPage } from './features/wapi/templates/WapiTemplateEditorPage';
import { WapiInboxPage } from './features/wapi/inbox/WapiInboxPage';
import { WapiQuickRepliesPage } from './features/wapi/quick-replies/WapiQuickRepliesPage';
import { WapiBotsPage } from './features/wapi/bots/WapiBotsPage';
import { WapiLivePage } from './features/wapi/live/WapiLivePage';
import { WapiSimulatorPage } from './features/dev/WapiSimulatorPage';
import { WapiSimulatorChatPage } from './features/dev/WapiSimulatorChatPage';
import { AuditLogPage } from './features/audit/AuditLogPage';
import { ContactsListPage } from './features/contacts/ContactsListPage';
import { ContactDetailPage } from './features/contacts/ContactDetailPage';
import { MergeSuggestionsPage } from './features/contacts/MergeSuggestionsPage';
import { ContactsImportPage } from './features/contacts/ContactsImportPage';

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
        <Route path="email/suppressions" element={<SuppressionsPage />} />
        <Route path="email/metrics" element={<MetricsPage />} />
        <Route path="wapi/campaigns" element={<WapiCampaignsListPage />} />
        <Route path="wapi/campaigns/:id" element={<WapiCampaignDetailPage />} />
        <Route path="wapi/configs" element={<WapiConfigsPage />} />
        <Route path="wapi/inbox" element={<WapiInboxPage />} />
        <Route path="wapi/quick-replies" element={<WapiQuickRepliesPage />} />
        <Route path="wapi/bots" element={<WapiBotsPage />} />
        <Route path="wapi/live" element={<WapiLivePage />} />
        <Route path="wapi/templates" element={<WapiTemplatesListPage />} />
        <Route path="wapi/templates/new" element={<WapiTemplateEditorPage />} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="contacts" element={<ContactsListPage />} />
        <Route path="contacts/import" element={<ContactsImportPage />} />
        <Route path="contacts/merge" element={<MergeSuggestionsPage />} />
        <Route path="contacts/:id" element={<ContactDetailPage />} />
        {DEV_SIMULATOR_ENABLED && (
          <Route path="dev/wapi/simulator" element={<WapiSimulatorPage />} />
        )}
        {DEV_SIMULATOR_ENABLED && (
          <Route path="dev/wapi/chat" element={<WapiSimulatorChatPage />} />
        )}
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
