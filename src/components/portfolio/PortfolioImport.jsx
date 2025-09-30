import React, { useState } from "react";
import { FileText, Camera, Brain, Upload, Check, ChevronLeft } from "lucide-react";
import CSVPortfolioImport from "./CSVPortfolioImport";
import ImagePortfolioImport from "./ImagePortfolioImport";

export default function PortfolioImport({ onSuccess }) {
  const [selectedMethod, setSelectedMethod] = useState(null);

  if (!selectedMethod) {
    return (
      <div className="w-full max-h-[80vh] overflow-y-auto p-1">
        <h2 className="text-lg font-bold text-center text-purple-900 mb-2">Choose Import Method</h2>
        <p className="text-center text-sm text-purple-700 mb-6">Select how you'd like to import your portfolio</p>

        <div className="space-y-4">
          {/* CSV Option */}
          <button
            onClick={() => setSelectedMethod('csv')}
            className="w-full text-left neomorph-hover neomorph rounded-2xl p-6 transition-all duration-300"
          >
            <div className="flex items-start space-x-4">
              <div className="neomorph rounded-xl p-3 flex-shrink-0">
                <FileText className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-purple-800">Upload CSV File</h3>
                <p className="text-sm text-purple-600 mt-1 mb-3">Export your portfolio from any broker and upload it.</p>
                <div className="space-y-1 text-xs text-purple-700">
                  <p className="flex items-center"><Check className="w-3 h-3 mr-2 text-green-500" /> Works with all brokers</p>
                  <p className="flex items-center"><Check className="w-3 h-3 mr-2 text-green-500" /> Most accurate data transfer</p>
                  <p className="flex items-center"><Check className="w-3 h-3 mr-2 text-green-500" /> Supports transaction history</p>
                </div>
              </div>
            </div>
          </button>

          {/* Screenshot Option */}
          <button
            onClick={() => setSelectedMethod('image')}
            className="w-full text-left neomorph-hover neomorph rounded-2xl p-6 transition-all duration-300"
          >
            <div className="flex items-start space-x-4">
              <div className="neomorph rounded-xl p-3 flex-shrink-0">
                <Camera className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-purple-800">Upload Screenshot</h3>
                <p className="text-sm text-purple-600 mt-1 mb-3">Take a photo or screenshot of your broker's portfolio page.</p>
                <div className="space-y-1 text-xs text-purple-700">
                  <p className="flex items-center"><Check className="w-3 h-3 mr-2 text-green-500" /> Quick and easy setup</p>
                  <p className="flex items-center"><Check className="w-3 h-3 mr-2 text-green-500" /> AI-powered data extraction</p>
                </div>
                <div className="mt-3 inline-flex items-center space-x-2 bg-purple-200 text-purple-800 text-xs font-semibold px-3 py-1 rounded-full">
                  <Brain className="w-3 h-3" />
                  <span>AI-Powered</span>
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="neomorph-inset rounded-2xl p-4 mt-6">
          <h4 className="font-semibold text-purple-800 mb-2 flex items-center"><Upload className="w-4 h-4 mr-2"/>Pro Tips:</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-purple-700">
            <li>For CSV: Look for "Export" or "Download" options in your broker.</li>
            <li>For images: Make sure asset symbols and quantities are clearly visible.</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setSelectedMethod(null)} className="flex items-center space-x-2 text-purple-700 font-medium mb-4 neomorph-hover neomorph rounded-lg px-3 py-2 transition-all">
        <ChevronLeft className="w-4 h-4" />
        <span>Back to options</span>
      </button>
      {selectedMethod === 'csv' && <CSVPortfolioImport onSuccess={onSuccess} />}
      {selectedMethod === 'image' && <ImagePortfolioImport onSuccess={onSuccess} />}
    </div>
  );
}