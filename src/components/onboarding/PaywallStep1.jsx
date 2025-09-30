
import React from 'react';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

const features = [
  "Deeper, personalized AI insights",
  "No ads",
  "Connect multiple brokers",
];

export default function PaywallStep1({ onNext, onSelectPlan }) {
  return (
    <div className="neomorph rounded-2xl p-8 max-w-lg mx-auto text-center bg-purple-100/30">
      <h2 className="text-3xl font-bold mb-4 text-purple-900">Unlock smarter AI insights</h2>
      
      <div className="text-left my-8 space-y-3">
        {features.map((feature, i) => (
          <div key={i} className="flex items-center">
            <Check className="w-5 h-5 text-green-500 mr-3" />
            <span className="text-purple-700">{feature}</span>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <Button onClick={onNext} size="lg" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg py-6">
          Start free trial
        </Button>
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-purple-300/50"></span></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-purple-100/30 px-2 text-purple-600">OR</span></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Button onClick={() => onSelectPlan('monthly')} variant="outline" size="lg" className="w-full bg-transparent border-purple-300 text-purple-700 hover:bg-purple-200/50 hover:text-purple-800 py-6">
            Monthly $7.99
          </Button>
          <div className="relative">
            <Button onClick={() => onSelectPlan('yearly_special')} variant="outline" size="lg" className="w-full bg-purple-200/50 border-purple-400 text-purple-800 hover:bg-purple-200 py-6 font-semibold">
              Yearly $69.99
            </Button>
            <div className="absolute -top-3 right-4 bg-yellow-400 text-black text-xs font-bold px-2 py-1 rounded-full">Most popular</div>
          </div>
        </div>
      </div>
      
      <Button onClick={() => onSelectPlan('free')} variant="link" className="text-purple-600 mt-6">Maybe later</Button>
      <p className="text-xs text-gray-500 mt-4">Past performance != future results. Not investment advice. You can restore purchases in Settings.</p>
    </div>
  );
}
