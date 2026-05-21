import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, increment } from 'firebase/firestore';
import { GoogleGenAI } from '@google/genai';

export const MAX_INDIVIDUAL_AI_REQUESTS = 15;
export const MAX_SHARED_AI_REQUESTS = 5;

async function checkAIUsage() {
  const user = auth.currentUser;
  if (!user) return;

  const profileSnap = await getDoc(doc(db, `users/${user.uid}`));
  const hasOwnKey = profileSnap.exists() && profileSnap.data().geminiApiKey;
  const limit = hasOwnKey ? MAX_INDIVIDUAL_AI_REQUESTS : MAX_SHARED_AI_REQUESTS;

  const date = new Date().toISOString().split('T')[0];
  const usageRef = doc(db, `users/${user.uid}/usage/${date}`);

  const usageSnap = await getDoc(usageRef);
  const currentCount = usageSnap.exists() ? usageSnap.data().count : 0;

  if (currentCount >= limit) {
    throw new Error('LIMITE_EXCEDIDO');
  }
}

async function incrementAIUsage() {
  const user = auth.currentUser;
  if (!user) return;

  const date = new Date().toISOString().split('T')[0];
  const usageRef = doc(db, `users/${user.uid}/usage/${date}`);

  await setDoc(usageRef, {
    count: increment(1),
    lastUpdated: new Date().toISOString()
  }, { merge: true });
}

export async function getAIUsageCount() {
  const user = auth.currentUser;
  if (!user) return 0;
  const date = new Date().toISOString().split('T')[0];
  const usageRef = doc(db, `users/${user.uid}/usage/${date}`);
  const usageSnap = await getDoc(usageRef);
  return usageSnap.exists() ? usageSnap.data().count : 0;
}

// Memory logic
export async function getAIMemory() {
  const user = auth.currentUser;
  if (!user) return null;
  const memoryRef = doc(db, `users/${user.uid}/ai_profile/memory`);
  const memorySnap = await getDoc(memoryRef);
  return memorySnap.exists() ? memorySnap.data() : null;
}

