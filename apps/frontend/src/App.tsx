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
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
