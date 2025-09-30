
import React, { useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import { InvokeLLM } from "@/integrations/Core";
import ReactMarkdown from 'react-markdown';

export default function AssetAIAnalysis({ asset }) {
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const generateAnalysis = async () => {
    setIsLoading(true);
    try {
      const prompt = `Provide a brief investment analysis for ${asset.name} (${asset.symbol}). 
      Current details:
      - Current Price: $${asset.current_price}
      - Purchase Price: $${asset.purchase_price} 
      - Gain/Loss: ${asset.gain_loss_percent?.toFixed(2)}%
      - Asset Type: ${asset.type}
      
      Format the response using Markdown. Use bold headers for each section (e.g., "**Performance Assessment**"). 
      For any external links, use a concise hyperlink like \`[Source](URL)\`.
      
      Provide 2-3 short bullet points covering:
      1. Current performance assessment
      2. Key factors affecting the asset
      3. Brief outlook or recommendation`;

      const result = await InvokeLLM({
        prompt,
        add_context_from_internet: true
      });

      setAnalysis(result);
    } catch (error) {
      console.error("Error generating AI analysis:", error);
      setAnalysis("Unable to generate analysis at this time. Please try again later.");
    }
    setIsLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">AI Analysis</h2>
        <button
          onClick={generateAnalysis}
          disabled={isLoading}
          className="neomorph rounded-xl px-4 py-2 neomorph-hover transition-all duration-300 disabled:opacity-50"
        >
          <div className="flex items-center space-x-2">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
            ) : (
              <Brain className="w-4 h-4 text-purple-600" />
            )}
            <span className="text-sm font-medium text-gray-700">
              {isLoading ? "Analyzing..." : "Generate Analysis"}
            </span>
          </div>
        </button>
      </div>
      
      <div className="neomorph rounded-2xl p-6">
        {isLoading ? (
          <div className="flex items-center space-x-2 text-purple-700">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing... This may take a moment.</span>
          </div>
        ) : analysis ? (
          <div className="prose prose-sm max-w-none prose-a:text-purple-600 prose-a:font-semibold prose-strong:text-purple-800 prose-p:text-purple-700">
            <ReactMarkdown>{analysis}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-center py-8">
            <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Click "Generate Analysis" to get AI-powered insights about this asset.</p>
          </div>
        )}
      </div>
    </div>
  );
}
