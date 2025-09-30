import React, { useState, useEffect } from "react";
import { User } from "@/entities/User";
import { ChevronRight, Smartphone, Palette, Brain, DollarSign, Shield, ExternalLink } from "lucide-react";
import BrokerSettings from "../components/settings/BrokerSettings";
import ThemeSettings from "../components/settings/ThemeSettings";
import AIPreferences from "../components/settings/AIPreferences";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/?$/, "");

export default function Settings() {
  const [activeSection, setActiveSection] = useState(null);
  const [aiStatus, setAiStatus] = useState({
    state: "checking",
    message: "Checking AI backend...",
    model: null,
  });

  useEffect(() => {
    if (!API_BASE_URL) {
      setAiStatus({
        state: "error",
        message: "Set VITE_API_BASE_URL to enable AI-powered features.",
        model: null,
      });
      return;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
          headers: { "Cache-Control": "no-store" },
        });
        const text = await response.text();
        let data = {};
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (parseError) {
            throw new Error("Received invalid JSON from AI backend.");
          }
        }
        if (!response.ok) {
          throw new Error(data.error || response.statusText || "AI backend error");
        }
        if (!cancelled) {
          setAiStatus({
            state: "ok",
            message: "Connected to Prism AI backend.",
            model: data.model || "unknown",
          });
        }
      } catch (error) {
        if (!cancelled) {
          setAiStatus({
            state: "error",
            message: error?.message || "Unable to reach AI backend.",
            model: null,
          });
        }
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [API_BASE_URL]);

  const settingsSections = [
    {
      id: "brokers",
      title: "Broker Connections",
      description: "Manage your brokerage accounts",
      icon: DollarSign,
    },
    {
      id: "theme",
      title: "Appearance",
      description: "Customize the app's look and feel",
      icon: Palette,
    },
    {
      id: "ai",
      title: "AI Preferences",
      description: "Configure AI insights and recommendations",
      icon: Brain,
    },
    {
      id: "notifications",
      title: "Notifications",
      description: "Manage alerts and updates",
      icon: Smartphone,
    },
    {
      id: "privacy",
      title: "Privacy & Security",
      description: "Data protection and terms",
      icon: Shield,
    },
  ];

  const handleLogout = async () => {
    await User.logout();
  };

  return (
    <div className="min-h-screen p-4 space-y-6">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Settings</h1>
        <p className="text-gray-600">Customize your investment monitoring experience</p>
      </div>

      <div
        className={`neomorph rounded-2xl p-4 border ${
          aiStatus.state === "ok"
            ? "border-green-200"
            : aiStatus.state === "checking"
            ? "border-yellow-200"
            : "border-red-200"
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
              aiStatus.state === "ok"
                ? "bg-green-500"
                : aiStatus.state === "checking"
                ? "bg-yellow-400 animate-pulse"
                : "bg-red-500"
            }`}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Settings Sections */}
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
                  activeSection === section.id ? "rotate-90" : ""
                }`}
              />
            </div>

            {activeSection === section.id && (
              <div className="mt-6 pt-6 border-t border-gray-300">
                {section.id === "brokers" && <BrokerSettings />}
                {section.id === "theme" && <ThemeSettings />}
                {section.id === "ai" && <AIPreferences />}
                {section.id === "notifications" && (
                  <div className="text-gray-600">
                    <p>Notification settings will be available in a future update.</p>
                  </div>
                )}
                {section.id === "privacy" && (
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

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className="w-full neomorph-inset rounded-2xl p-4 text-red-600 font-medium transition-all duration-300 hover:text-red-700"
      >
        Sign Out
      </button>
    </div>
  );
}
