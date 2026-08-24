import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminGuard } from './AdminGuard';
import { AppShell } from './AppShell';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ReviewsPage } from '../pages/ReviewsPage';
import { ReviewDetailPage } from '../pages/ReviewDetailPage';
import { AnnouncementsPage } from '../pages/AnnouncementsPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { KnowledgeBasePage } from '../pages/KnowledgeBasePage';
import { UsersPage } from '../pages/UsersPage';
import { UserConversationPage } from '../pages/UserConversationPage';
import { MessagesPage } from '../pages/MessagesPage';
import {
  ActivityLogPage,
  AdminUsersPage,
  AiPerformancePage,
  ApprovedCommunityPage,
  KnowledgeGapsPage,
  SettingsPage,
} from '../pages/AdminOperationsPages';
import { LanguageProvider } from '../i18n/LanguageContext';

export function App() {
  return <LanguageProvider><BrowserRouter><Routes>
    <Route path="/login" element={<LoginPage />} />
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
        <Route path="ai-performance" element={<AiPerformancePage />} />
        <Route path="activity" element={<ActivityLogPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin-users" element={<AdminUsersPage />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter></LanguageProvider>;
}
