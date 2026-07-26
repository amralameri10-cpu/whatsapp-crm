import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type AIProvider = 'anthropic' | 'openai' | 'gemini';

export type AIMessage = { role: 'user' | 'assistant'; content: string };

type GenerateOptions = {
  provider: AIProvider;
  model?: string;
  systemPrompt?: string;
  history: AIMessage[];
  temperature?: number; // 0-100
  maxTokens?: number;
};

const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
};

export async function generateAIReply(opts: GenerateOptions): Promise<string> {
  const model = opts.model || DEFAULT_MODELS[opts.provider];
  const temp = (opts.temperature ?? 70) / 100;
  const maxTokens = opts.maxTokens ?? 500;
  const system = opts.systemPrompt || 'أنت مساعد خدمة عملاء ودود ومحترف. رد بإيجاز ووضوح.';

  if (opts.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: temp,
      system,
      messages: opts.history.map((m) => ({ role: m.role, content: m.content })),
    });
    const block = res.content.find((b) => b.type === 'text');
    return block && block.type === 'text' ? block.text : '';
  }

  if (opts.provider === 'openai') {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature: temp,
      messages: [{ role: 'system', content: system }, ...opts.history],
    });
    return res.choices[0]?.message?.content || '';
  }

  if (opts.provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: opts.history.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { temperature: temp, maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || 'Gemini API error');
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  throw new Error(`Unknown AI provider: ${opts.provider}`);
}
