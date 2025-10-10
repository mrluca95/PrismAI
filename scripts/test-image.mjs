import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'node:fs';

async function main() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('Usage: npm run test:openai-image -- <path-to-image>');
    process.exit(1);
  }
  const file = fs.readFileSync(imagePath);
  const base64 = file.toString('base64');
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful vision assistant.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image in one sentence.' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
          ],
        },
      ],
      max_tokens: 120,
    });
    const message = response?.choices?.[0]?.message?.content?.trim() || '(no content returned)';
    console.log(message);
  } catch (error) {
    console.error('OpenAI vision test failed:', error.message || error);
    process.exit(1);
  }
}

main();
