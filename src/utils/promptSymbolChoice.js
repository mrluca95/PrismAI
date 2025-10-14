export const promptSymbolChoice = async (symbol, expectedName = '', candidates = []) => {
  const unique = [];
  const seen = new Set();

  const pushCandidate = (candidate) => {
    const upper = String(candidate?.symbol || '').toUpperCase();
    if (!upper || seen.has(upper)) {
      return;
    }
    seen.add(upper);
    unique.push({
      symbol: upper,
      name: candidate?.name || null,
      exchange: candidate?.exchange || null,
    });
  };

  candidates.forEach(pushCandidate);

  if (unique.length <= 1) {
    return null;
  }

  const lines = unique
    .map((candidate, index) => {
      const parts = [candidate.symbol];
      if (candidate.name) {
        parts.push(candidate.name);
      }
      if (candidate.exchange) {
        parts.push(`(${candidate.exchange})`);
      }
      return `${index + 1}. ${parts.join(' ')}`;
    })
    .join('\n');

  const message = [
    `Multiple matches found for ${symbol}.`,
    expectedName ? `Expected: ${expectedName}` : null,
    'Enter the number of the correct ticker:',
    '0. Keep current ticker',
    lines,
  ]
    .filter(Boolean)
    .join('\n');

  const answer = window.prompt(message, '0');
  if (answer === null) {
    return null;
  }
  const choice = Number.parseInt(answer, 10);
  if (!Number.isFinite(choice) || choice < 0 || choice > unique.length) {
    return null;
  }
  if (choice === 0) {
    return null;
  }
  return unique[choice - 1];
};

