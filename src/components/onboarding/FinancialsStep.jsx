import React from 'react';
import { Button } from '@/components/ui/button';

const incomeRanges = ['$0-$25k', '$25k-$50k', '$50k-$100k', '$100k-$250k', '$250k+'];
const assetRanges = ['$0-$10k', '$10k-$50k', '$50k-$250k', '$250k-$1M', '$1M+'];
const debtToleranceOptions = ['Low', 'Medium', 'High'];

export default function FinancialsStep({ data, setData, onNext }) {
  const handleChange = (field, value) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNumberChange = (field) => (event) => {
    const value = event.target.value;
    handleChange(field, value);
  };

  const canContinue = Boolean(data.income && data.investableAssets && data.monthlyContribution);

  return (
    <div className="neomorph rounded-2xl p-8 max-w-2xl mx-auto space-y-8 bg-purple-100/30">
      <div className="space-y-2 text-center">
        <h2 className="text-3xl font-bold text-purple-900">Your finances</h2>
        <p className="text-purple-700">This helps Prism estimate appropriate risk and projections.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-purple-800">Household income</label>
          <div className="grid gap-2">
            {incomeRanges.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => handleChange('income', range)}
                className={`rounded-xl px-4 py-2 text-left transition-all ${
                  data.income === range ? 'neomorph-pressed bg-purple-200/60' : 'neomorph-hover neomorph'
                }`}
              >
                <span className="text-sm font-medium text-purple-800">{range}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-purple-800">Investable assets</label>
          <div className="grid gap-2">
            {assetRanges.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => handleChange('investableAssets', range)}
                className={`rounded-xl px-4 py-2 text-left transition-all ${
                  data.investableAssets === range ? 'neomorph-pressed bg-purple-200/60' : 'neomorph-hover neomorph'
                }`}
              >
                <span className="text-sm font-medium text-purple-800">{range}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-purple-800" htmlFor="monthly-contribution">
            Monthly contribution (USD)
          </label>
          <input
            id="monthly-contribution"
            type="number"
            min={0}
            step={50}
            value={data.monthlyContribution}
            onChange={handleNumberChange('monthlyContribution')}
            className="neomorph-inset rounded-xl px-4 py-3 text-purple-900 bg-transparent"
            placeholder="e.g., 500"
          />
          <p className="text-xs text-purple-600">Estimate how much you add to investments each month.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-purple-800">Emergency fund</label>
          <div className="flex space-x-2">
            {['Yes', 'No'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleChange('emergencyFund', option === 'Yes')}
                className={`flex-1 rounded-xl px-4 py-3 transition-all ${
                  data.emergencyFund === (option === 'Yes') ? 'neomorph-pressed bg-purple-200/60' : 'neomorph-hover neomorph'
                }`}
              >
                <span className="font-medium text-purple-800">{option}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-purple-600">Do you have 3-6 months of expenses saved?</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-purple-800">Debt tolerance</label>
        <div className="grid gap-2 md:grid-cols-3">
          {debtToleranceOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleChange('debtTolerance', option)}
              className={`rounded-xl px-4 py-3 text-center transition-all ${
                data.debtTolerance === option ? 'neomorph-pressed bg-purple-200/60' : 'neomorph-hover neomorph'
              }`}
            >
              <span className="text-sm font-semibold text-purple-800">{option}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!canContinue} size="lg" className="bg-purple-600 text-white">
          Continue
        </Button>
      </div>
    </div>
  );
}