export async function updateUserMemory(conversation: string) {
  const user = auth.currentUser;
  if (!user) return;

  const currentMemory = await getAIMemory();
  const memoryRef = doc(db, `users/${user.uid}/ai_profile/memory`);

  const prompt = `Analise a conversa abaixo entre um usuário (pastor/líder cristão) e um assistente de IA.
  Extraia e atualize o perfil do usuário incluindo:
  - Traços de personalidade e estilo de comunicação.
  - Contexto teológico ou denominacional (se mencionado).
  - Interesses, desafios ou temas recorrentes.
  - Formas sugeridas de como a IA deve interagir com este usuário específico para ser mais útil.
 
  MEMÓRIA ATUAL:
  ${currentMemory?.traits || 'Nenhuma memória ainda.'}
 
  NOVA CONVERSA:
  ${conversation}
 
  Retorne um resumo textual condensado e direto (máximo 500 palavras) que represente o conhecimento acumulado sobre este usuário. O objetivo é que nas próximas interações a IA saiba "quem" é o usuário.`;

  try {
    const updatedTraits = await callGeminiDirect('generateContent', { 
      prompt,
      config: { responseMimeType: 'text/plain' }
    }, true);
    
    if (updatedTraits) {
      await setDoc(memoryRef, {
        traits: updatedTraits,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
    }
  } catch (err) {
    console.error('Error updating AI memory:', err);
  }
}

async function getMemoryContext(language: string = 'pt') {
  const memory = await getAIMemory();
  if (!memory || !memory.traits) return "";
  
  return language === 'pt' 
    ? `\n\nCONTEXTO PERSONALIZADO DO USUÁRIO (O QUE VOCÊ JÁ APRENDEU SOBRE ELE):\n${memory.traits}\nUse este contexto para tornar suas respostas mais relevantes ao estilo e necessidades deste usuário específico.`
    : `\n\nPERSONALIZED USER CONTEXT (WHAT YOU HAVE LEARNED ABOUT THEM):\n${memory.traits}\nUse this context to make your responses more relevant to this specific user's style and needs.`;
}

// Cache for clients to avoid re-initialization
let systemAiClient: any = null;
let lastUserKey: string | null = null;
let userAiClient: any = null;

function getAiClient(userApiKey?: string) {
  if (userApiKey) {
    if (userApiKey !== lastUserKey || !userAiClient) {
      userAiClient = new GoogleGenAI({ apiKey: userApiKey });
      lastUserKey = userApiKey;
    }
    return { client: userAiClient, isUserKey: true };
  }
  
  if (!systemAiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required.');
    }
    systemAiClient = new GoogleGenAI({ apiKey });
  }
  return { client: systemAiClient, isUserKey: false };
}

// Retry Utility for AI Calls on Client
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const status = error.status || error.code;
      const message = error.message || "";
      
      const isRetryable = 
        status === 503 || 
        status === 429 || 
        message.includes('503') || 
        message.includes('quota') || 
        message.includes('quota_exceeded') || 
        message.includes('high demand') || 
        message.includes('UNAVAILABLE') ||
        message.includes('DEADLINE_EXCEEDED') ||
        message.toLowerCase().includes('rate limit');

      if (isRetryable && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`AI temporary error: ${message}. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function callGeminiDirect(method: 'generateContent' | 'chat', args: any, skipUsage: boolean = false) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  if (!skipUsage) {
    await checkAIUsage();
  }

  // Get user profile to check for custom API key
  let userApiKey = undefined;
  try {
    const profileSnap = await getDoc(doc(db, `users/${user.uid}`));
    if (profileSnap.exists() && profileSnap.data().geminiApiKey) {
      userApiKey = profileSnap.data().geminiApiKey;
    }
  } catch (err) {
    console.error('Error fetching user api key:', err);
  }

  const { client, isUserKey } = getAiClient(userApiKey);
  const DEFAULT_MODEL = 'gemini-3-flash-preview';

  try {
    let resultText = '';

    if (method === 'generateContent') {
      const { prompt, config, audioData } = args;
      let contents;
      
      if (audioData) {
        contents = [
          { text: prompt },
          { inlineData: { mimeType: audioData.mimeType, data: audioData.data } }
        ];
      } else {
        contents = prompt;
      }

      const response = await withRetry(() => client.models.generateContent({
        model: DEFAULT_MODEL,
        contents: contents,
        config: config
      }));
      
      resultText = (response as any).text || '';
    } else if (method === 'chat') {
      const { history, message } = args;
      
      const chat = client.chats.create({
        model: DEFAULT_MODEL,
        history: (history || []).map((h: any) => ({
          role: h.role,
          parts: h.parts?.[0]?.text ? h.parts : [{ text: h.parts }]
        }))
      });
      
      const response = await withRetry(() => (chat.sendMessage({
        message: message
      })));
      
      resultText = (response as any).text || '';
    }

    if (!resultText) {
      throw new Error('Resposta vazia da IA.');
    }

    // Only increment after successful response
    if (!skipUsage) {
      await incrementAIUsage();
    }

    return resultText;
  } catch (err: any) {
    console.error('Gemini Error:', err);
    const msg = (err.message || String(err)).toLowerCase();
    
    const isInvalidKey = 
      msg.includes('api key not valid') || 
      msg.includes('api_key_invalid') ||
      msg.includes('invalid api key') ||
      msg.includes('invalid_argument') && msg.includes('key');

    if (isInvalidKey) {
      if (isUserKey) {
        throw new Error('CHAVE_API_USER_INVALIDA');
      } else {
        throw new Error('CHAVE_API_SISTEMA_INVALIDA');
      }
    }

    if (msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted')) {
      throw new Error('LIMITE_COTA_API');
    }
    if (msg.includes('503') || msg.includes('high demand') || msg.includes('unavailable')) {
      throw new Error('IA_SOBRECARREGADA');
    }
    
    throw err;
  }
}

interface YoutubeTranscriptResponse {
  videoId: string;
  transcript: string | null;
  disabled?: boolean;
  title?: string;
  description?: string;
  author?: string;
  reason?: string;
}

async function extractYoutubeTranscript(url: string): Promise<YoutubeTranscriptResponse | null> {
  try {
    const response = await fetch(`/api/youtube/transcript?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      console.warn(`[YouTube] Failed to fetch transcript from API: ${response.statusText}`);
      return null;
    }
    const data = await response.json();
    return data;
  } catch (err) {
    console.error(`[YouTube] Error calling transcript API:`, err);
    return null;
  }
}

