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

  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method,
        args,
        userApiKey
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.text) {
      throw new Error('Resposta vazia da IA.');
    }

    // Only increment after successful response
    if (!skipUsage) {
      await incrementAIUsage();
    }

    return data.text;
  } catch (err: any) {
    console.error('Gemini Proxy Error:', err);
    const msg = err.message || String(err);
    if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resource_exhausted')) {
      throw new Error('LIMITE_COTA_API');
    }
    if (msg.includes('503') || msg.toLowerCase().includes('high demand') || msg.toLowerCase().includes('unavailable')) {
      throw new Error('IA_SOBRECARREGADA');
    }
    throw err;
  }
}

export async function generateSermonOutline(params: {
  theme?: string;
  passage?: string;
  audience?: string;
  style: 'expositivo' | 'tematico' | 'narrativo';
  language?: string;
  videoUrl?: string;
}) {
  const lang = params.language || 'pt';
  const langContext = lang === 'en' ? 'English' : lang === 'es' ? 'Spanish' : 'Portuguese';
  const memoryContext = await getMemoryContext(lang);

  const prompt = `You are a high-level homiletical assistant. Generate a biblical sermon outline based on the Following inputs.
  
  CRITICAL SOURCE: If a "Related Video Content" URL is provided below, you MUST prioritize its content. Use your specialized tools (Google Search) to identify the core message, main points, and tone of that video if possible, and base this outline on that specific teaching.
  
  Theme: ${params.theme || 'Not specified'}
  Biblical Text: ${params.passage || 'Not specified'}
  Target Audience: ${params.audience || 'General'}
  Style: ${params.style}
  Related Video Content (PRIORITY): ${params.videoUrl || 'None provided'}
  ${memoryContext}
  
  LANGUAGE: ${langContext}. You MUST return the entire outline in ${langContext}.
  
  The outline should be structured in Markdown with these sections (translated to ${langContext}):
  - Impactful Title (Based on the video's theme)
  - Base Text
  - Introduction (Include a brief mention of the inspiration from the video)
  - Main Topics (Development - Derived from the video/theme)
  - Suggested Illustrations
  - Practical Application
  - Conclusion
  - Complementary Verses
  
  FORMATTING RULES (MANDATORY):
  1. For biblical references and verses, use blockquotes with "> " to highlight the sacred text.
  2. NEVER include references like "(v. 1)" or "(v. 7)" outside the blockquotes.
  3. ALWAYS provide the COMPLETE biblical reference (Book, Chapter, and Verses) and the version/translation used at the end of the citation (e.g., - John 3:16, NVI).
  4. If there is more than one verse, put the verse number in bold before the text (e.g., **1** Verse text).
  5. Use bold ONLY for verse numbers and extremely important terms. DO NOT use bold for the full biblical text.
  6. Use blockquotes ("> ") for the biblical text.`;

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

export async function refineSermonOutline(currentOutline: string, instruction: string, language: string = 'pt', videoUrl?: string) {
  const langContext = language === 'en' ? 'English' : language === 'es' ? 'Spanish' : 'Portuguese';
  const memoryContext = await getMemoryContext(language);
  const prompt = `You are an experienced homiletical assistant. 
  ${memoryContext}
  
  SOURCE CONTEXT: ${videoUrl ? `This sermon is based on or related to this video: ${videoUrl}. Maintain consistency with its teaching.` : 'No specific video source.'}

  CURRENT OUTLINE:
  ${currentOutline}
  
  USER REQUEST:
  "${instruction}"
  
  LANGUAGE: ${langContext}. You MUST return the updated outline in ${langContext}.
  
  Rules:
  1. Maintain the Markdown structure.
  2. Adjust the outline according to the request, maintaining biblical coherence.
  3. Highlight verses with blockquotes ("> ") and ALWAYS provide the COMPLETE biblical reference (Book, Chapter, and Verses) and the version used (e.g., - John 3:16, NVI).
  4. NEVER use references like "(v. 7)" outside the blockquotes.
  5. For multiple verses, use bold numbers: **1** Text... **2** Text...
  6. DO NOT use bold for the full biblical text, only for verse numbers.
  7. Return only the new complete outline in Markdown.`;

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
  6. If you don't know an answer, honestly state that it's a profound or debated topic.`;

  const geminiHistory = history.map(h => ({
    role: h.role === 'model' ? 'model' : 'user',
    parts: [{ text: h.parts }]
  }));

  return await callGeminiDirect('chat', { 
    history: [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "I understand. I am ready to assist you with theological questions, biblical study, and pastoral support. How can I help you today?" }] },
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
