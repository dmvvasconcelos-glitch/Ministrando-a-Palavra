import { useState, useMemo, useEffect, useRef } from 'react';
import { Sparkles, Send, RefreshCw, Layers, Users, BookMarked, Wand2, TrendingUp, Calendar, Trash2, ArrowRight, MessageSquare, Bot, ChevronDown, AlertCircle, Info, BrainCircuit, History, Plus, Video } from 'lucide-react';
import { generateSermonOutline, refineSermonOutline, suggestThemes, chatWithAI, getAIUsageCount, MAX_INDIVIDUAL_AI_REQUESTS, MAX_SHARED_AI_REQUESTS, updateUserMemory } from '../services/gemini';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '../contexts/LanguageContext';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';

import { UserProfile } from '../types';

interface AIAssistantProps {
  onApplyOutline: (content: string) => void;
  profile: UserProfile | null;
}

interface StoredChat {
  id: string;
  title: string;
  messages: { role: 'user' | 'model'; content: string }[];
  updatedAt: any;
}

interface StoredOutline {
  id: string;
  title: string;
  content: string;
  params: {
    theme: string;
    passage: string;
    audience: string;
    style: string;
  };
  updatedAt: any;
}

export default function AIAssistant({ onApplyOutline, profile }: AIAssistantProps) {
  const { t, language } = useLanguage();
  const [mode, setMode] = useState<'sermon' | 'chat'>('sermon');
  const [usageCount, setUsageCount] = useState(0);
  const [showUsageAlert, setShowUsageAlert] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('ai_theme') || '');
  const [videoUrl, setVideoUrl] = useState(() => localStorage.getItem('ai_video_url') || '');
  const [passage, setPassage] = useState(() => localStorage.getItem('ai_passage') || '');
  const [audience, setAudience] = useState(() => localStorage.getItem('ai_audience') || '');
  const [style, setStyle] = useState<'expositivo' | 'tematico' | 'narrativo'>(() => (localStorage.getItem('ai_style') as any) || 'expositivo');
  const [outline, setOutline] = useState<string | null>(() => localStorage.getItem('ai_outline'));
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; content: string }[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [pastChats, setPastChats] = useState<StoredChat[]>([]);
  const [pastOutlines, setPastOutlines] = useState<StoredOutline[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [refining, setRefining] = useState(false);
  const [dailySuggestions, setDailySuggestions] = useState<string[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);
  const [isLearning, setIsLearning] = useState(false);
  const outlineEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastProcessedChatLength = useRef(0);
  const lastProcessedOutline = useRef<string | null>(null);

  const currentLimit = profile?.geminiApiKey ? MAX_INDIVIDUAL_AI_REQUESTS : MAX_SHARED_AI_REQUESTS;

  // Background learning process
  useEffect(() => {
    const learnFromInteractions = async () => {
      let contentToLearn = '';

      // Check if chat history grew significantly (e.g. 2 new messages - user + bot)
      if (chatMessages.length >= lastProcessedChatLength.current + 2) {
        const newMessages = chatMessages.slice(lastProcessedChatLength.current);
        contentToLearn += newMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
        lastProcessedChatLength.current = chatMessages.length;
      }

      // Check if outline was generated/changed
      if (outline && outline !== lastProcessedOutline.current) {
         contentToLearn += `\nCONTEÚDO ESTRUTURADO/ESBOÇO:\n${outline}`;
         lastProcessedOutline.current = outline;
      }

      if (contentToLearn) {
        setIsLearning(true);
        try {
          await updateUserMemory(contentToLearn);
        } finally {
          setIsLearning(false);
          updateUsage();
        }
      }
    };

    const timer = setTimeout(learnFromInteractions, 10000); // 10s debounce for background learning
    return () => clearTimeout(timer);
  }, [chatMessages, outline]);

  // Fetch past chats history (last 10)
  useEffect(() => {
    if (!auth.currentUser) return;

    const chatsRef = collection(db, `users/${auth.currentUser.uid}/chats`);
    const q = query(chatsRef, orderBy('updatedAt', 'desc'), limit(10));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StoredChat[];
      setPastChats(chats);
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  // Fetch past outlines history (last 10)
  useEffect(() => {
    if (!auth.currentUser) return;

    const outlinesRef = collection(db, `users/${auth.currentUser.uid}/outlines`);
    const q = query(outlinesRef, orderBy('updatedAt', 'desc'), limit(10));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const outlines = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StoredOutline[];
      setPastOutlines(outlines);
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  // Load active chat messages
  useEffect(() => {
    if (!activeChatId || !auth.currentUser) {
      // If no active chat, check local storage for temporary session only if no chatId set
      if (!activeChatId) {
        const saved = localStorage.getItem('ai_chat_messages');
        if (saved) {
          try {
            setChatMessages(JSON.parse(saved));
          } catch (e) {
            console.error('Error parsing local chat messages', e);
          }
        }
      }
      return;
    }

    const loadChat = async () => {
      const docRef = doc(db, `users/${auth.currentUser!.uid}/chats`, activeChatId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        setChatMessages(data.messages || []);
      }
    };
    loadChat();
  }, [activeChatId, auth.currentUser]);

  // Load active outline
  useEffect(() => {
    if (!activeOutlineId || !auth.currentUser) return;

    const loadOutline = async () => {
      const docRef = doc(db, `users/${auth.currentUser!.uid}/outlines`, activeOutlineId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        setOutline(data.content);
        if (data.params) {
          setTheme(data.params.theme || '');
          setPassage(data.params.passage || '');
          setAudience(data.params.audience || '');
          setStyle(data.params.style || 'expositivo');
          setVideoUrl(data.params.videoUrl || '');
        }
      }
    };
    loadOutline();
  }, [activeOutlineId, auth.currentUser]);

  // Save chat to Firestore
  const saveChatToFirestore = async (messages: { role: 'user' | 'model'; content: string }[], forcedId?: string) => {
    if (!auth.currentUser || messages.length === 0) return activeChatId;

    let chatId = forcedId || activeChatId;
    let title = '';

    if (!chatId) {
      chatId = `chat_${Date.now()}`;
      setActiveChatId(chatId);
      // Use the first user message as title
      const firstUserMsg = messages.find(m => m.role === 'user')?.content || 'Nova Conversa';
      title = firstUserMsg.substring(0, 40) + (firstUserMsg.length > 40 ? '...' : '');
    }

    const chatRef = doc(db, `users/${auth.currentUser.uid}/chats`, chatId);
    
    // Only update title if it's new
    const updateData: any = {
      messages,
      updatedAt: serverTimestamp()
    };

    if (title) updateData.title = title;

    await setDoc(chatRef, updateData, { merge: true });
    return chatId;
  };

  // Save outline to Firestore
  const saveOutlineToFirestore = async (content: string, params: any, forcedId?: string) => {
    if (!auth.currentUser || !content) return activeOutlineId;

    let outlineId = forcedId || activeOutlineId;
    let title = params.theme || params.passage || 'Novo Esboço';
    if (title.length > 40) title = title.substring(0, 40) + '...';

    if (!outlineId) {
      outlineId = `outline_${Date.now()}`;
      setActiveOutlineId(outlineId);
    }

    const outlineRef = doc(db, `users/${auth.currentUser.uid}/outlines`, outlineId);
    
    await setDoc(outlineRef, {
      title,
      content,
      params,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return outlineId;
  };

  // Fetch initial usage
  useEffect(() => {
    const fetchUsage = async () => {
      const count = await getAIUsageCount();
      setUsageCount(count);
    };
    if (auth.currentUser) {
      fetchUsage();
    }
  }, [auth.currentUser]);

  const updateUsage = async () => {
    const count = await getAIUsageCount();
    setUsageCount(count);
  };

  const handleError = (error: any, type: 'outline' | 'chat' | 'refine') => {
    const rawMsg = error?.message || String(error);
    const msg = rawMsg.includes('LIMITE_EXCEDIDO') ? 'LIMITE_EXCEDIDO' : 
                rawMsg.includes('LIMITE_COTA_API') ? 'LIMITE_COTA_API' : 
                rawMsg.includes('IA_SOBRECARREGADA') ? 'IA_SOBRECARREGADA' : rawMsg;

    if (msg === 'LIMITE_EXCEDIDO') {
      setShowUsageAlert(true);
      return;
    }

    if (msg === 'LIMITE_COTA_API') {
      alert(t('sharedQuotaInfo'));
      return;
    }

    if (msg === 'IA_SOBRECARREGADA') {
      alert(t('aiOverloaded'));
      return;
    }
    
    const prefix = language === 'pt' 
      ? (type === 'outline' ? 'Erro ao gerar esboço' : type === 'chat' ? 'Erro no Chat' : 'Erro ao ajustar esboço')
      : (type === 'outline' ? 'Error generating outline' : type === 'chat' ? 'Chat Error' : 'Error adjusting outline');
      
    alert(`${prefix}: ${msg}`);
  };

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (!showClearConfirm) {
      if (theme) localStorage.setItem('ai_theme', theme);
      if (videoUrl) localStorage.setItem('ai_video_url', videoUrl);
      if (passage) localStorage.setItem('ai_passage', passage);
      if (audience) localStorage.setItem('ai_audience', audience);
      if (style) localStorage.setItem('ai_style', style);
      if (outline) {
        localStorage.setItem('ai_outline', outline);
      } else {
        localStorage.removeItem('ai_outline');
      }
      
      // Only store messages locally if no persistent chat is active
      if (!activeChatId) {
        localStorage.setItem('ai_chat_messages', JSON.stringify(chatMessages));
      } else {
        localStorage.removeItem('ai_chat_messages');
      }
    }
  }, [theme, passage, audience, style, outline, chatMessages, showClearConfirm, activeChatId]);

  // Daily suggestions logic
  useEffect(() => {
    const fetchDaily = async () => {
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = `ai_daily_suggestions_${language}`;
      const cached = localStorage.getItem(cacheKey);
      const cachedDate = localStorage.getItem(`ai_daily_date_${language}`);

      if (cached && cachedDate === today) {
        setDailySuggestions(JSON.parse(cached).slice(0, 5));
      } else {
        try {
          const themes = await suggestThemes(language);
          const limitedThemes = themes.slice(0, 5);
          setDailySuggestions(limitedThemes);
          localStorage.setItem(cacheKey, JSON.stringify(limitedThemes));
          localStorage.setItem(`ai_daily_date_${language}`, today);
          updateUsage();
        } catch (error) {
          console.error('Error fetching daily suggestions:', error);
        }
      }
    };
    fetchDaily();
  }, [language]);

  const seasonalSuggestions = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const day = now.getDate();
    const suggestions = [];
    const seasonalTrans = t('seasonalSuggestions') as unknown as { label: string, value: string }[];

    if (month === 2 || (month === 3 && day <= 15)) {
      suggestions.push({ ...seasonalTrans[0], icon: Calendar });
    }
    if (month === 5) {
      suggestions.push({ ...seasonalTrans[1], icon: Calendar });
    }
    if (month === 7) {
      suggestions.push({ ...seasonalTrans[2], icon: Calendar });
    }
    if (month === 11) {
      suggestions.push({ ...seasonalTrans[3], icon: Calendar });
    }

    return suggestions;
  }, [t]);

  const handleGenerate = async () => {
    if (!theme && !passage) return;
    setLoading(true);
    try {
      const result = await generateSermonOutline({ theme, passage, audience, style, language, videoUrl });
      if (!result) throw new Error('Empty response');
      setOutline(result);
      
      const params = { theme, passage, audience, style, videoUrl };
      await saveOutlineToFirestore(result, params);

      // Scroll to result
      setTimeout(() => {
        outlineEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
      updateUsage();
    } catch (error: any) {
      console.error('Assistant Error:', error);
      handleError(error, 'outline');
    } finally {
      setLoading(false);
    }
  };

  const handleChatAction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || loading || refining) return;

    const instruction = chatInput;
    setChatInput('');
    
    if (mode === 'chat') {
      setRefining(true);
      const newMessages = [...chatMessages, { role: 'user' as const, content: instruction }];
      setChatMessages(newMessages);
      try {
        const history = chatMessages.map(m => ({
          role: m.role === 'user' ? 'user' as const : 'model' as const,
          parts: m.content
        }));
        const response = await chatWithAI(history, instruction, language);
        if (response) {
          const updatedMessages = [...newMessages, { role: 'model' as const, content: response }];
          setChatMessages(updatedMessages);
          await saveChatToFirestore(updatedMessages);
        }
        updateUsage();
      } catch (error: any) {
        console.error('Chat error:', error);
        handleError(error, 'chat');
      } finally {
        setRefining(false);
      }
      return;
    }

    if (!outline) {
      // First time generation via chat
      setLoading(true);
      try {
        const result = await generateSermonOutline({ 
          theme: instruction, 
          passage, 
          audience, 
          style,
          language
        });
        if (result) {
          setOutline(result);
          const params = { theme: instruction, passage, audience, style };
          await saveOutlineToFirestore(result, params);
        }
        updateUsage();
      } catch (error: any) {
        console.error(error);
        handleError(error, 'outline');
      } finally {
        setLoading(false);
      }
    } else {
      // Refinement
      setRefining(true);
      try {
        const result = await refineSermonOutline(outline, instruction, language, videoUrl);
        if (result) {
          setOutline(result);
          const params = { theme, passage, audience, style };
          await saveOutlineToFirestore(result, params);
        }
        updateUsage();
      } catch (error: any) {
        console.error('Refine error:', error);
        handleError(error, 'refine');
      } finally {
        setRefining(false);
      }
    }
  };

  const handleClear = () => {
    setTheme('');
    setVideoUrl('');
    setPassage('');
    setAudience('');
    setStyle('expositivo');
    setOutline(null);
    setChatInput('');
    setChatMessages([]);
    setActiveChatId(null);
    setActiveOutlineId(null);
    localStorage.removeItem('ai_theme');
    localStorage.removeItem('ai_video_url');
    localStorage.removeItem('ai_passage');
    localStorage.removeItem('ai_audience');
    localStorage.removeItem('ai_style');
    localStorage.removeItem('ai_outline');
    localStorage.removeItem('ai_chat_messages');
    setShowClearConfirm(false);
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setChatMessages([]);
    localStorage.removeItem('ai_chat_messages');
    setShowHistory(false);
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setShowHistory(false);
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!auth.currentUser) return;

    if (deleteConfirmId !== chatId) {
      setDeleteConfirmId(chatId);
      return;
    }

    try {
      await deleteDoc(doc(db, `users/${auth.currentUser.uid}/chats`, chatId));
      if (activeChatId === chatId) {
        handleNewChat();
      }
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Error deleting chat:', err);
    }
  };

  const handleNewOutline = () => {
    setActiveOutlineId(null);
    setOutline(null);
    setTheme('');
    setPassage('');
    localStorage.removeItem('ai_outline');
    setShowHistory(false);
  };

  const handleSelectOutline = (outlineId: string) => {
    setActiveOutlineId(outlineId);
    setShowHistory(false);
  };

  const handleDeleteOutline = async (e: React.MouseEvent, outlineId: string) => {
    e.stopPropagation();
    if (!auth.currentUser) return;

    if (deleteConfirmId !== outlineId) {
      setDeleteConfirmId(outlineId);
      return;
    }

    try {
      await deleteDoc(doc(db, `users/${auth.currentUser.uid}/outlines`, outlineId));
      if (activeOutlineId === outlineId) {
        handleNewOutline();
      }
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Error deleting outline:', err);
    }
  };

  const handleClearHistory = async () => {
    if (!auth.currentUser) return;
    
    if (!showClearHistoryConfirm) {
      setShowClearHistoryConfirm(true);
      return;
    }

    try {
      const collectionName = mode === 'chat' ? 'chats' : 'outlines';
      const items = mode === 'chat' ? [...pastChats] : [...pastOutlines];
      
      for (const item of items) {
        await deleteDoc(doc(db, `users/${auth.currentUser.uid}/${collectionName}`, item.id));
      }

      if (mode === 'chat') {
        handleNewChat();
      } else {
        handleNewOutline();
      }
      setShowClearHistoryConfirm(false);
    } catch (err) {
      console.error('Error clearing history:', err);
    }
  };

  return (
    <div className="space-y-8">
      <AnimatePresence>
        {showUsageAlert && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUsageAlert(false)}
              className="absolute inset-0 bg-[#020617]/90 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="frosted-glass border-red-500/30 bg-red-500/10 p-8 rounded-[32px] max-w-sm w-full shadow-2xl relative overflow-hidden text-center z-10"
            >
              <div className="w-20 h-20 bg-red-500/20 rounded-3xl flex items-center justify-center text-red-500 border border-red-500/30 mx-auto mb-6">
                <AlertCircle size={40} />
              </div>
              <div className="space-y-4">
                <h3 className="text-2xl font-bold text-red-100 italic font-serif">
                  {t('individualLimitReached')}
                </h3>
                <p className="text-base text-red-200/70 font-medium leading-relaxed font-serif">
                  {t('individualLimitBody').replace('{count}', currentLimit.toString())}
                </p>
                <div className="pt-4">
                  <button
                    onClick={() => setShowUsageAlert(false)}
                    className="w-full py-4 bg-red-500 text-white rounded-2xl text-sm font-bold hover:bg-red-600 transition-all shadow-xl shadow-red-500/20 uppercase tracking-widest"
                  >
                    {t('understood')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <header className="text-center max-w-2xl mx-auto space-y-4">
        <div className="inline-flex p-3 bg-app-accent/10 rounded-2xl text-app-accent border border-app-accent/20">
          <Sparkles size={32} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-app-text transition-colors">{t('aiAssistantHeader')}</h1>
        <p className="text-app-secondary font-medium leading-relaxed">
          {mode === 'sermon' ? t('aiAssistantSub') : (t('aiAssistantGeneralSub') || 'Converse com a IA para tirar dúvidas, estudar temas ou buscar inspiração teológica.')}
        </p>

        {/* Key and Quota Status */}
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex flex-wrap items-center justify-center gap-4">
            {/* Individual Key Status */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${profile?.geminiApiKey ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-500'}`}>
              <div className={`w-2 h-2 rounded-full ${profile?.geminiApiKey ? 'bg-green-400 animate-pulse' : 'bg-amber-500 shadow-[0_0_8px_orange]'}`} />
              {profile?.geminiApiKey 
                ? t('individualLimitActive')
                : t('usingSharedQuota')}
            </div>

            {/* Usage Progress */}
            <div className="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
              <div className="flex items-center gap-2">
                <TrendingUp size={12} className="text-app-accent" />
                <span className="text-[10px] font-black text-app-secondary uppercase tracking-tighter">
                  {usageCount}/{currentLimit}
                </span>
              </div>
              <div className="w-20 h-1 bg-white/10 rounded-full overflow-hidden relative">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(usageCount / currentLimit) * 100}%` }}
                  className={`h-full ${usageCount >= currentLimit ? 'bg-red-500' : 'bg-app-accent'}`}
                />
                {isLearning && (
                  <motion.div 
                    className="absolute inset-y-0 left-0 bg-white/40 w-4 shadow-[0_0_10px_white]"
                    animate={{ x: ['0%', '200%'] }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Tip to configure key if not set */}
          {!profile?.geminiApiKey && (
            <motion.div 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md bg-amber-500/5 border border-amber-500/10 p-3 rounded-2xl flex items-start gap-3"
            >
              <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-[9px] text-amber-200/60 leading-relaxed font-medium">
                  {t('sharedQuotaTip')}
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {isLearning && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full w-fit mx-auto mt-2"
          >
            <BrainCircuit size={10} className="text-cyan-400 animate-pulse" />
            <span className="text-[8px] font-black uppercase text-cyan-400 tracking-widest">
              {t('assistantLearning')}
            </span>
          </motion.div>
        )}

        {/* Mode Toggle */}
        <div className="flex justify-center mt-6">
          <div className="bg-white/5 border border-white/10 p-1 rounded-2xl flex items-center gap-1">
            <button
              onClick={() => setMode('sermon')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${mode === 'sermon' ? 'bg-app-accent text-white shadow-lg' : 'text-app-secondary hover:text-app-text hover:bg-white/5'}`}
            >
              <Wand2 size={16} />
              {t('sermonMode') || 'Gerar Esboço'}
            </button>
            <button
              onClick={() => setMode('chat')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${mode === 'chat' ? 'bg-app-accent text-white shadow-lg' : 'text-app-secondary hover:text-app-text hover:bg-white/5'}`}
            >
              <MessageSquare size={16} />
              {t('chatMode') || 'Modo Conversa'}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-8">
        {/* Input Form / Info Column */}
        {mode === 'sermon' ? (
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleGenerate();
            }}
            className="frosted-glass p-8 rounded-[32px] shadow-2xl space-y-8 border border-white/5"
          >
            {/* Primary Section: Theme & Topic & Video */}
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-app-accent uppercase tracking-widest flex items-center gap-2">
                      <Layers size={14} /> {t('aiThemeLabel')}
                    </label>
                    <span className="text-[9px] text-app-secondary/50 font-medium italic">{language === 'pt' ? 'Obrigatório' : 'Required'}</span>
                  </div>
                  <div className="relative group">
                    <input 
                      type="text"
                      placeholder={t('aiThemePlaceholder')}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:ring-2 focus:ring-app-accent/20 focus:border-app-accent outline-none text-app-text transition-all placeholder:text-app-secondary/30 text-lg font-serif"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-focus-within:opacity-100 transition-opacity">
                      <Sparkles size={18} className="text-app-accent/40 animate-pulse" />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-app-accent uppercase tracking-widest flex items-center gap-2">
                      <Video size={14} /> {language === 'pt' ? 'Link do Vídeo' : 'Video Link'}
                    </label>
                    <span className="text-[9px] text-app-secondary/50 font-medium italic">{language === 'pt' ? 'Opcional' : 'Optional'}</span>
                  </div>
                  <div className="relative group">
                    <input 
                      type="url"
                      placeholder={language === 'pt' ? 'Link do YouTube, Vimeo, etc.' : 'YouTube, Vimeo link, etc.'}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:ring-2 focus:ring-app-accent/20 focus:border-app-accent outline-none text-app-text transition-all placeholder:text-app-secondary/30 text-lg font-serif"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Suggestions Chips - Refined Style */}
              <div className="space-y-4 bg-black/20 p-5 rounded-2xl border border-white/5 flex flex-col items-center">
                <div className="flex items-center gap-2 opacity-80">
                  <TrendingUp size={12} className="text-app-accent" />
                  <span className="text-[9px] uppercase font-bold tracking-widest text-app-text text-center">{t('dailySuggestionsLabel')}</span>
                </div>
                <div className="flex flex-wrap gap-2.5 justify-center">
                  {seasonalSuggestions.map((s, idx) => (
                    <button
                      key={`seasonal-${idx}`}
                      type="button"
                      onClick={() => setTheme(s.value)}
                      className="group flex items-center gap-2 px-3.5 py-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl text-[10px] font-bold hover:bg-indigo-500 hover:text-white hover:scale-105 transition-all shadow-sm"
                    >
                      <Calendar size={12} className="group-hover:rotate-12 transition-transform" />
                      {s.label}
                    </button>
                  ))}
                  {dailySuggestions.map((t_item, idx) => (
                    <button
                      key={`daily-${idx}`}
                      type="button"
                      onClick={() => setTheme(t_item)}
                      className="px-3.5 py-2 bg-white/5 border border-white/10 text-app-secondary rounded-xl text-[10px] font-bold hover:bg-white/10 hover:text-app-text hover:border-white/20 transition-all"
                    >
                      {t_item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Secondary Section: Refined Grid */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr_2fr] gap-6 pt-4 border-t border-white/5">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-app-accent uppercase tracking-widest flex items-center gap-2">
                  <BookMarked size={14} /> {t('bibleTextOptional')}
                </label>
                <input 
                  type="text"
                  placeholder={t('biblePassagePlaceholder')}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:ring-2 focus:ring-app-accent/20 focus:border-app-accent outline-none text-app-text transition-all placeholder:text-app-secondary/30 text-sm"
                  value={passage}
                  onChange={(e) => setPassage(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-app-accent uppercase tracking-widest flex items-center gap-2">
                  <Users size={14} /> {t('audienceLabel')}
                </label>
                <div className="relative">
                  <select 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:ring-2 focus:ring-app-accent/20 focus:border-app-accent outline-none text-app-text transition-all appearance-none text-sm pr-10"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                  >
                    <option value="" className="bg-[#0f172a]">{t('audienceGeneral')}</option>
                    <option value="Jovens" className="bg-[#0f172a]">{t('audienceYouth')}</option>
                    <option value="Casais" className="bg-[#0f172a]">{t('audienceCouples')}</option>
                    <option value="Liderança" className="bg-[#0f172a]">{t('audienceLeadership')}</option>
                    <option value="Crianças" className="bg-[#0f172a]">{t('audienceChildren')}</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-app-secondary pointer-events-none" />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-app-accent uppercase tracking-widest flex items-center gap-2">
                  <Wand2 size={14} /> {t('preachingStyleLabel')}
                </label>
                <div className="flex bg-white/5 border border-white/10 rounded-xl p-1">
                  {(['expositivo', 'tematico', 'narrativo'] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStyle(s)}
                      className={`flex-1 py-2.5 rounded-lg text-[9px] font-black uppercase transition-all tracking-wider ${style === s ? 'bg-app-accent text-white shadow-lg' : 'text-app-secondary hover:text-app-text hover:bg-white/5'}`}
                    >
                      {s === 'expositivo' ? t('styleExpository') : s === 'tematico' ? t('styleThematic') : t('styleNarrative')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading || (!theme && !passage)}
                className="w-full bg-app-accent text-white py-5 rounded-[20px] font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-app-accent/30 disabled:opacity-50 disabled:cursor-not-allowed group overflow-hidden relative"
              >
                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                <div className="relative flex items-center justify-center gap-3">
                  {loading ? <RefreshCw className="animate-spin" size={20} /> : <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />}
                  <span className="text-lg tracking-tight">{t('generateSermonBtn')}</span>
                </div>
              </button>
            </div>
          </form>

        ) : (
          <div className="frosted-glass p-8 rounded-[32px] shadow-2xl space-y-4 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-app-accent/20 rounded-3xl flex items-center justify-center text-app-accent border border-app-accent/20">
              <Bot size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-app-text">{t('chatMode') || 'Modo Conversa'}</h3>
              <p className="text-sm text-app-secondary leading-relaxed max-w-md mx-auto">
                {language === 'pt' 
                  ? 'Esta ferramenta foi otimizada para ser seu parceiro ministerial em tempo real.'
                  : 'This tool is optimized to be your real-time ministerial partner.'}
              </p>
            </div>
          </div>
        )}

        {/* Results / Preview Section */}
        <section className="frosted-glass rounded-[32px] shadow-2xl flex flex-col overflow-hidden min-h-[500px] border border-white/5 relative">
          {/* History Sidebar/Overlay */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute inset-y-0 left-0 w-full sm:w-72 bg-[#0f172a]/95 backdrop-blur-2xl z-50 border-r border-white/10 shadow-2xl p-6 flex flex-col"
              >
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-app-accent">{mode === 'chat' ? (t('pastConversations') || 'Conversas') : (language === 'pt' ? 'Esboços Anteriores' : 'Past Outlines')}</h3>
                  <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                    <ArrowRight className="rotate-180 text-app-secondary" size={18} />
                  </button>
                </div>
                
                <button 
                  onClick={mode === 'chat' ? handleNewChat : handleNewOutline}
                  className="w-full mb-4 py-3 bg-app-accent/10 border border-app-accent/20 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase text-app-accent hover:bg-app-accent hover:text-white transition-all tracking-wider"
                >
                  <Plus size={14} />
                  {mode === 'chat' 
                    ? (language === 'pt' ? 'Nova Conversa' : 'New Conversation')
                    : (language === 'pt' ? 'Novo Esboço' : 'New Outline')}
                </button>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {((mode === 'chat' ? pastChats : pastOutlines).length === 0) ? (
                    <div className="text-center py-12 opacity-30">
                      <MessageSquare size={32} className="mx-auto mb-2" />
                      <p className="text-[10px] font-bold uppercase">{language === 'pt' ? 'Nenhum histórico' : 'No history'}</p>
                    </div>
                  ) : (
                    (mode === 'chat' ? pastChats : pastOutlines).map((item) => (
                      <div 
                        key={item.id}
                        onClick={() => mode === 'chat' ? handleSelectChat(item.id) : handleSelectOutline(item.id)}
                        className={`group relative p-4 rounded-2xl border transition-all cursor-pointer ${(mode === 'chat' ? activeChatId : activeOutlineId) === item.id ? 'bg-app-accent border-app-accent text-white shadow-lg' : 'bg-white/5 border-white/5 hover:bg-white/10 text-app-secondary hover:text-app-text'}`}
                      >
                        <div className="flex flex-col gap-1 pr-6">
                          <span className="text-xs font-bold truncate pr-2">{item.title}</span>
                          <span className={`text-[8px] font-medium opacity-60 ${(mode === 'chat' ? activeChatId : activeOutlineId) === item.id ? 'text-white' : 'text-app-secondary'}`}>
                            {item.updatedAt?.toDate ? format(item.updatedAt.toDate(), 'dd/MM HH:mm') : 'Syncing...'}
                          </span>
                        </div>
                        <button 
                          onClick={(e) => mode === 'chat' ? handleDeleteChat(e, item.id) : handleDeleteOutline(e, item.id)}
                          onMouseLeave={() => setDeleteConfirmId(null)}
                          className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${deleteConfirmId === item.id ? 'bg-red-500 text-white opacity-100 scale-110 shadow-lg' : 'opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400'}`}
                          title={deleteConfirmId === item.id ? (language === 'pt' ? 'Clique para confirmar' : 'Click to confirm') : t('delete')}
                        >
                          {deleteConfirmId === item.id ? <AlertCircle size={14} /> : <Trash2 size={12} />}
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {(mode === 'chat' ? pastChats : pastOutlines).length > 0 && (
                  <div className="mt-6 flex flex-col gap-2 p-4 bg-red-500/5 rounded-2xl border border-red-500/10">
                    <button 
                      onClick={handleClearHistory}
                      onMouseLeave={() => !showClearHistoryConfirm && setShowClearHistoryConfirm(false)}
                      className={`flex items-center justify-center gap-2 text-[10px] font-bold transition-all py-3 rounded-xl uppercase tracking-tighter w-full ${showClearHistoryConfirm ? 'bg-red-500 text-white shadow-lg' : 'text-red-400 hover:bg-red-500/10'}`}
                    >
                      <Trash2 size={12} />
                      {showClearHistoryConfirm 
                        ? (language === 'pt' ? 'Confirmar - APAGAR TUDO' : 'Confirm - DELETE ALL') 
                        : (language === 'pt' ? 'Limpar Todo Histórico' : 'Clear All History')}
                    </button>
                    {showClearHistoryConfirm && (
                      <button 
                        onClick={() => setShowClearHistoryConfirm(false)}
                        className="text-[9px] font-bold text-app-secondary hover:text-app-text transition-colors uppercase"
                      >
                        {t('cancel')}
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-4 bg-app-accent/5 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-2 p-2 bg-white/5 border border-white/10 rounded-xl text-app-accent hover:bg-app-accent hover:text-white transition-all shadow-sm"
                title={t('history')}
              >
                <History size={16} />
                <span className="text-[10px] font-black uppercase tracking-tight hidden sm:block">{t('history') || 'Histórico'}</span>
              </button>
              <span className="text-[10px] font-bold text-app-accent uppercase tracking-widest">
                {mode === 'sermon' ? t('suggestedResult') : (t('historyOfMessages') || 'Mensagens')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {(mode === 'sermon' ? outline : chatMessages.length > 0) && (
                <>
                  <div className="relative">
                    {showClearConfirm ? (
                      <div className="flex items-center gap-1 bg-red-500/20 p-1 rounded-xl border border-red-500/30 animate-in fade-in zoom-in duration-200">
                        <button 
                          onClick={handleClear}
                          className="px-3 py-1.5 bg-red-500 text-white text-[9px] font-bold uppercase rounded-lg hover:bg-red-600 transition-all"
                        >
                          {t('confirm')}
                        </button>
                        <button 
                          onClick={() => setShowClearConfirm(false)}
                          className="px-3 py-1.5 text-[9px] font-bold uppercase text-red-100 rounded-lg hover:bg-white/10 transition-all"
                        >
                          {t('cancel')}
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setShowClearConfirm(true)}
                        className="flex items-center gap-2 px-3 py-2 border border-red-500/20 text-red-400 rounded-xl hover:bg-red-500/10 transition-all"
                        title={t('clearAll')}
                      >
                        <Trash2 size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-tight">{t('clear')}</span>
                      </button>
                    )}
                  </div>
                  <button 
                    onClick={mode === 'chat' ? handleNewChat : handleNewOutline}
                    className="p-2 border border-app-accent/20 text-app-accent rounded-xl hover:bg-app-accent hover:text-white transition-all"
                    title={mode === 'chat' ? (language === 'pt' ? 'Nova Conversa' : 'New Chat') : (language === 'pt' ? 'Novo Esboço' : 'New Outline')}
                  >
                    <Plus size={14} />
                  </button>
                  {mode === 'sermon' && outline && (
                    <button 
                      onClick={() => onApplyOutline(outline)}
                      className="text-[10px] bg-app-accent text-white px-4 py-2 rounded-xl font-bold hover:opacity-80 transition-all shadow-lg shadow-app-accent/10"
                    >
                      {t('useThisOutline')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Chat Input - Sticky at TOP of Results Section */}
          <div className="z-10 p-6 bg-white/5 backdrop-blur-xl border-b border-white/5">
            <form 
              onSubmit={handleChatAction}
              className="flex gap-2 bg-white/5 border border-white/10 rounded-2xl p-2 shadow-sm focus-within:ring-1 focus-within:ring-app-accent transition-all"
            >
              <input 
                type="text"
                placeholder={mode === 'chat' ? (language === 'pt' ? 'O que vamos aprender hoje?' : (t('chatPlaceholderDefault') || 'What shall we learn today?')) : (outline ? t('adjustOutlinePlaceholder') : t('chatPlaceholderDefault'))}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-3 placeholder:text-white/20 text-app-text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={refining}
              />
              <button 
                type="submit"
                disabled={!chatInput.trim() || refining}
                className="aspect-square w-11 flex items-center justify-center bg-app-accent text-white rounded-xl hover:opacity-80 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {refining ? <RefreshCw size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              </button>
            </form>
          </div>
          
          <div className="flex-1 overflow-y-auto prose prose-indigo max-w-none prose-headings:font-serif prose-headings:font-medium transition-colors relative flex flex-col break-words bg-black/10">
            <div className="p-8 flex-1">
              <AnimatePresence mode="wait">
                {mode === 'sermon' ? (
                  loading ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-full flex flex-col items-center justify-center text-center space-y-4 py-12"
                    >
                      <div className="animate-pulse space-y-3 w-full">
                        <div className="h-4 bg-app-accent/10 rounded-full w-3/4 mx-auto"></div>
                        <div className="h-4 bg-app-accent/5 rounded-full w-1/2 mx-auto"></div>
                        <div className="h-20 bg-app-accent/5 rounded-3xl w-full"></div>
                        <div className="h-4 bg-app-accent/5 rounded-full w-5/6 mx-auto"></div>
                      </div>
                      <p className="text-app-secondary font-serif italic text-lg mt-6">{t('refiningMessage')}</p>
                    </motion.div>
                  ) : outline ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="font-serif leading-relaxed text-app-text"
                    >
                      <ReactMarkdown>{outline}</ReactMarkdown>
                      <div ref={outlineEndRef} />
                    </motion.div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-app-secondary py-12">
                      <Sparkles size={48} className="opacity-5 mb-4 text-app-accent" />
                      <p className="font-serif italic text-xl">{t('readyToStartAi')}</p>
                      <p className="text-xs uppercase tracking-widest mt-4 max-w-xs mx-auto font-bold opacity-60">{t('fillAndGenerate')}</p>
                    </div>
                  )
                ) : (
                  <div className="space-y-6">
                    {chatMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-app-secondary py-12 opacity-40">
                        <MessageSquare size={48} className="mb-4 text-app-accent" />
                        <p className="font-serif italic text-xl">{language === 'pt' ? 'Inicie uma conversa teológica' : 'Start a theological conversation'}</p>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {chatMessages.map((msg, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-[85%] rounded-3xl p-5 ${msg.role === 'user' ? 'bg-app-accent text-white rounded-tr-none' : 'bg-white/5 border border-white/10 text-app-text rounded-tl-none font-serif'}`}>
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          </motion.div>
                        ))}
                        {refining && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 rounded-tl-none">
                              <RefreshCw size={18} className="animate-spin text-app-accent" />
                            </div>
                          </motion.div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    )}
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