export async function generateSermonOutline(params: {
  theme?: string;
  passage?: string;
  audience?: string;
  style: 'expositivo' | 'tematico' | 'narrativo';
  language?: string;
  videoUrl?: string;
  bibleVersion?: string;
}) {
  const lang = params.language || 'pt';
  const langContext = lang === 'en' ? 'English' : lang === 'es' ? 'Spanish' : 'Portuguese';
  const memoryContext = await getMemoryContext(lang);
  const version = params.bibleVersion || 'NVI';

  let transcriptPromptText = '';
  if (params.videoUrl) {
    try {
      const data = await extractYoutubeTranscript(params.videoUrl);
      if (data) {
        if (data.transcript) {
          transcriptPromptText = `\nCRITICAL CONTEXT - RAW TRANSCRIPT FROM THE VIDEO SOURCE:\n"""\n${data.transcript}\n"""\n\nYou MUST review this entire transcript and structure your sermon outline to match its core teaching, key talking points, illustrations used, and overall message. Priority must be strictly given to this transcript's theology, lessons, structure, ideas, and message.`;
        } else if (data.disabled) {
          transcriptPromptText = `\nCRITICAL CONTEXT - THE VIDEO TRANSCRIPT IS DISABLED FOR THIS VIDEO. However, we have successfully extracted the video details listed below:
Video URL: "https://www.youtube.com/watch?v=${data.videoId}"
Video Title: "${data.title || 'Not specified'}"
Video Author/Channel: "${data.author || 'Not specified'}"
Video Description: "${data.description || 'Not specified'}"

Since direct paragraph/audio transcripts are disabled for this YouTube video, you MUST use your Google Search grounding tool to search for details on this specific video URL ("https://www.youtube.com/watch?v=${data.videoId}") or search queries like "${data.title || ''} ${data.author || ''}" to learn about the sermon's transcript, outline, summary, or core points. Craft your sermon outline to match its core theology, structure, key illustrations, and lessons.`;
        }
      } else {
        transcriptPromptText = `\nNo raw transcript could be retrieved directly for the video link (${params.videoUrl}). Please use the Google Search tool to search for details about this video, or fall back to default theological patterns aligning with the theme/passage.`;
      }
    } catch (e) {
      console.error('Error fetching youtube transcript for outline generation:', e);
    }
  }

  const prompt = `You are a high-level homiletical assistant. Generate a biblical sermon outline based on the Following inputs.
  
  CRITICAL SOURCE: If a "Related Video Content" URL is provided below, you MUST prioritize its content. Use your specialized tools (Google Search) to identify the core message, main points, and tone of that video if possible, and base this outline on that specific teaching.
  ${transcriptPromptText}
  
  Theme: ${params.theme || 'Not specified'}
  Biblical Text: ${params.passage || 'Not specified'}
  Bible Version for Citations: ${version}
  Target Audience: ${params.audience || 'General'}
  Style: ${params.style}
  Related Video Content (PRIORITY): ${params.videoUrl || 'None provided'}
  ${memoryContext}
  
  LANGUAGE: ${langContext}. You MUST return the entire outline in ${langContext}.
  
  The outline should be structured in Markdown with these sections (translated to ${langContext}):
  - Impactful Title (Based on the video's theme)
  - Base Text (CITATIONS MUST BE FROM ${version})
  - Introduction (Include a brief mention of the inspiration from the video)
  - Main Topics (Development - Derived from the video/theme)
  - Suggested Illustrations
  - Practical Application
  - Conclusion
  - Complementary Verses (CITATIONS MUST BE FROM ${version})
  
  FORMATTING RULES (MANDATORY):
  1. For biblical references and verses, use blockquotes with "> " to highlight the sacred text.
  2. NEVER include references like "(v. 1)" or "(v. 7)" outside the blockquotes.
  3. ALWAYS provide the COMPLETE biblical reference (Book, Chapter, and Verses) and the version/translation used at the end of the citation (e.g., - John 3:16, ${version}).
  4. If there is more than one verse, put the verse number in bold before the text (e.g., **1** Verse text).
  5. Use bold ONLY for verse numbers and extremely important terms. DO NOT use bold for the full biblical text.
  6. Use blockquotes ("> ") for the biblical text.
  7. CRITICAL: Start the response directly with the Title. DO NOT include any introductory greetings, conversational fillers, or meta-commentary (e.g., 'Sure, here is your outline...').`;

  const config: any = {};
  if (params.videoUrl) {
    config.tools = [{ googleSearch: {} }];
    config.toolConfig = { includeServerSideToolInvocations: true };
  }

  return await callGeminiDirect('generateContent', { prompt, config });
}

