import React from 'react';
import { Button } from '@/components/ui/button';

export default function WelcomeStep({ onNext, onSkip }) {
  return (
    <div className="text-center flex flex-col items-center justify-center h-full">
      <h1 className="text-4xl md:text-5xl font-bold mb-4 text-purple-900">Personalize your AI insights</h1>
      <p className="text-lg md:text-xl text-purple-700 max-w-lg mb-8">
        Tailored insights. Smarter monitoring. Answer a few questions so Prism AI can tailor suggestions to your goals.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <Button onClick={onNext} size="lg" className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg px-8 py-6">
          Get started
        </Button>
        <Button onClick={onSkip} variant="ghost" size="lg" className="text-purple-600 hover:text-purple-800 text-lg px-8 py-6">
          Skip for now
        </Button>
      </div>
    </div>
  );
}