import React, { useState } from "react";
import { Moon, Sun, Smartphone } from "lucide-react";

export default function ThemeSettings() {
  const [selectedTheme, setSelectedTheme] = useState("light");

  const themes = [
    {
      id: "light",
      name: "Light Mode",
      description: "Neumorphic light theme",
      icon: Sun
    },
    {
      id: "dark", 
      name: "Dark Mode",
      description: "Coming soon",
      icon: Moon,
      disabled: true
    },
    {
      id: "auto",
      name: "System",
      description: "Follow device settings",
      icon: Smartphone,
      disabled: true
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-gray-800 mb-4">Theme Selection</h3>
        <div className="space-y-3">
          {themes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => !theme.disabled && setSelectedTheme(theme.id)}
              disabled={theme.disabled}
              className={`w-full neomorph rounded-xl p-4 text-left transition-all duration-300 ${
                theme.disabled 
                  ? 'opacity-50 cursor-not-allowed' 
                  : selectedTheme === theme.id 
                    ? 'neomorph-pressed' 
                    : 'neomorph-hover'
              }`}
            >
              <div className="flex items-center space-x-4">
                <div className="neomorph rounded-xl p-3">
                  <theme.icon className="w-5 h-5 text-gray-700" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{theme.name}</p>
                  <p className="text-sm text-gray-600">{theme.description}</p>
                </div>
                {selectedTheme === theme.id && !theme.disabled && (
                  <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}