export async function fetchBiblePassage(reference: string, version: string = 'NVI', language: string = 'pt') {
  const langContext = language === 'en' ? 'English' : language === 'es' ? 'Spanish' : 'Portuguese';
  const prompt = `Act as a highly accurate Bible API. Provide the EXACT biblical text for the reference "${reference}" in the translation "${version}".
  
  CONTEXT: The user's current interface language is ${langContext}. 
  
  CRITICAL RULES:
  1. The biblical text (verses) MUST strictly follow the requested translation "${version}". If "${version}" is an English translation (like NIV, KJV, ESV), the text MUST be in English.
  2. Return the labels (like the "reference" field) in ${langContext}.
  3. Do not paraphrase. Use the literal text of the "${version}" translation.
  4. Maintain original punctuation and formatting.
  
  Return a strict JSON object with:
  {
    "reference": "Full formatted reference in ${langContext} (e.g. John 3:16-17)",
    "chapterTotalVerses": number, // The total number of verses present in that entire chapter of the book searched (e.g. if the user search for 'John 3:16-17', enter 36 because John Chapter 3 contains 36 verses in total).
    "verses": [
      { "n": number, "text": "Literal verse text" }
    ]
  }`;

  const result = await callGeminiDirect('generateContent', { 
    prompt,
    config: { responseMimeType: 'application/json' }
  }, true);

  if (!result) return null;
  const jsonStr = result.substring(result.indexOf('{'), result.lastIndexOf('}') + 1);
  return JSON.parse(jsonStr || result);
}

export async function suggestThemes(language: string = 'pt') {
  const langContext = language === 'en' ? 'English' : language === 'es' ? 'Spanish' : 'Portuguese';
  const prompt = `Suggest 5 topics for sermons based on current Christian trends and upcoming commemorative dates.
  LANGUAGE: ${langContext}. Return the topics in ${langContext}.
  Return JSON with an array of strings.`;

  const result = await callGeminiDirect('generateContent', { 
    prompt,
    config: { responseMimeType: 'application/json' }
  }, true);

  const jsonStr = result.substring(result.indexOf('['), result.lastIndexOf(']') + 1);
  return JSON.parse(jsonStr || result);
}

export async function refineSermonOutline(currentOutline: string, instruction: string, language: string = 'pt', videoUrl?: string, bibleVersion: string = 'NVI') {
  const langContext = language === 'en' ? 'English' : language === 'es' ? 'Spanish' : 'Portuguese';
  const memoryContext = await getMemoryContext(language);

  let transcriptPromptText = '';
  if (videoUrl) {
    try {
      const data = await extractYoutubeTranscript(videoUrl);
      if (data) {
        if (data.transcript) {
          transcriptPromptText = `\nCRITICAL CONTEXT - RAW TRANSCRIPT FROM THE VIDEO SOURCE:\n"""\n${data.transcript}\n"""\n\nYou MUST keep consistency with this transcript of the video when refining or modifying the outline.`;
        } else if (data.disabled) {
          transcriptPromptText = `\nCRITICAL CONTEXT - THE VIDEO TRANSCRIPT IS DISABLED. Use the video details below and your Google Search tool to maintain consistency with its teaching:
Video URL: "https://www.youtube.com/watch?v=${data.videoId}"
Video Title: "${data.title || 'Not specified'}"
Video Author/Channel: "${data.author || 'Not specified'}"
Video Description: "${data.description || 'Not specified'}"`;
        }
      }
    } catch (e) {
      console.error('Error fetching youtube transcript for outline refinement:', e);
    }
  }

  const prompt = `You are an experienced homiletical assistant. 
  ${memoryContext}
  
  SOURCE CONTEXT: ${videoUrl ? `This sermon is based on or related to this video: ${videoUrl}. Maintain consistency with its teaching.` : 'No specific video source.'}
  ${transcriptPromptText}
  Bible Version for Citations: ${bibleVersion}

  CURRENT OUTLINE:
  ${currentOutline}
  
  USER REQUEST:
  "${instruction}"
  
  LANGUAGE: ${langContext}. You MUST return the updated outline in ${langContext}.
  
  Rules:
  1. Maintain the Markdown structure.
  2. Adjust the outline according to the request, maintaining biblical coherence.
  3. Highlight verses with blockquotes ("> ") and ALWAYS provide the COMPLETE biblical reference (Book, Chapter, and Verses) and the version used (e.g., - John 3:16, ${bibleVersion}).
  4. NEVER use references like "(v. 7)" outside the blockquotes.
  5. For multiple verses, use bold numbers: **1** Text... **2** Text...
  6. DO NOT use bold for the full biblical text, only for verse numbers.
  7. Return only the new complete outline in Markdown. DO NOT include any greetings or introductory text. Start directly with the adjusted content.`;

  const config: any = {};
  if (videoUrl) {
    config.tools = [{ googleSearch: {} }];
    config.toolConfig = { includeServerSideToolInvocations: true };
  }

  return await callGeminiDirect('generateContent', { prompt, config });
}

