import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const riskWeights = {
  Conservative: { equity: 0.20, bonds: 0.70, cash: 0.10, tagline: "Steady first. Risk-aware guidance." },
  Moderate: { equity: 0.60, bonds: 0.35, cash: 0.05, tagline: "Balanced growth with guardrails." },
  Aggressive: { equity: 0.90, bonds: 0.10, cash: 0.00, tagline: "Pursue growth--know the risks." }
};

const marketReturns = {
  equity: 0.12,
  bonds: 0.015,
  cash: 0.02
};

const parseAssetRange = (range) => {
  if (!range) return 0;
  const cleaned = range.replace(/[\$,<+]/g, '').replace('k', '000');
  const parts = cleaned.split('-');
  return parseInt(parts[0], 10) || 5000;
};

export default function ProjectionStep({ data, setData, onNext }) {
  const [projection, setProjection] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [projectionYears, setProjectionYears] = useState(20);

  useEffect(() => {
    setIsLoading(true);

    let score = 0;
    const scores = [
      { "Sell everything": 0, "Hold and wait": 10, "Buy more": 20 },
      { "5%": 5, "10%": 10, "20%": 15, "30%+": 20 },
      { "Low": 5, "Medium": 10, "High": 20 },
      { "Broad (many assets)": 5, "Moderate": 10, "Concentrated (few assets)": 20 },
      { "Preserving stability": 5, "A balance of both": 10, "Maximizing returns": 20 }
    ];
    data.riskAnswers.forEach((answer, i) => {
      score += scores[i][answer] || 0;
    });

    let profileName;
    if (score <= 30) profileName = "Conservative";
    else if (score <= 65) profileName = "Moderate";
    else profileName = "Aggressive";

    const weights = riskWeights[profileName];
    const yieldValue = (weights.equity * marketReturns.equity) + 
                       (weights.bonds * marketReturns.bonds) + 
                       (weights.cash * marketReturns.cash);
    
    const cagr = yieldValue * 100;
    const range = {
      lower: cagr * 0.5,
      upper: cagr * 1.5
    };

    setData(prev => ({ ...prev, riskScore: score, riskProfileName: profileName }));
    setProjection({ cagr, range });
    setIsLoading(false);
  }, [data.riskAnswers, setData]);

  const chartData = useMemo(() => {
    if (!projection) return [];

    const initialInvestment = parseAssetRange(data.investableAssets);
    const monthlyContribution = data.monthlyContribution;
    const moderateReturn = projection.cagr / 100;
    const upperReturn = projection.range.upper / 100;
    const lowerReturn = projection.range.lower / 100;

    let currentModerate = initialInvestment;
    let currentUpper = initialInvestment;
    let currentLower = initialInvestment;
    let currentContributions = initialInvestment;

    const projectionData = [{
        year: 0,
        moderate: initialInvestment,
        optimistic: initialInvestment,
        pessimistic: initialInvestment,
        contributions: initialInvestment
    }];

    for (let i = 1; i <= projectionYears; i++) {
        const annualContribution = monthlyContribution * 12;
        currentModerate = (currentModerate + annualContribution) * (1 + moderateReturn);
        currentUpper = (currentUpper + annualContribution) * (1 + upperReturn);
        currentLower = (currentLower + annualContribution) * (1 + lowerReturn);
        currentContributions += annualContribution;

        projectionData.push({
            year: i,
            moderate: parseFloat(currentModerate.toFixed(0)),
            optimistic: parseFloat(currentUpper.toFixed(0)),
            pessimistic: parseFloat(currentLower.toFixed(0)),
            contributions: parseFloat(currentContributions.toFixed(0)),
        });
    }
    return projectionData;
  }, [projection, data.investableAssets, data.monthlyContribution, projectionYears]);

  const finalValue = chartData.length > 0 ? chartData[chartData.length - 1] : {};

  if (isLoading) {
    return (
      <div className="neomorph rounded-2xl p-8 max-w-2xl mx-auto text-center bg-purple-100/30">
        <Loader2 className="w-12 h-12 text-purple-600 mx-auto animate-spin" />
        <p className="mt-4 text-purple-700">Calculating your projection...</p>
      </div>
    );
  }

  return (
    <div className="neomorph rounded-2xl p-8 max-w-2xl mx-auto text-center bg-purple-100/30">
      <h2 className="text-3xl font-bold mb-2 text-purple-900">Your Investment Projection</h2>
      <p className="text-purple-700 mb-6 capitalize">{data.riskProfileName} Profile</p>
      
      <div className="h-64 my-8">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis dataKey="year" tick={{ fill: 'var(--primary-text)' }} />
            <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} tick={{ fill: 'var(--primary-text)' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(243, 240, 255, 0.9)',
                borderColor: '#c4b5fd',
                borderRadius: '1rem',
              }}
              formatter={(value, name) => [`$${value.toLocaleString()}`, name.charAt(0).toUpperCase() + name.slice(1)]}
              labelFormatter={(label) => `Year ${label}`}
            />
            <Legend wrapperStyle={{ color: 'var(--primary-text)' }} />
            <Line type="monotone" dataKey="contributions" stroke="#a78bfa" strokeWidth={2} name="Contributions" dot={false} />
            <Line type="monotone" dataKey="pessimistic" stroke="#ef4444" strokeDasharray="5 5" name="Pessimistic" dot={false} />
            <Line type="monotone" dataKey="moderate" stroke="#22c55e" strokeWidth={3} name="Expected" dot={false} />
            <Line type="monotone" dataKey="optimistic" stroke="#3b82f6" strokeDasharray="5 5" name="Optimistic" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-4 my-8">
        <div>
          <label className="block text-sm font-medium text-purple-800 mb-2">Projection Timeframe: {projectionYears} years</label>
          <Slider
            value={[projectionYears]}
            onValueChange={([value]) => setProjectionYears(value)}
            min={5}
            max={40}
            step={1}
            className="[&>*:nth-child(2)]:bg-purple-600 [&>*:nth-child(1)]:bg-purple-200"
          />
        </div>
        <div className="neomorph-inset rounded-xl p-4 text-center">
          <p className="text-purple-700">In {projectionYears} years, you could have:</p>
          <p className="text-3xl font-bold gradient-text">
            ${(finalValue.moderate || 0).toLocaleString()}
          </p>
          <p className="text-sm text-purple-600">
            (between ${(finalValue.pessimistic || 0).toLocaleString()} and ${(finalValue.optimistic || 0).toLocaleString()})
          </p>
        </div>
      </div>
      
      <p className="text-xs text-purple-600 max-w-sm mx-auto mb-6">
        This is an educational estimate. Past performance is not indicative of future results.
      </p>

      <div className="mt-8">
        <Button onClick={onNext} className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-10 py-3">
          Get Started with Prism AI
        </Button>
      </div>
    </div>
  );
}