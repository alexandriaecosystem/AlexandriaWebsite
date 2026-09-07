import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminGuard } from './AdminGuard';
import { AppShell } from './AppShell';
import { LoginPage } from '../pages/LoginPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ReviewsPage } from '../pages/ReviewsPage';
import { ReviewDetailPage } from '../pages/ReviewDetailPage';
import { AnnouncementsPage } from '../pages/AnnouncementsPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { KnowledgeBasePage } from '../pages/KnowledgeBasePage';
import { KnowledgeGapsPage } from '../pages/KnowledgeGapsPage';
import { UsersPage } from '../pages/UsersPage';
import { UserConversationPage } from '../pages/UserConversationPage';
import { MessagesPage } from '../pages/MessagesPage';
import { TokenMonitorPage } from '../pages/TokenMonitorPage';
import { AccountSecurityPage } from '../pages/AccountSecurityPage';
import { OperationsPage } from '../pages/OperationsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ApprovedCommunityPage } from '../pages/AdminOperationsPages';
import { LanguageProvider } from '../i18n/LanguageContext';
import { ToastProvider } from '../components/Feedback';

export function App() {
  return <LanguageProvider><ToastProvider><BrowserRouter><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route element={<AdminGuard />}>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="reviews/:applicationId" element={<ReviewDetailPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:userId" element={<UserConversationPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="community" element={<ApprovedCommunityPage />} />
        <Route path="knowledge" element={<KnowledgeBasePage />} />
        <Route path="knowledge-gaps" element={<KnowledgeGapsPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="token-monitor" element={<TokenMonitorPage />} />
        <Route path="operations" element={<OperationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="account" element={<AccountSecurityPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter></ToastProvider></LanguageProvider>;
}