export async function chatWithAI(history: { role: 'user' | 'model', parts: string }[], message: string, language: string = 'pt') {
  const langContext = language === 'en' ? 'English' : language === 'es' ? 'Spanish' : 'Portuguese';
  const memoryContext = await getMemoryContext(language);
  const systemPrompt = `You are a helpful and enlightened Christian theological assistant.
  Your goal is to answer questions, provide biblical insights, offer pastoral encouragement, and assist with any doubts the user may have.
  You can discuss theology, church history, practical Christian living, and biblical interpretation.
  ${memoryContext}
  
  LANGUAGE: ${langContext}. You MUST respond in ${langContext}.
  
  Rules:
  1. Be respectful, encouraging, and biblically sound.
  2. Be SUCCINCT and OBJECTIVE in your answers. Avoid unnecessary long introductions or repetitive conclusions.
  3. If the user asks for a sermon outline, you can provide one using Markdown.
  4. Use blockquotes ("> ") for biblical verses.
  5. Always cite the reference and version.
  6. If you don't know an answer, honestly state that it's a profound or debated topic.
  7. CRITICAL: DO NOT include ANY greetings, warm welcomes, or introductory phrases (e.g., 'Hello', 'I can help with that', or 'Here is your answer'). Start the content of your response immediately and objectively.`;

  const geminiHistory = history.map(h => ({
    role: h.role === 'model' ? 'model' : 'user',
    parts: [{ text: h.parts }]
  }));

  return await callGeminiDirect('chat', { 
    history: [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Compreendido. Estou pronto para fornecer assistência teológica objetiva e direta." }] },
      ...geminiHistory
    ],
    message 
  });
}

export async function generateDailyInspiration(language: string = 'pt') {
  const langContext = language === 'en' ? 'English' : language === 'es' ? 'Spanish' : 'Portuguese';
  const prompt = `Generate a unique "Verse of the Day" and its corresponding "Daily Reflection" for a Christian pastor or minister.
  
  LANGUAGE: ${langContext}.
  
  RULES:
  1. The verse should be inspiring and relevant for ministry or spiritual growth.
  2. The reflection should be short (max 2-3 sentences), encouraging, and practical.
  3. The biblical text MUST strictly follow a common translation in that language (NVI for Portuguese, NIV for English, RVR for Spanish).
  
  Return a strict JSON object with:
  {
    "verse": {
      "ref": "Full formatted reference (e.g. John 3:16)",
      "text": "Literal verse text"
    },
    "reflection": "Reflection text"
  }`;

  const result = await callGeminiDirect('generateContent', { 
    prompt,
    config: { responseMimeType: 'application/json' }
  }, true);

  const jsonStr = result.substring(result.indexOf('{'), result.lastIndexOf('}') + 1);
  return JSON.parse(jsonStr || result);
}

export async function transcribeAudio(base64Data: string, mimeType: string = 'audio/webm') {
  return await callGeminiDirect('generateContent', {
    prompt: "Transcreva este áudio de uma ministração bíblica com precisão, mantendo a pontuação e parágrafos.",
    audioData: {
      mimeType,
      data: base64Data
    }
  });
}
