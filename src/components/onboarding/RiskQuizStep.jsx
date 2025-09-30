
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const questions = [
  { text: "If the market drops 20%, what's your first reaction?", options: ["Sell everything", "Hold and wait", "Buy more"] },
  { text: "What's the maximum loss you could tolerate in a single year?", options: ["5%", "10%", "20%", "30%+"] },
  { text: "How comfortable are you with market volatility (ups and downs)?", options: ["Low", "Medium", "High"] },
  { text: "How diversified do you prefer your portfolio to be?", options: ["Broad (many assets)", "Moderate", "Concentrated (few assets)"] },
  { text: "Which is more important to you?", options: ["Preserving stability", "A balance of both", "Maximizing returns"] }
];

export default function RiskQuizStep({ data, setData, onNext }) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [error, setError] = useState('');

  const handleAnswer = (answer) => {
    // Update the answer for the current question
    const newAnswers = [...data.riskAnswers];
    newAnswers[currentQuestion] = answer;
    setData(prev => ({ ...prev, riskAnswers: newAnswers }));

    setError(''); // Clear any previous error when an answer is selected

    // Check if there are more questions
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    } else {
      // If all questions are answered, proceed to the next step
      onNext();
    }
  };
  
  // The original handleNext function is no longer needed as answering options
  // automatically advances the questions and calls onNext when complete.

  return (
    <div className="neomorph rounded-2xl p-8 max-w-lg mx-auto bg-purple-100/30">
      <h2 className="text-3xl font-bold mb-2 text-center text-purple-900">Risk Appetite</h2>
      <p className="text-center text-purple-700 mb-6">Question {currentQuestion + 1} of {questions.length}</p>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-lg font-semibold text-center mb-8">{questions[currentQuestion].text}</p>
          <div className="space-y-4">
            {questions[currentQuestion].options.map((option, i) => (
              <button
                key={i}
                onClick={() => handleAnswer(option)}
                className={`w-full text-left p-4 rounded-xl transition-all duration-200 neomorph-hover
                  ${data.riskAnswers[currentQuestion] === option
                    ? 'neomorph-pressed bg-purple-200/50'
                    : 'neomorph'
                  }`
                }
              >
                {option}
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
      {error && <p className="text-red-500 text-sm mt-4 text-center">{error}</p>}
    </div>
  );
}
