import { useState, useEffect, useMemo } from 'react';
import { Search, BookOpen as BookIcon, ChevronLeft, ChevronRight, Copy, Share2, Bookmark, BookMarked, ChevronDown, TrendingUp, History, Trash2, X, Check, MessageCircle } from 'lucide-react';
import { fetchBiblePassage } from '../services/gemini';
import { DAILY_VERSES, MINISTERIAL_TIPS } from '../constants/dailyInspirations';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useLanguage } from '../contexts/LanguageContext';

import { UserProfile } from '../types';

// Result cache structure
const searchCache: Record<string, any> = {};

interface BibleReaderProps {
  profile: UserProfile | null;
}

export default function BibleReader({ profile }: BibleReaderProps) {
  const { t, language } = useLanguage();
  
  const BIBLE_VERSIONS = useMemo(() => t('bibleVersions') as unknown as { id: string, name: string }[], [t]);
  const BIBLE_BOOKS = useMemo(() => t('bibleBooks') as unknown as string[], [t]);
  const POPULAR_THEMES = useMemo(() => t('popularThemes') as unknown as string[], [t]);

  const [search, setSearch] = useState(() => {
    return localStorage.getItem('bible_last_search') || '';
  });
  const [version, setVersion] = useState(() => {
    return localStorage.getItem('bible_version') || BIBLE_VERSIONS[4].id;
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [ministerialTip, setMinisterialTip] = useState({ ref: '', text: '' });
  const [content, setContent] = useState<any>(() => {
    const saved = localStorage.getItem('bible_last_content');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('recent_bible_searches');
    return saved ? JSON.parse(saved) : ['Gênesis 1', 'Salmo 23', 'Efésios 6', 'João 3:16'];
  });
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  const handleClear = () => {
    setSearch('');
    setContent(null);
    localStorage.removeItem('bible_last_search');
    localStorage.removeItem('bible_last_content');
  };

  // Persist version
  useEffect(() => {
    localStorage.setItem('bible_version', version);
  }, [version]);

  // Handle version mismatch on language change
  useEffect(() => {
    if (BIBLE_VERSIONS.length > 0 && !BIBLE_VERSIONS.some(v => v.id === version)) {
      // Find a sensible default if the current one isn't in the list
      // Prefer index 4 as it's usually NVI/NIV/NKJV, or fallback to index 0
      const defaultVersion = BIBLE_VERSIONS[4]?.id || BIBLE_VERSIONS[0].id;
      setVersion(defaultVersion);
    }
  }, [BIBLE_VERSIONS, version]);

  // Persist current search and content
  useEffect(() => {
    if (search) {
      localStorage.setItem('bible_last_search', search);
    } else {
      localStorage.removeItem('bible_last_search');
    }
  }, [search]);

  useEffect(() => {
    if (content) {
      localStorage.setItem('bible_last_content', JSON.stringify(content));
    } else {
      localStorage.removeItem('bible_last_content');
    }
  }, [content]);

  // Persist recent searches
  useEffect(() => {
    localStorage.setItem('recent_bible_searches', JSON.stringify(recentSearches));
  }, [recentSearches]);

  useEffect(() => {
    const today = new Date();
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
    
    // Create a simple seed from UID to make it distinct per user
    const uidSeed = auth.currentUser?.uid.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) || 0;

    // Choose tip based on day of year and user seed
    const tips = MINISTERIAL_TIPS[language as keyof typeof MINISTERIAL_TIPS] || MINISTERIAL_TIPS.pt;
    const tipIndex = (dayOfYear + uidSeed) % tips.length;
    setMinisterialTip(tips[tipIndex]);

    // Setup a timer to refresh at midnight
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - today.getTime();

    const timer = setTimeout(() => {
      window.location.reload(); 
    }, msUntilMidnight);

    return () => clearTimeout(timer);
  }, []);

  const suggestions = useMemo(() => {
    if (!search.trim() || search.length < 2) return [];
    
    const searchLow = search.toLowerCase();
    
    const filteredBooks = BIBLE_BOOKS.filter(book => 
      book.toLowerCase().includes(searchLow)
    ).slice(0, 5);

    const filteredThemes = POPULAR_THEMES.filter(theme => 
      theme.toLowerCase().includes(searchLow)
    ).slice(0, 3);

    return [...filteredBooks, ...filteredThemes];
  }, [search]);

  const handleSearch = async (queryParam?: string) => {
    const query = queryParam || search;
    if (!query) return;
    
    setShowSuggestions(false);
    
    // Update input if search was triggered by recent search button or suggestion
    if (queryParam) {
      setSearch(queryParam);
    }

    const selectedVersion = BIBLE_VERSIONS.find(v => v.id === version);
    const versionLabel = selectedVersion ? `${selectedVersion.id} (${selectedVersion.name})` : version;
    const cacheKey = `${query.toLowerCase()}_${version}`;

    // Check cache first
    if (searchCache[cacheKey]) {
      setContent(searchCache[cacheKey]);
      updateRecentSearches(query);
      return;
    }

    setLoading(true);
    try {
      const selectedVersion = BIBLE_VERSIONS.find(v => v.id === version);
      const versionLabel = selectedVersion ? `${selectedVersion.id} (${selectedVersion.name})` : version;
      const cacheKey = `${query.toLowerCase()}_${version}`;

      console.log(`Starting search for: ${query} in ${versionLabel}`);
      const data = await fetchBiblePassage(query, versionLabel, language);
      
      if (!data || !data.verses || data.verses.length === 0) {
        throw new Error(t('noVersesFound'));
      }

      // Store in cache
      searchCache[cacheKey] = data;
      
      setContent(data);
      updateRecentSearches(query);
    } catch (error: any) {
      console.error('Bible Error:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (errorMsg === 'LIMITE_COTA_API') {
        alert(t('sharedQuotaInfo'));
      } else if (errorMsg === 'IA_SOBRECARREGADA') {
        alert(t('aiOverloaded'));
      } else if (errorMsg === 'CHAVE_API_INVALIDA') {
        alert(language === 'pt' 
          ? 'Sua Chave de API parece ser inválida. Verifique em seu Perfil.' 
          : 'Your API Key seems to be invalid. Check your Profile.');
      } else {
        alert(`${t('bibleErrorTip')}: ${errorMsg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateRecentSearches = (query: string) => {
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s.toLowerCase() !== query.toLowerCase());
      return [query, ...filtered.slice(0, 4)]; // Keep last 5 searches
    });
  };

  const removeRecentSearch = (query: string) => {
    setRecentSearches(prev => prev.filter(s => s !== query));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
  };

  const handleCopy = async (text: string, label: string = t('verseContext')) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Clipboard API not available');
      }
    } catch (err) {
      console.error('Failed to copy: ', err);
      // Simple fallback
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (fallbackErr) {
        console.error('Fallback failed: ', fallbackErr);
      }
      document.body.removeChild(textArea);
    } finally {
      setCopySuccess(label);
      setTimeout(() => setCopySuccess(null), 3000);
      console.log(`${label} ${t('copiedToClipboard')}`);
      
      // If we are in the fallback path or sharing API wasn't used/supported, 
      // the label will be 'passage' or similar. We should alert the user specifically on mobile if API is missing.
      if (!navigator.share) {
        // Just rely on the on-screen toast (copySuccess) for better UX than alert
      }
    }
  };

  const handleCopyPassage = () => {
    if (!content) return;
    const ref = content.reference;
    const versionTag = `(${version.toUpperCase()})`;
    
    // Clean up reference: remove version if it's already there to ensure consistent formatting
    const cleanRef = ref.replace(/\s*\([^)]*\)$/, '').trim();
    const finalRef = `${cleanRef} ${versionTag}`;
    
    const text = `${finalRef}\n\n` + 
                 content.verses.map((v: any) => `${v.n}. ${v.text}`).join('\n');
    handleCopy(text, t('passageContext'));
  };

  const handleSharePassage = async () => {
    if (!content) return;
    const ref = content.reference;
    const versionTag = `(${version.toUpperCase()})`;
    const cleanRef = ref.replace(/\s*\([^)]*\)$/, '').trim();
    const finalRef = `${cleanRef} ${versionTag}`;
    
    const text = `${finalRef}\n\n` + 
                 content.verses.map((v: any) => `${v.n}. ${v.text}`).join('\n');
    
    if (navigator.share && window.isSecureContext) {
      try {
        await navigator.share({
          title: finalRef,
          text: text,
        });
        setCopySuccess(t('share'));
        setTimeout(() => setCopySuccess(null), 2000);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
          handleCopyPassage();
        }
      }
    } else {
      handleCopyPassage();
    }
  };

  const handleCopyVerse = (verse: any) => {
    if (!content) return;
    const ref = content.reference;
    const versionTag = `(${version.toUpperCase()})`;
    
    // Clean up reference: remove chapter level version if present (e.g. "Atos 2 (ARA)" -> "Atos 2")
    const cleanRef = ref.replace(/\s*\([^)]*\)$/, '').trim();
    
    // Desired format: Book Chapter:Verse (VERSION) — Text
    const text = `${cleanRef}:${verse.n} ${versionTag} — ${verse.text}`;
    
    handleCopy(text, t('verseSingleContext'));
  };

  const handleHighlight = async (verse: any) => {
    if (!auth.currentUser || !content) return;
    try {
      await addDoc(collection(db, 'highlights'), {
        userId: auth.currentUser.uid,
        verseReference: `${content.reference} : ${verse.n}`,
        text: verse.text,
        color: 'yellow',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      alert(t('favoritedMsg'));
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Bible Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-8 border-b border-app-border/60">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-5 bg-app-accent rounded-full opacity-60" />
            <h1 className="text-xl font-bold tracking-tight text-app-text">
              {t('bible')}
            </h1>
          </div>
          <p className="text-xs text-app-secondary font-medium tracking-wide transition-colors opacity-70">
            {language === 'pt' ? 'CONSULTAR AS ESCRITURAS' : language === 'es' ? 'CONSULTAR LAS ESCRITURAS' : 'CONSULT THE SCRIPTURES'}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        {/* Search Bar with Suggestions */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex-1 relative order-2 sm:order-1"
        >
          <div className="relative z-50">
            <input
              type="text"
              placeholder={t('bibleSearchPlaceholder')}
              className="w-full frosted-glass rounded-full py-4 pl-12 pr-12 sm:pr-6 focus:ring-1 focus:ring-app-accent outline-none shadow-lg text-app-text font-serif placeholder:text-app-secondary/50 text-sm sm:text-base"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-app-secondary" size={18} />
            
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 sm:gap-2 z-[60]">
              {(search || content) && (
                <button 
                  type="button"
                  onClick={handleClear}
                  className="px-2 sm:px-4 py-2 rounded-full text-[10px] sm:text-xs font-bold text-app-secondary hover:text-app-text transition-all"
                >
                  {t('clear')}
                </button>
              )}
              <button 
                type="submit"
                className="bg-app-accent text-white px-4 sm:px-6 py-2 rounded-full text-xs sm:text-sm font-bold hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-app-accent/20"
              >
                {t('search')}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && (
              <>
                <div 
                  className="fixed inset-0 z-40 bg-black/5 md:bg-transparent" 
                  onClick={() => setShowSuggestions(false)} 
                />
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute left-0 right-0 top-full mt-2 bg-app-card border border-app-border rounded-[2rem] p-2 shadow-2xl z-50 overflow-hidden"
                >
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSearch(s);
                        handleSearch(s);
                      }}
                      className="w-full flex items-center gap-3 px-6 py-3 hover:bg-app-accent/10 text-left text-app-secondary hover:text-app-text transition-all rounded-xl"
                    >
                      {BIBLE_BOOKS.includes(s) ? <BookIcon size={16} className="text-app-accent" /> : <TrendingUp size={16} className="text-app-accent" />}
                      <span className="font-medium">{s}</span>
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </form>

        {/* Version Selector */}
        <div className="relative order-1 sm:order-2 min-w-[140px]">
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-app-accent flex items-center gap-2 mb-1 opacity-70">
              <BookMarked size={14} /> {t('bibleVersionLabel')}
            </label>
            <div className="relative">
              <select
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 focus:ring-2 focus:ring-app-accent/20 focus:border-app-accent outline-none text-app-text transition-all text-xs font-bold appearance-none cursor-pointer pr-10"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              >
                {BIBLE_VERSIONS.map((v) => (
                  <option key={v.id} value={v.id} className="bg-app-bg text-app-text">
                    {v.name} ({v.id})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-app-accent pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Content Area */}
        <div className="lg:col-span-3 space-y-6">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="frosted-glass p-20 rounded-[32px] text-center"
              >
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="inline-block"
                >
                  <BookIcon className="text-app-accent" size={32} />
                </motion.div>
                <p className="mt-4 text-app-secondary font-serif italic">{t('verseLoading')}</p>
              </motion.div>
            ) : content ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="frosted-glass p-8 md:p-12 rounded-[32px] shadow-2xl"
              >
                <div className="flex items-center justify-between mb-8 pb-6 border-b border-app-border/40">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-app-text">{content.reference}</h2>
                    {content.verses && content.verses.length > 0 && (
                      <p className="text-xs text-app-accent font-semibold tracking-wider mt-1 opacity-80">
                        {content.chapterTotalVerses 
                          ? t('versesCountWithTotal')
                              .replace('{count}', String(content.verses.length))
                              .replace('{total}', String(content.chapterTotalVerses))
                          : t('versesCount').replace('{count}', String(content.verses.length))}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleCopyPassage}
                      className="p-2 hover:bg-app-card rounded-full text-app-secondary transition-colors active:scale-95 relative"
                      title={t('copyPassage')}
                    >
                      <AnimatePresence mode="wait">
                        {copySuccess === t('passageContext') ? (
                          <motion.div key="check" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
                            <Check size={20} className="text-green-500" />
                          </motion.div>
                        ) : (
                          <motion.div key="copy" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
                            <Copy size={20} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {copySuccess === t('passageContext') && (
                        <motion.span 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute -top-8 left-1/2 -translate-x-1/2 bg-app-card text-[10px] font-bold px-2 py-1 rounded border border-app-border whitespace-nowrap"
                        >
                          {t('copiedToClipboard')}
                        </motion.span>
                      )}
                    </button>
                    <button 
                      onClick={handleSharePassage}
                      className="p-2 hover:bg-app-card rounded-full text-app-secondary transition-colors active:scale-95 relative"
                      title={t('share')}
                    >
                      <AnimatePresence mode="wait">
                        {copySuccess === t('share') ? (
                          <motion.div key="check-share" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
                            <Check size={20} className="text-green-500" />
                          </motion.div>
                        ) : (
                          <motion.div key="share" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
                            <Share2 size={20} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </button>
                    <a 
                      href={`https://wa.me/?text=${encodeURIComponent(
                        content ? `${content.reference} (${version.toUpperCase()})\n\n` + content.verses.map((v: any) => `${v.n}. ${v.text}`).join('\n') : ''
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 hover:bg-app-card rounded-full text-green-500 transition-colors active:scale-95"
                      title="WhatsApp"
                    >
                      <MessageCircle size={20} />
                    </a>
                  </div>
                </div>
                
                <div className="space-y-6">
                  {content.verses.map((v: any) => (
                    <div key={v.n} className="group relative">
                      <p className="text-xl font-serif leading-relaxed text-app-text">
                        <span className="text-[10px] font-sans font-bold text-app-accent align-top mr-2 bg-app-accent/10 px-1.5 py-0.5 rounded-sm">{v.n}</span>
                        {v.text}
                      </p>
                      <div className="absolute -right-4 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleCopyVerse(v)}
                          className="p-2 text-app-secondary hover:text-app-text transition-all hover:scale-110"
                          title={t('copyVerse')}
                        >
                          <Copy size={16} />
                        </button>
                        <button 
                          onClick={() => handleHighlight(v)}
                          className="p-2 text-app-accent hover:scale-110 transition-all"
                          title={t('markFavorite')}
                        >
                          <Bookmark size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="frosted-glass p-20 rounded-[32px] text-center">
                <BookIcon className="mx-auto text-app-secondary/20" size={64} />
                <h3 className="mt-4 text-lg font-bold text-app-text">{t('readyToDive')}</h3>
                <p className="text-app-secondary mt-2 font-medium text-sm">{t('searchInstructions')}</p>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Info / Recent Searches Sidebar */}
        <aside className="space-y-6">
          <div className="frosted-glass p-6 rounded-[32px] border border-app-border shadow-xl">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2">
                <History size={14} className="text-app-accent" />
                <h4 className="text-[11px] font-medium text-app-accent opacity-70">{t('recentSearches')}</h4>
              </div>
              {recentSearches.length > 0 && (
                <button 
                  onClick={clearRecentSearches}
                  className="text-[10px] font-bold text-app-secondary hover:text-rose-500 transition-colors tracking-tight"
                >
                  {t('clearAll')}
                </button>
              )}
            </div>
            
            <div className="space-y-1">
              {recentSearches.length > 0 ? (
                recentSearches.map(s => (
                  <div 
                    key={s} 
                    className="group flex items-center gap-1"
                  >
                    <button
                      onClick={() => handleSearch(s)}
                      className="flex-1 flex items-center justify-between px-4 py-2.5 bg-app-card/40 hover:bg-app-card/60 border border-transparent hover:border-app-border rounded-2xl text-[12px] font-medium text-app-secondary hover:text-app-text transition-all text-left"
                    >
                      <span className="truncate">{s}</span>
                      <ChevronRight size={14} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-app-accent" />
                    </button>
                    <button
                      onClick={() => removeRecentSearch(s)}
                      className="p-2 text-app-secondary/40 opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-all"
                      title="Remover"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center bg-app-card/20 rounded-2xl border border-dashed border-app-border">
                  <p className="text-[10px] text-app-secondary/60 font-medium italic">{t('noRecentSearches')}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 rounded-[32px] text-white shadow-xl shadow-indigo-600/10 relative overflow-hidden">
            <BookMarked size={120} className="absolute -bottom-10 -right-10 opacity-5 pointer-events-none" />
            <h4 className="text-[11px] font-medium opacity-60 mb-b">{t('ministerialTip')}</h4>
            <p className="font-serif italic leading-relaxed mt-2 text-lg">
              "{ministerialTip.text}"
            </p>
            <p className="text-[10px] mt-4 opacity-60 font-medium">— {ministerialTip.ref}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
