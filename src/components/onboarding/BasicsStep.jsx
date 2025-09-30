import React from 'react';
import { Button } from '@/components/ui/button';

const experienceLevels = ['Beginner', 'Intermediate', 'Advanced'];
const goals = ['Growth', 'Income', 'Balanced', 'Capital Preservation'];
const horizons = ['<1y', '1-3y', '3-5y', '5+y'];

export default function BasicsStep({ data, setData, onNext }) {
  const handleChange = (field, value) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const canContinue = data.age && Number(data.age) > 0 && data.goal;

  return (
    <div className="neomorph rounded-2xl p-8 max-w-2xl mx-auto space-y-8 bg-purple-100/40">
      <div className="space-y-2 text-center">
        <h2 className="text-3xl font-bold text-purple-900">Tell us about you</h2>
        <p className="text-purple-700">We use this to personalise insights and risk checks.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col space-y-2">
          <label className="text-sm font-medium text-purple-800" htmlFor="age">Age</label>
          <input
            id="age"
            type="number"
            min={18}
            value={data.age}
            onChange={(event) => handleChange('age', event.target.value)}
            className="neomorph-inset rounded-xl px-4 py-3 text-purple-900 bg-transparent"
            placeholder="e.g., 32"
          />
        </div>

        <div className="flex flex-col space-y-2">
          <label className="text-sm font-medium text-purple-800">Experience level</label>
          <div className="grid grid-cols-1 gap-2">
            {experienceLevels.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => handleChange('experience', level)}
                className={`rounded-xl px-4 py-3 text-left transition-all ${
                  data.experience === level ? 'neomorph-pressed bg-purple-200/60' : 'neomorph-hover neomorph'
                }`}
              >
                <span className="font-medium text-purple-800">{level}</span>
                <p className="text-xs text-purple-600">
                  {level === 'Beginner' && 'Learning the basics'}
                  {level === 'Intermediate' && 'Comfortable with market swings'}
                  {level === 'Advanced' && 'Actively managing investments'}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-purple-800 mb-2">Primary goal</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {goals.map((goal) => (
              <button
                key={goal}
                type="button"
                onClick={() => handleChange('goal', goal)}
                className={`rounded-xl px-4 py-3 text-left transition-all ${
                  data.goal === goal ? 'neomorph-pressed bg-purple-200/60' : 'neomorph-hover neomorph'
                }`}
              >
                <span className="font-medium text-purple-800">{goal}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-purple-800 mb-2">Investment horizon</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {horizons.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleChange('horizon', option)}
                className={`rounded-xl px-4 py-3 text-center transition-all ${
                  data.horizon === option ? 'neomorph-pressed bg-purple-200/60' : 'neomorph-hover neomorph'
                }`}
              >
                <span className="font-semibold text-purple-800">{option}</span>
              </button>
            ))}
          </div>
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
