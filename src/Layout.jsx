import React, { useState, cloneElement, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Home, PieChart, Settings } from "lucide-react";

const navigationItems = [
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: Home,
  },
  {
    title: "Portfolio",
    url: createPageUrl("Portfolio"),
    icon: PieChart,
  },
  {
    title: "Settings",
    url: createPageUrl("Settings"),
    icon: Settings,
  },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [performanceSign, setPerformanceSign] = useState('neutral');

  const themeColors = {
    positive: {
      '--background-color': '#f0fff4', // light green
      '--primary-text': '#2f855a',
      '--secondary-text': '#38a169',
      '--accent-color': '#48bb78',
      '--neomorph-shadow-light': 'rgba(255, 255, 255, 0.9)',
      '--neomorph-shadow-dark': 'rgba(66, 153, 225, 0.15)'
    },
    negative: {
      '--background-color': '#fff5f5', // light red
      '--primary-text': '#c53030',
      '--secondary-text': '#e53e3e',
      '--accent-color': '#f56565',
      '--neomorph-shadow-light': 'rgba(255, 255, 255, 0.9)',
      '--neomorph-shadow-dark': 'rgba(229, 62, 62, 0.15)'
    },
    neutral: {
      '--background-color': '#f3f0ff', // default purple
      '--primary-text': '#5b21b6',
      '--secondary-text': '#6d28d9',
      '--accent-color': '#8b5cf6',
      '--neomorph-shadow-light': 'rgba(255, 255, 255, 0.9)',
      '--neomorph-shadow-dark': 'rgba(139, 92, 246, 0.15)'
    }
  };
  
  const currentTheme = themeColors[performanceSign] || themeColors.neutral;
  const gridClass = navigationItems.length === 3 ? 'grid-cols-3' : 'grid-cols-4';

  // Pass setPerformanceSign prop only to the Dashboard page
  const pageContent = currentPageName === 'Dashboard' 
    ? cloneElement(children, { setPerformanceSign }) 
    : children;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background-color)', transition: 'background-color 0.5s ease' }}>
      <style>
        {`
          :root {
            ${Object.entries(currentTheme).map(([key, value]) => `${key}: ${value};`).join('\n')}
          }
          /* PWA Manifest and Mobile Optimization */
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow-x: hidden;
            -webkit-text-size-adjust: 100%;
            -webkit-tap-highlight-color: transparent;
            user-select: none;
            -webkit-user-select: none;
            -webkit-touch-callout: none;
          }
          
          /* Prevent zoom on mobile */
          input, textarea, select {
            font-size: 16px;
          }
          
          /* Touch optimization */
          button, a {
            -webkit-tap-highlight-color: transparent;
            -webkit-touch-callout: none;
          }
          
          /* Neomorphism styles */
          .neomorph {
            box-shadow: 8px 8px 16px var(--neomorph-shadow-dark), -8px -8px 16px var(--neomorph-shadow-light);
          }
          .neomorph-inset {
            box-shadow: inset 4px 4px 8px var(--neomorph-shadow-dark), inset -4px -4px 8px var(--neomorph-shadow-light);
          }
          .neomorph-pressed {
            box-shadow: inset 6px 6px 12px var(--neomorph-shadow-dark), inset -6px -6px 12px var(--neomorph-shadow-light);
          }
          .neomorph-hover:hover {
            box-shadow: 12px 12px 20px var(--neomorph-shadow-dark), -12px -12px 20px var(--neomorph-shadow-light);
          }
          .gradient-text {
            background: linear-gradient(135deg, var(--secondary-text) 0%, var(--accent-color) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
          
          /* PWA App-like behavior */
          @media all and (display-mode: standalone) {
            body {
              -webkit-user-select: none;
              -webkit-touch-callout: none;
            }
          }
        `}
      </style>
      
      {/* PWA Meta Tags */}
      <div style={{ display: 'none' }}>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Prism" />
        <meta name="application-name" content="Prism" />
        <meta name="theme-color" content="#8b5cf6" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
      </div>
      
      <div className="pb-20">
        {pageContent}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 w-full z-50 border-t border-purple-200 safe-area-inset-bottom" style={{ backgroundColor: 'var(--background-color)' }}>
        <div className={`grid ${gridClass} gap-0`}>
          {navigationItems.map((item) => {
            const isActive = location.pathname === item.url;
            return (
              <Link
                key={item.title}
                to={item.url}
                className={`flex flex-col items-center py-3 px-2 transition-all duration-300 ${
                  isActive 
                    ? 'neomorph-pressed' 
                    : 'neomorph neomorph-hover'
                } mx-2 my-2 rounded-xl touch-manipulation`}
              >
                <item.icon 
                  className={`w-6 h-6 mb-1`} 
                  style={{ color: isActive ? 'var(--primary-text)' : 'var(--secondary-text)' }}
                />
                <span className={`text-xs font-medium`}
                  style={{ color: isActive ? 'var(--primary-text)' : 'var(--secondary-text)' }}>
                  {item.title}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}





