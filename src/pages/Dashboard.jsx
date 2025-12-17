import React, { useState, useEffect, useRef, useCallback } from "react";
import { Asset, AIInsight, Transaction } from "@/entities/all";
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext.jsx';
import BalanceCard from "../components/dashboard/BalanceCard";
import AIInsightsCard from "../components/dashboard/AIInsightsCard";
import QuickStats from "../components/dashboard/QuickStats";
import RecentActivity from "../components/dashboard/RecentActivity";
import PerformanceChart from "../components/dashboard/PerformanceChart";
import TransactionForm from "../components/transactions/TransactionForm";
import PortfolioImport from "../components/portfolio/PortfolioImport";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Brain, Loader2, TrendingUp, ChevronLeft, ChevronRight, Upload, Edit, RefreshCw } from "lucide-react";
import { InvokeLLM, FetchQuotes } from "@/integrations/Core";
import { throttle } from "lodash";
import { formatDistanceToNow } from 'date-fns';
import { createPageUrl } from "@/utils";

export default function Dashboard({ setPerformanceSign = () => {} }) {
  const [assets, setAssets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [insights, setInsights] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTxFormOpen, setIsTxFormOpen] = useState(false);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [currentInsightIndex, setCurrentInsightIndex] = useState(0);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [showGetStartedPopover, setShowGetStartedPopover] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  const insightsContainerRef = useRef(null);
  const isInitialized = useRef(false);
  const navigate = useNavigate();

  const { user } = useAuth();

  useEffect(() => {
    if (user && !user.onboardingCompleted) {
      navigate(createPageUrl("Onboarding"), { replace: true });
    }
  }, [user, navigate]);

  const syncAssetPrices = useCallback(async (currentAssets) => {
    if (!currentAssets || currentAssets.length === 0) {
      setLastUpdated(new Date());
      return;
    }

    setSyncError(null);

    const symbols = [...new Set(currentAssets.map((asset) => asset.symbol))]
      .map((symbol) => (symbol || '').toUpperCase().trim())
      .filter(Boolean);

    if (symbols.length === 0) {
      setLastUpdated(new Date());
      return;
    }

    try {
      const quotes = await FetchQuotes(symbols);
      const updatePromises = currentAssets.map(async (asset) => {
        const symbol = (asset.symbol || '').toUpperCase().trim();
        const quote = quotes[symbol];
        if (!quote || !Number.isFinite(quote.price)) {
          return Promise.resolve();
        }

        const newPrice = Number(quote.price);
        const currentPrice = Number(asset.current_price) || 0;
        if (Number.isFinite(currentPrice) && Math.abs(newPrice - currentPrice) < 0.0001) {
          return Promise.resolve();
        }

        const previousClose = Number(quote.previousClose);
        const quantity = Number(asset.quantity) || 0;
        const purchasePrice = Number(asset.purchase_price) || 0;
        const basisPrice = Number.isFinite(previousClose) && previousClose > 0 ? previousClose : currentPrice;
        const market_value = quantity * newPrice;
        const gain_loss = (newPrice - purchasePrice) * quantity;
        const gain_loss_percent = purchasePrice > 0 ? (gain_loss / (purchasePrice * quantity)) * 100 : 0;
        const day_change = quantity * (newPrice - basisPrice);
        const day_change_percent = basisPrice > 0 ? ((newPrice - basisPrice) / basisPrice) * 100 : 0;

        return Asset.update(asset.id, {
          current_price: newPrice,
          market_value,
          gain_loss,
          gain_loss_percent,
          day_change,
          day_change_percent,
        });
      });

      await Promise.all(updatePromises);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error syncing asset prices:', error);
      setSyncError(error?.message || 'Network error. Could not update prices.');
      setLastUpdated(new Date());
    }
  }, []);

  const loadData = useCallback(async () => {
    const [assetsData, insightsData, transactionsData] = await Promise.all([
      Asset.list(),
      AIInsight.list("-created_date", 5),
      Transaction.list(),
    ]);
    setAssets(assetsData);
    setInsights(insightsData);
    setTransactions(transactionsData);
    setLastUpdated(new Date());
  }, []);

  const handleGenerateInsight = useCallback(async (currentAssets, currentInsights) => {
    if (currentAssets.length === 0) return;
    setIsGeneratingInsight(true);
    try {
      const portfolioSummary = currentAssets.map((a) => `${a.quantity} of ${a.symbol} (Value: $${a.market_value}, Gain/Loss: ${a.gain_loss_percent}%)`).join(', ');
      const existingTitles = currentInsights.map((i) => i.title).join(', ');

      const prompt = `Given the portfolio summary: [${portfolioSummary}], generate a new, unique, and actionable investment insight. 

      Format it using Markdown with a bold title. 
      Do not repeat existing insights like: ${existingTitles}. 
      Example format: "**Diversification Opportunity**\n\nYour portfolio is heavily concentrated in the tech sector. Consider adding exposure to healthcare or consumer staples for better balance."

      For any links, use a short hyperlink format like [Source](URL).

      Keep it concise and actionable.`;

      const response = await InvokeLLM({
        prompt: prompt,
        add_context_from_internet: true
      });

      if (response && typeof response === 'string' && response.length > 0) {
        const titleMatch = response.match(/\*\*(.*?)\*\*/);
        const title = titleMatch ? titleMatch[1] : 'Portfolio Insight';

        let type = 'opportunity';
        const lowerResponse = response.toLowerCase();
        if (lowerResponse.includes('risk') || lowerResponse.includes('warning') || lowerResponse.includes('caution')) {
          type = 'risk_alert';
        } else if (lowerResponse.includes('diversif')) {
          type = 'diversification';
        } else if (lowerResponse.includes('rebalanc')) {
          type = 'rebalancing';
        } else if (lowerResponse.includes('market') || lowerResponse.includes('trend')) {
          type = 'market_trend';
        }

        const relatedAssets = currentAssets
          .filter(asset => response.toUpperCase().includes(asset.symbol))
          .map(asset => asset.symbol);

        const newInsightData = {
          title: title,
          description: response,
          type: type,
          priority: 'medium',
          related_assets: relatedAssets
        };

        await AIInsight.create(newInsightData);
        await loadData();
      }
    } catch (error) {
      console.error("Error generating new insight:", error);
    }
    setIsGeneratingInsight(false);
  }, [loadData]);

  const initializeDashboard = useCallback(async () => {
    setIsLoading(true);
    await loadData();
    setIsLoading(false);

    setIsRefreshing(true);
    await syncAssetPrices(await Asset.list());
    await loadData();
    setIsRefreshing(false);

    const currentAssetsForInsight = await Asset.list();
    if (currentAssetsForInsight.length > 0) {
      // Get current insights to pass to the generation function, avoiding duplicates
      const currentInsights = await AIInsight.list();
      handleGenerateInsight(currentAssetsForInsight, currentInsights).catch(error => {
        console.error("Error generating initial AI insight in background:", error);
      });
    }
  }, [loadData, syncAssetPrices, handleGenerateInsight]);

  const handleManualRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setSyncError(null);
    await syncAssetPrices(await Asset.list());
    await loadData();
    setIsRefreshing(false);
  }, [isRefreshing, syncAssetPrices, loadData]);

  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      initializeDashboard();
    }

    const interval = setInterval(() => {
      handleManualRefresh();
    }, 300000);

    return () => clearInterval(interval);
  }, [initializeDashboard, handleManualRefresh]);

  const handleInsightScroll = throttle((e) => {
    const cardWidth = 320 + 16;
    const newIndex = Math.round(e.target.scrollLeft / cardWidth);
    setCurrentInsightIndex(newIndex);
  }, 200);

  const scrollInsights = (direction) => {
    if (insightsContainerRef.current) {
      const cardWidth = 320 + 16;
      const scrollAmount = direction === 'left' ? -cardWidth : cardWidth;
      insightsContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const totalValue = assets.reduce((sum, asset) => sum + (asset.market_value || 0), 0);
  const totalGainLoss = assets.reduce((sum, asset) => sum + (asset.gain_loss || 0), 0);
  const totalGainLossPercent = totalValue > 0 ? (totalGainLoss / (totalValue - totalGainLoss)) * 100 : 0;
  const totalDayChange = assets.reduce((sum, asset) => sum + (asset.day_change || 0), 0);

  return (
    <div className="min-h-screen p-4 space-y-6">
      {/* Header */}
      <div className="pt-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68c3c977838c50fe979706a2/c3056e25e_ChatGPTImageSep15202508_17_46PM.png"
              alt="Prism Logo"
              className="w-8 h-8 object-contain rounded-lg"
              style={{
                filter: 'brightness(1.2) contrast(1.1)',
                mixBlendMode: 'multiply',
                borderRadius: '8px'
              }}
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-purple-900 mb-1">Prism AI</h1>
            <p className="text-purple-700">AI-powered investment insights</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {syncError && <p className="text-xs text-red-500 mr-2">{syncError}</p>}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="neomorph rounded-xl p-3 neomorph-hover transition-all duration-300 disabled:opacity-50 disabled:cursor-wait"
          >
            <RefreshCw className={`w-6 h-6 text-purple-600 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <Popover open={showGetStartedPopover} onOpenChange={setShowGetStartedPopover}>
            <PopoverTrigger asChild>
              <button
                onClick={() => {
                  if (assets.length === 0) {
                    setShowGetStartedPopover(true);
                  } else {
                    setIsAddMenuOpen(true);
                  }
                }}
                className="neomorph rounded-xl p-3 neomorph-hover transition-all duration-300">
                <Plus className="w-6 h-6 text-purple-600" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 neomorph p-4 bg-purple-100 border-none"
              style={{ backgroundColor: '#f3f0ff' }}
              side="left"
            >
              <div className="flex items-start space-x-3">
                <div className="neomorph rounded-full p-2 flex-shrink-0">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-purple-800 mb-1">Get Started!</h4>
                  <p className="text-sm text-purple-700 mb-3">
                    Add your first investment to start tracking your portfolio.
                  </p>
                  <button
                    onClick={() => {
                      setShowGetStartedPopover(false);
                      setIsAddMenuOpen(true);
                    }}
                    className="neomorph rounded-lg px-3 py-2 text-sm font-medium text-purple-700 neomorph-hover transition-all duration-200"
                  >
                    Add Investment
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {!isLoading && assets.length === 0 && (
        <div className="neomorph rounded-2xl p-6 bg-purple-50 border border-purple-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div className="neomorph rounded-full p-3 bg-white/70">
              <Plus className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-purple-900">Add your first transaction</h2>
              <p className="text-sm text-purple-700">
                Your portfolio is empty. Record a transaction to start tracking performance with Prism AI.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setShowGetStartedPopover(false);
              setIsAddMenuOpen(true);
            }}
            className="self-start md:self-auto neomorph rounded-xl px-4 py-2 text-sm font-semibold text-purple-700 neomorph-hover transition-all duration-300"
          >
            Add Investment
          </button>
        </div>
      )}

      {/* Balance Card */}
      <BalanceCard
        totalValue={totalValue}
        totalGainLoss={totalGainLoss}
        totalGainLossPercent={totalGainLossPercent}
        isLoading={isLoading}
        lastUpdated={lastUpdated} />

      {/* Performance Chart */}
      <PerformanceChart
        assets={assets}
        transactions={transactions}
        totalValue={totalValue}
        isLoading={isLoading}
        setPerformanceSign={setPerformanceSign}
        totalDayChange={totalDayChange}
      />

      {/* AI Insights Carousel */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-purple-900">AI Insights</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => scrollInsights('left')}
              className="neomorph rounded-full p-2 neomorph-hover transition-all"
              disabled={isLoading || insights.length <= 1}
            >
              <ChevronLeft className="w-5 h-5 text-purple-600" />
            </button>
            <button
              onClick={() => scrollInsights('right')}
              className="neomorph rounded-full p-2 neomorph-hover transition-all"
              disabled={isLoading || insights.length <= 1}
            >
              <ChevronRight className="w-5 h-5 text-purple-600" />
            </button>
            <button
              onClick={() => handleGenerateInsight(assets, insights)}
              disabled={isGeneratingInsight || assets.length === 0}
              className="neomorph rounded-xl px-4 py-2 neomorph-hover transition-all duration-300 disabled:opacity-50"
            >
              <div className="flex items-center space-x-2">
                {isGeneratingInsight ? (
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                ) : (
                  <Brain className="w-4 h-4 text-purple-600" />
                )}
                <span className="text-sm font-medium text-purple-700">
                  {isGeneratingInsight ? "Analyzing..." : "Generate Insight"}
                </span>
              </div>
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="neomorph rounded-2xl p-4 animate-pulse h-48"></div>
        ) : assets.length === 0 ? (
          <div className="neomorph rounded-2xl p-8 text-center">
            <Brain className="w-12 h-12 text-purple-400 mx-auto mb-4" />
            <p className="text-purple-600">Add assets to generate AI insights</p>
          </div>
        ) : (
          <>
            <div
              ref={insightsContainerRef}
              onScroll={handleInsightScroll}
              className="flex overflow-x-auto space-x-4 pb-4 -mx-4 px-4 scrollbar-hide"
            >
              {insights.map((insight) => (
                <AIInsightsCard key={insight.id} insight={insight} />
              ))}
            </div>

            {insights.length > 1 && (
              <div className="flex justify-center space-x-2 mt-4">
                {insights.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      index === currentInsightIndex ?
                      'bg-purple-600 scale-125' :
                      'bg-purple-300'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Quick Stats */}
      <QuickStats assets={assets} isLoading={isLoading} />

      {/* Recent Activity */}
      <RecentActivity assets={assets} isLoading={isLoading} />

      {/* Add/Import Menu Modal */}
      <Dialog open={isAddMenuOpen} onOpenChange={setIsAddMenuOpen}>
        <DialogContent className="bg-purple-100 border-none neomorph p-0 rounded-2xl max-w-md" style={{ backgroundColor: '#f3f0ff' }}>
          <DialogHeader className="p-6 pb-4">
            <DialogTitle className="text-xl font-bold text-purple-900">Add Investments</DialogTitle>
          </DialogHeader>
          <div className="p-6 pt-0 grid grid-cols-1 gap-4">
            <button
              onClick={() => { setIsAddMenuOpen(false); setIsTxFormOpen(true); }}
              className="neomorph rounded-2xl p-6 text-center neomorph-hover transition-all duration-300"
            >
              <Edit className="w-8 h-8 mx-auto mb-3 text-purple-600" />
              <h3 className="font-semibold text-purple-800">Add Manually</h3>
              <p className="text-sm text-purple-600">Enter a single transaction</p>
            </button>
            <button
              onClick={() => { setIsAddMenuOpen(false); setIsImportOpen(true); }}
              className="neomorph rounded-2xl p-6 text-center neomorph-hover transition-all duration-300"
            >
              <Upload className="w-8 h-8 mx-auto mb-3 text-purple-600" />
              <h3 className="font-semibold text-purple-800">Import Portfolio</h3>
              <p className="text-sm text-purple-600">From CSV or image</p>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transaction Form Modal */}
      <Dialog open={isTxFormOpen} onOpenChange={setIsTxFormOpen}>
        <DialogContent className="bg-purple-100 border-none neomorph p-0 rounded-2xl" style={{ backgroundColor: '#f3f0ff' }}>
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-xl font-bold text-purple-900">Add Transaction</DialogTitle>
          </DialogHeader>
          <div className="p-6">
            <TransactionForm
              assets={assets}
              onSuccess={() => {
                setIsTxFormOpen(false);
                handleManualRefresh();
              }}
              onCancel={() => setIsTxFormOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Portfolio Modal */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="bg-purple-100 border-none neomorph p-0 rounded-2xl max-w-lg" style={{ backgroundColor: '#f3f0ff' }}>
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-xl font-bold text-purple-900">Import Portfolio</DialogTitle>
          </DialogHeader>
          <div className="p-6">
            <PortfolioImport onSuccess={() => { setIsImportOpen(false); handleManualRefresh(); }} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

