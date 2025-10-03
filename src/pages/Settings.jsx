import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from '@/context/AuthContext.jsx';
import { ChevronRight, Smartphone, Palette, Brain, DollarSign, Shield, ExternalLink } from "lucide-react";
import BrokerSettings from "../components/settings/BrokerSettings";
import ThemeSettings from "../components/settings/ThemeSettings";
import AIPreferences from "../components/settings/AIPreferences";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/?$/, "");

const TIER_DETAILS = {
  FREE: {
    name: 'Free',
    description: 'Perfect to explore Prism AI insights.',
    insights: 20,
    quotes: 200,
  },
  PLUS: {
    name: 'Plus',
    description: 'More headroom for active investors.',
    insights: 200,
    quotes: 2000,
  },
  PRO: {
    name: 'Pro',
    description: 'High-volume plan for power users.',
    insights: 1000,
    quotes: 10000,
  },
};

const ProgressBar = ({ value = 0, max = 1, label }) => {
  const percentage = Math.min(100, Math.round((value / (max || 1)) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-purple-700">
        <span>{label}</span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-purple-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-purple-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default function Settings() {
  const navigate = useNavigate();
  const { user, usage, limits, logout, updateTier } = useAuth();
  const [activeSection, setActiveSection] = useState(null);
  const [aiStatus, setAiStatus] = useState({
    state: 'checking',
    message: 'Checking AI backend...',
    model: null,
  });
  const [tierError, setTierError] = useState(null);
  const [upgradingTier, setUpgradingTier] = useState(null);

  useEffect(() => {
    if (!API_BASE_URL) {
      setAiStatus({
        state: 'error',
        message: 'Set VITE_API_BASE_URL to enable AI-powered features.',
        model: null,
      });
      return;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
          headers: { 'Cache-Control': 'no-store' },
          credentials: 'include',
        });
        const text = await response.text();
        let data = {};
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (parseError) {
            throw new Error('Received invalid JSON from AI backend.');
          }
        }
        if (!response.ok) {
          throw new Error(data.error || response.statusText || 'AI backend error');
        }
        if (!cancelled) {
          setAiStatus({
            state: 'ok',
            message: 'Connected to Prism AI backend.',
            model: data.model || 'unknown',
          });
        }
      } catch (error) {
        if (!cancelled) {
          setAiStatus({
            state: 'error',
            message: error?.message || 'Unable to reach AI backend.',
            model: null,
          });
        }
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, []);

  const settingsSections = [
    {
      id: 'brokers',
      title: 'Broker Connections',
      description: 'Manage your brokerage accounts',
      icon: DollarSign,
    },
    {
      id: 'theme',
      title: 'Appearance',
      description: "Customize the app's look and feel",
      icon: Palette,
    },
    {
      id: 'ai',
      title: 'AI Preferences',
      description: 'Configure AI insights and recommendations',
      icon: Brain,
    },
    {
      id: 'notifications',
      title: 'Notifications',
      description: 'Manage alerts and updates',
      icon: Smartphone,
    },
    {
      id: 'privacy',
      title: 'Privacy & Security',
      description: 'Data protection and terms',
      icon: Shield,
    },
  ];

  const effectiveLimits = useMemo(() => ({
    insights: limits?.insights ?? user?.monthlyInsights ?? TIER_DETAILS.FREE.insights,
    quotes: limits?.quotes ?? user?.monthlyQuotes ?? TIER_DETAILS.FREE.quotes,
  }), [limits, user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleTierChange = async (tierKey) => {
    if (user?.tier === tierKey) {
      return;
    }
    setTierError(null);
    setUpgradingTier(tierKey);
    try {
      await updateTier({ tier: tierKey });
    } catch (error) {
      setTierError(error?.message || 'Unable to update plan.');
    } finally {
      setUpgradingTier(null);
    }
  };

  return (
    <div className="min-h-screen p-4 space-y-6">
      <div className="pt-4">
        <h1 className="text-2xl omega:text-3xl font-bold text-gray-800 mb-1">Settings</h1>
        <p className="text-gray-600">Customize your investment monitoring experience</p>
      </div>

      {user && (
        <div className="neomorph rounded-2xl p-6 space-y-4 bg-white/80">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-purple-900">Subscription</h2>
              <p className="text-sm text-purple-600">
                Active plan: <span className="font-semibold">{TIER_DETAILS[user.tier]?.name || user.tier}</span>
              </p>
            </div>
            {tierError && <p className="text-sm text-red-500">{tierError}</p>}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ProgressBar
              label="AI insights used"
              value={usage?.llmCalls ?? 0}
              max={effectiveLimits.insights}
            />
            <ProgressBar
              label="Price lookups used"
              value={usage?.priceRequests ?? 0}
              max={effectiveLimits.quotes}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {Object.entries(TIER_DETAILS).map(([tierKey, tier]) => (
              <button
                key={tierKey}
                type="button"
                onClick={() => handleTierChange(tierKey)}
                disabled={upgradingTier === tierKey || user.tier === tierKey}
                className={`neomorph rounded-2xl p-5 text-left transition-all duration-300 ${
                  user.tier === tierKey ? 'ring-2 ring-purple-500 neomorph-inset' : 'neomorph-hover'
                } ${upgradingTier === tierKey ? 'opacity-70 cursor-wait' : ''}`}
              >
                <h3 className="text-lg font-semibold text-purple-900">{tier.name}</h3>
                <p className="mt-1 text-sm text-purple-600">{tier.description}</p>
                <ul className="mt-3 text-xs text-purple-700 space-y-1">
                  <li>• {tier.insights.toLocaleString()} insights / month</li>
                  <li>• {tier.quotes.toLocaleString()} price lookups / month</li>
                </ul>
                {user.tier === tierKey ? (
                  <span className="mt-4 inline-block rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">
                    Current plan
                  </span>
                ) : (
                  <span className="mt-4 inline-block rounded-full bg-purple-600 px-3 py-1 text-xs font-medium text-white">
                    {upgradingTier === tierKey ? 'Updating...' : 'Switch to this plan'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className={`neomorph rounded-2xl p-4 border ${
          aiStatus.state === 'ok'
            ? 'border-green-200'
            : aiStatus.state === 'checking'
            ? 'border-yellow-200'
            : 'border-red-200'
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-purple-800">AI Service Status</p>
            <p className="text-sm text-purple-600">{aiStatus.message}</p>
            {aiStatus.model && (
              <p className="mt-2 text-xs text-gray-500">Model: {aiStatus.model}</p>
            )}
          </div>
          <span
            className={`mt-1 inline-flex h-3 w-3 rounded-full ${
              aiStatus.state === 'ok'
                ? 'bg-green-500'
                : aiStatus.state === 'checking'
                ? 'bg-yellow-400 animate-pulse'
                : 'bg-red-500'
            }`}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="space-y-4">
        {settingsSections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
            className="w-full neomorph rounded-2xl p-6 text-left neomorph-hover transition-all duration-300"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="neomorph rounded-xl p-3 mr-4">
                  <section.icon className="w-6 h-6 text-gray-700" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{section.title}</h3>
                  <p className="text-gray-600 text-sm">{section.description}</p>
                </div>
              </div>
              <ChevronRight
                className={`w-5 h-5 text-gray-600 transition-transform duration-300 ${
                  activeSection === section.id ? 'rotate-90' : ''
                }`}
              />
            </div>

            {activeSection === section.id && (
              <div className="mt-6 pt-6 border-t border-gray-300">
                {section.id === 'brokers' && <BrokerSettings />}
                {section.id === 'theme' && <ThemeSettings />}
                {section.id === 'ai' && <AIPreferences />}
                {section.id === 'notifications' && (
                  <div className="text-gray-600">
                    <p>Notification settings will be available in a future update.</p>
                  </div>
                )}
                {section.id === 'privacy' && (
                  <div className="text-purple-700">
                    <p className="mb-4">
                      Your data privacy is our top priority. Our AI models run securely, and your personal financial data is never used for training or shared with third parties.
                    </p>
                    <a
                      href="https://sites.google.com/view/prismai-privacy-policy/home-page"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center font-semibold text-purple-800 neomorph-hover neomorph rounded-lg px-4 py-2 transition-all duration-300"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View Full Privacy Policy
                    </a>
                  </div>
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      <button
        onClick={handleLogout}
        className="w-full neomorph-inset rounded-2xl p-4 text-red-600 font-medium transition-all duration-300 hover:text-red-700"
      >
        Sign Out
      </button>
    </div>
  );
}
