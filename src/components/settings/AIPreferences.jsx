import React, { useState } from "react";
import { Brain, Bell, TrendingUp } from "lucide-react";

export default function AIPreferences() {
  const [preferences, setPreferences] = useState({
    insights: true,
    riskAlerts: true,
    marketTrends: false,
    rebalancingTips: true,
    frequency: "daily"
  });

  const togglePreference = (key) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const settings = [
    {
      key: "insights",
      title: "AI Insights",
      description: "Get personalized investment insights",
      icon: Brain
    },
    {
      key: "riskAlerts", 
      title: "Risk Alerts",
      description: "Notify about portfolio concentration risks",
      icon: Bell
    },
    {
      key: "marketTrends",
      title: "Market Trends",
      description: "Updates on market movements affecting your assets",
      icon: TrendingUp
    },
    {
      key: "rebalancingTips",
      title: "Rebalancing Tips", 
      description: "Suggestions to optimize your portfolio",
      icon: Brain
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-gray-800 mb-4">AI Features</h3>
        <div className="space-y-3">
          {settings.map((setting) => (
            <div key={setting.key} className="neomorph-inset rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="neomorph rounded-xl p-2">
                    <setting.icon className="w-5 h-5 text-gray-700" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">{setting.title}</p>
                    <p className="text-sm text-gray-600">{setting.description}</p>
                  </div>
                </div>
                <button 
                  onClick={() => togglePreference(setting.key)}
                  className="neomorph rounded-full p-1"
                >
                  <div className={`w-12 h-6 rounded-full relative transition-all duration-300 ${
                    preferences[setting.key] ? 'bg-purple-600' : 'bg-gray-400'
                  }`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${
                      preferences[setting.key] ? 'right-1' : 'left-1'
                    }`}></div>
                  </div>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-gray-800 mb-4">Insight Frequency</h3>
        <div className="neomorph-inset rounded-xl p-4">
          <select
            value={preferences.frequency}
            onChange={(e) => setPreferences(prev => ({ ...prev, frequency: e.target.value }))}
            className="w-full bg-transparent text-gray-800 font-medium"
          >
            <option value="realtime">Real-time</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>

      <div className="neomorph-inset rounded-xl p-4">
        <p className="text-sm text-gray-600">
          <strong>Privacy:</strong> AI analysis is performed securely. Your portfolio data is encrypted and never shared with third parties.
        </p>
      </div>
    </div>
  );
}