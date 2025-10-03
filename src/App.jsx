import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AssetDetail from './pages/AssetDetail.jsx';
import Portfolio from './pages/Portfolio.jsx';
import Settings from './pages/Settings.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Login from './pages/Login.jsx';
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
            <Login />
          </PublicOnlyRoute>
        )}
      />
      <Route
        path="/dashboard"
        element={(
          <PrivateRoute>
            <LayoutRoute pageName="Dashboard">
              <Dashboard />
            </LayoutRoute>
          </PrivateRoute>
        )}
      />
      <Route
        path="/portfolio"
        element={(
          <PrivateRoute>
            <LayoutRoute pageName="Portfolio">
              <Portfolio />
            </LayoutRoute>
          </PrivateRoute>
        )}
      />
      <Route
        path="/asset-detail"
        element={(
          <PrivateRoute>
            <LayoutRoute pageName="Portfolio">
              <AssetDetail />
            </LayoutRoute>
          </PrivateRoute>
        )}
      />
      <Route
        path="/settings"
        element={(
          <PrivateRoute>
            <LayoutRoute pageName="Settings">
              <Settings />
            </LayoutRoute>
          </PrivateRoute>
        )}
      />
      <Route
        path="/onboarding"
        element={(
          <PrivateRoute>
            <Onboarding />
          </PrivateRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
