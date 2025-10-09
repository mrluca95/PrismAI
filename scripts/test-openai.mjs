import 'dotenv/config';
import OpenAI from 'openai';

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set.');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Say "Hello, Prism AI!"' }],
      max_tokens: 16,
    });
    const message = response?.choices?.[0]?.message?.content?.trim() || '(no content returned)';
    console.log(message);
  } catch (error) {
    console.error('OpenAI request failed:', error.message || error);
    process.exit(1);
  }
}

main();
