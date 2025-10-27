import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout.jsx';
const DashboardPage = React.lazy(() => import('./pages/Dashboard.jsx'));
const PortfolioPage = React.lazy(() => import('./pages/Portfolio.jsx'));
const AssetDetailPage = React.lazy(() => import('./pages/AssetDetail.jsx'));
const SettingsPage = React.lazy(() => import('./pages/Settings.jsx'));
const OnboardingPage = React.lazy(() => import('./pages/Onboarding.jsx'));
const LoginPage = React.lazy(() => import('./pages/Login.jsx'));
import { useAuth } from '@/context/AuthContext.jsx';

const LayoutRoute = ({ pageName, children }) => (
  <Layout currentPageName={pageName}>{children}</Layout>
);

const LoadingScreen = ({ message = 'Loading...' }) => (
  <div className="min-h-screen flex items-center justify-center text-purple-600">{message}</div>
);

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return <LoadingScreen message="Checking your session..." />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const PublicOnlyRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return <LoadingScreen message="Preparing Prism AI..." />;
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/login"
        element={(
          <PublicOnlyRoute>
            <Suspense fallback={<LoadingScreen message="Preparing Prism AI..." />}>
              <LoginPage />
            </Suspense>
          </PublicOnlyRoute>
        )}
      />
      <Route
        path="/dashboard"
        element={(
          <PrivateRoute>
            <Suspense fallback={<LoadingScreen message="Loading dashboard..." />}>
              <LayoutRoute pageName="Dashboard">
                <DashboardPage />
              </LayoutRoute>
            </Suspense>
          </PrivateRoute>
        )}
      />
      <Route
        path="/portfolio"
        element={(
          <PrivateRoute>
            <Suspense fallback={<LoadingScreen message="Loading portfolio..." />}>
              <LayoutRoute pageName="Portfolio">
                <PortfolioPage />
              </LayoutRoute>
            </Suspense>
          </PrivateRoute>
        )}
      />
      <Route
        path="/asset-detail"
        element={(
          <PrivateRoute>
            <Suspense fallback={<LoadingScreen message="Loading asset..." />}>
              <LayoutRoute pageName="Portfolio">
                <AssetDetailPage />
              </LayoutRoute>
            </Suspense>
          </PrivateRoute>
        )}
      />
      <Route
        path="/settings"
        element={(
          <PrivateRoute>
            <Suspense fallback={<LoadingScreen message="Loading settings..." />}>
              <LayoutRoute pageName="Settings">
                <SettingsPage />
              </LayoutRoute>
            </Suspense>
          </PrivateRoute>
        )}
      />
      <Route
        path="/onboarding"
        element={(
          <PrivateRoute>
            <Suspense fallback={<LoadingScreen message="Loading onboarding..." />}>
              <OnboardingPage />
            </Suspense>
          </PrivateRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
