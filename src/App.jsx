import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AssetDetail from './pages/AssetDetail.jsx';
import Portfolio from './pages/Portfolio.jsx';
import Settings from './pages/Settings.jsx';
import Onboarding from './pages/Onboarding.jsx';

const LayoutRoute = ({ pageName, children }) => (
  <Layout currentPageName={pageName}>{children}</Layout>
);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={(
          <LayoutRoute pageName="Dashboard">
            <Dashboard />
          </LayoutRoute>
        )}
      />
      <Route
        path="/portfolio"
        element={(
          <LayoutRoute pageName="Portfolio">
            <Portfolio />
          </LayoutRoute>
        )}
      />
      <Route
        path="/asset-detail"
        element={(
          <LayoutRoute pageName="Portfolio">
            <AssetDetail />
          </LayoutRoute>
        )}
      />
      <Route
        path="/settings"
        element={(
          <LayoutRoute pageName="Settings">
            <Settings />
          </LayoutRoute>
        )}
      />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
