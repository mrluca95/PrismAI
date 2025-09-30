import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { InvokeLLM } from "@/integrations/Core";
import { Brain, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import CurrencyValue from '@/components/common/CurrencyValue.jsx';

export default function CategoryDetailModal({ isOpen, onClose, category, assets }) {
  const [insight, setInsight] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && category && assets.length > 0) {
      generateInsight();
    } else {
      setInsight('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, category, assets]);

  const generateInsight = async () => {
    setIsLoading(true);
    setInsight('');
    try {
      const assetsSummary = assets.map(a => `${a.name} (${a.symbol}): Gain/Loss ${a.gain_loss_percent?.toFixed(2)}%`).join(', ');
      const prompt = `Provide a concise investment analysis for the '${category}' category of a portfolio. The assets are: ${assetsSummary}. 
      
      Structure the response using Markdown with bold headers for each section. Cover these points briefly:
      1.  **Overall Performance**: Comment on the category's performance based on the data.
      2.  **Concentration Risk**: Note any concentration risks.
      3.  **Actionable Insight**: Suggest one potential action or observation.
      
      For any links, use a short hyperlink format like \`[Source](URL)\`.`;

      const result = await InvokeLLM({ prompt, add_context_from_internet: true });
      setInsight(result);
    } catch (error) {
      console.error("Failed to generate category insight:", error);
      setInsight("Could not generate insight at this time.");
    }
    setIsLoading(false);
  };

  const totalValue = assets.reduce((sum, asset) => sum + (asset.market_value || 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-purple-100 border-none neomorph p-0 rounded-2xl max-w-md w-[90vw] max-h-[85vh] flex flex-col" style={{ backgroundColor: '#f3f0ff' }}>
        <DialogHeader className="p-4 pb-2 flex-shrink-0">
          <DialogTitle className="text-xl font-bold text-purple-900 capitalize">
            {category} Assets
          </DialogTitle>
          <p className="text-purple-700 text-sm">Total: <CurrencyValue value={totalValue} /></p>
        </DialogHeader>

        <div className="px-4 space-y-3 overflow-y-auto scrollbar-hide flex-1 min-h-0">
          {assets.map(asset => {
            const isPositive = (asset.gain_loss || 0) >= 0;
            return (
              <div key={asset.id} className="neomorph-inset rounded-xl p-3">
                <div className="flex justify-between items-center">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="font-bold text-purple-800 truncate text-sm">{asset.symbol}</p>
                    <p className="text-xs text-purple-700">{asset.quantity} shares</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-purple-900 text-sm">
                      <CurrencyValue value={asset.market_value} minimumFractionDigits={0} maximumFractionDigits={0} />
                    </p>
                    <div className={`flex items-center justify-end text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                      <span>{isPositive ? '+' : ''}{(asset.gain_loss_percent || 0).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="p-4 pt-2 flex-shrink-0">
          <div className="w-full neomorph rounded-xl p-3">
            <h4 className="font-semibold text-purple-800 mb-2 flex items-center text-sm">
              <Brain className="w-4 h-4 mr-2 text-purple-600" />
              AI Insight
            </h4>
            {isLoading ? (
              <div className="flex items-center space-x-2 text-purple-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Generating...</span>
              </div>
            ) : (
              <div className="prose prose-xs max-w-none text-purple-800 leading-relaxed break-words max-h-40 overflow-y-auto scrollbar-hide prose-a:text-purple-600 prose-a:font-semibold prose-strong:text-purple-900">
                <ReactMarkdown>{insight}</ReactMarkdown>
              </div>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}