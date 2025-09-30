
import React, { useState } from "react";
import { Plus, AlertTriangle, ExternalLink, Upload, Wrench } from "lucide-react";
import PortfolioImport from "../portfolio/PortfolioImport";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function BrokerSettings() {
  const [showImportDialog, setShowImportDialog] = useState(false);

  const [availableBrokers] = useState([
    { name: "Interactive Brokers", description: "Professional trading platform", popular: true, status: "coming_soon" },
    { name: "TD Ameritrade", description: "Full-service broker", popular: true, status: "coming_soon" },
    { name: "Robinhood", description: "Commission-free trading", popular: true, status: "coming_soon" },
    { name: "Charles Schwab", description: "Full-service investing", popular: true, status: "coming_soon" },
    { name: "Fidelity", description: "Investment management", popular: true, status: "coming_soon" },
    { name: "Webull", description: "Advanced mobile trading", popular: false, status: "planned" },
    { name: "M1 Finance", description: "Automated investing", popular: false, status: "planned" },
    { name: "E*TRADE", description: "Online trading platform", popular: false, status: "planned" }
  ]);

  const handleImportSuccess = () => {
    setShowImportDialog(false);
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      {/* Work in Progress Banner */}
      <div className="neomorph rounded-xl p-4 bg-gradient-to-r from-purple-100 to-blue-100">
        <div className="flex items-center space-x-3">
          <div className="neomorph rounded-full p-2">
            <Wrench className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-purple-800">Broker Integrations</h3>
            <p className="text-sm text-purple-700">
              We're actively building API connections with major brokers. Coming soon!
            </p>
          </div>
          <div className="bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse">
            WIP
          </div>
        </div>
      </div>

      {/* CSV Import Section */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-purple-800">Import Portfolio</h3>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowImportDialog(true);
            }}
            className="neomorph rounded-xl px-4 py-2 neomorph-hover transition-all duration-300 flex items-center space-x-2"
          >
            <Upload className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-700">Import Portfolio</span>
          </button>
        </div>
        
        <div className="neomorph-inset rounded-xl p-4">
          <p className="text-sm text-purple-700 mb-2">
            <strong>Available Now:</strong> Import your portfolio using CSV files or screenshots from any broker.
          </p>
          <p className="text-xs text-purple-600">
            <strong>New!</strong> Upload a screenshot of your broker app and let AI extract your assets automatically.
          </p>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-purple-800 mb-4">Planned Broker Integrations</h3>
        <div className="grid grid-cols-1 gap-3">
          {availableBrokers.map((broker) => (
            <div
              key={broker.name}
              className="neomorph rounded-xl p-4 opacity-75"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-medium text-purple-800">{broker.name}</span>
                    {broker.popular && (
                      <span className="text-xs bg-purple-200 text-purple-700 px-2 py-1 rounded-full">Popular</span>
                    )}
                    {broker.status === "coming_soon" && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full animate-pulse">
                        Coming Soon
                      </span>
                    )}
                    {broker.status === "planned" && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                        Planned
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-purple-600">{broker.description}</p>
                </div>
                <div className="neomorph rounded-lg p-2 opacity-50">
                  <Plus className="w-5 h-5 text-purple-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Integration Timeline */}
      <div className="neomorph-inset rounded-xl p-4 bg-blue-50/50">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-800 mb-2">Development Timeline</p>
            <div className="space-y-2 text-sm text-blue-700">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-blue-600">Now</span>
                <span><strong>Available Now:</strong> CSV import for all brokers</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-blue-600">Next</span>
                <span><strong>Q4 2025:</strong> Interactive Brokers API integration</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-blue-600">Soon</span>
                <span><strong>Q1 2026:</strong> Major US brokers (Schwab, TD, Fidelity)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-blue-600">Mobile</span>
                <span><strong>Q2 2026:</strong> Mobile-first brokers (Robinhood, Webull)</span>
              </div>
            </div>
            <button className="mt-3 text-blue-800 hover:text-blue-900 font-medium flex items-center space-x-1 transition-colors">
              <ExternalLink className="w-4 h-4" />
              <span>Request Priority Access</span>
            </button>
          </div>
        </div>
      </div>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-purple-100 border-none neomorph p-0 rounded-2xl max-w-lg" style={{ backgroundColor: '#f3f0ff' }}>
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-xl font-bold text-purple-900">Import Portfolio</DialogTitle>
          </DialogHeader>
          <div className="p-6">
            <PortfolioImport onSuccess={handleImportSuccess} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
