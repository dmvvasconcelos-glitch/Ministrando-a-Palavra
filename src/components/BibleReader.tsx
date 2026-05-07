import { useState, useEffect, useMemo } from 'react';
import { Search, Book as BookIcon, ChevronLeft, ChevronRight, Copy, Share2, Bookmark, BookMarked, ChevronDown, Check, TrendingUp, History, Trash2, X } from 'lucide-react';
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
  const [showVersionMenu, setShowVersionMenu] = useState(false);
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

  const handleClear = () => {
    setSearch('');
    setContent(null);
    localStorage.removeItem('bible_last_search');
    localStorage.removeItem('bible_last_content');
  };

  const currentVersion = BIBLE_VERSIONS.find(v => v.id === version) || BIBLE_VERSIONS[0];

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
      await navigator.clipboard.writeText(text);
      // In a real app we'd use a toast, but for now we'll use a silent success or console
      console.log(`${label} ${t('copiedToClipboard')}`);
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
                      {BIBLE_BOOKS.includes(s) ? <BookIcon size={16} className="text-app-accent" /> : <TrendingUp size={16} className="text-indigo-400" />}
                      <span className="font-medium">{s}</span>
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </form>

        {/* Version Selector */}
        <div className="relative order-1 sm:order-2">
          <button
            onClick={() => setShowVersionMenu(!showVersionMenu)}
            className="w-full sm:w-auto h-full px-4 sm:px-6 py-3 sm:py-4 bg-app-card/80 backdrop-blur-md rounded-full text-xs sm:text-sm font-black flex items-center justify-between sm:justify-start gap-3 hover:bg-app-card transition-all border border-app-border/40 whitespace-nowrap shadow-xl"
          >
            <div className="flex items-center gap-3">
              <div className="bg-app-accent text-white px-2 py-0.5 rounded-md text-[10px] font-black shadow-lg shadow-app-accent/20">
                {version}
              </div>
              <span className="text-app-text opacity-90 line-clamp-1">— {currentVersion.name}</span>
            </div>
            <ChevronDown size={14} className={`text-app-accent transition-transform duration-300 ${showVersionMenu ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showVersionMenu && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[60]"
                  onClick={() => setShowVersionMenu(false)}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -20 }}
                  className="absolute right-0 top-full mt-4 w-[320px] bg-app-card border border-app-border rounded-[2.5rem] p-4 shadow-2xl z-[70] grid grid-cols-1 gap-1.5"
                >
                  <p className="px-5 py-2 text-[10px] uppercase font-black tracking-[0.2em] text-app-accent opacity-60 mb-1">{t('bibleVersionLabel')}</p>
                  <div className="max-h-[350px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-app-accent/20 scrollbar-track-transparent">
                    {BIBLE_VERSIONS.map(v => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setVersion(v.id);
                          setShowVersionMenu(false);
                        }}
                        className={`w-full group flex items-center justify-between px-5 py-4 rounded-3xl text-left transition-all relative overflow-hidden border ${
                          version === v.id 
                            ? 'bg-app-accent text-white border-transparent shadow-lg shadow-app-accent/20' 
                            : 'bg-app-bg/50 text-app-text border-app-border/60 hover:bg-app-accent/10 hover:border-app-accent/40 shadow-sm'
                        }`}
                      >
                        <div className="flex flex-col relative z-10">
                          <span className={`text-sm font-black tracking-widest ${version === v.id ? 'text-white' : 'text-app-text group-hover:text-app-accent'}`}>
                            {v.id}
                          </span>
                          <span className={`text-[13px] font-semibold leading-tight mt-0.5 ${version === v.id ? 'text-white/90' : 'text-app-text/70 group-hover:text-app-text'}`}>
                            {v.name}
                          </span>
                        </div>
                        {version === v.id ? (
                          <div className="bg-white/20 p-1.5 rounded-full relative z-10">
                            <Check size={14} strokeWidth={4} />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-app-border/40 group-hover:border-app-accent/30 transition-colors" />
                        )}
                        
                        {/* Subtle interactive background for hover state */}
                        {version !== v.id && (
                          <div className="absolute inset-0 bg-gradient-to-r from-app-accent/0 to-app-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
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
                  <h2 className="text-3xl font-bold tracking-tight text-app-text">{content.reference}</h2>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleCopyPassage}
                      className="p-2 hover:bg-app-card rounded-full text-app-secondary transition-colors active:scale-95"
                      title={t('copyPassage')}
                    >
                      <Copy size={20} />
                    </button>
                    <button 
                      className="p-2 hover:bg-app-card rounded-full text-app-secondary transition-colors active:scale-95"
                    >
                      <Share2 size={20} />
                    </button>
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
                <h3 className="mt-4 text-xl font-bold text-app-text">{t('readyToDive')}</h3>
                <p className="text-app-secondary mt-2 font-medium">{t('searchInstructions')}</p>
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
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-app-accent">{t('recentSearches')}</h4>
              </div>
              {recentSearches.length > 0 && (
                <button 
                  onClick={clearRecentSearches}
                  className="text-[10px] font-bold text-app-secondary hover:text-rose-500 transition-colors uppercase tracking-tight"
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
            <h4 className="text-[11px] font-bold uppercase tracking-widest opacity-60 mb-b">{t('ministerialTip')}</h4>
            <p className="font-serif italic leading-relaxed mt-2 text-lg">
              "{ministerialTip.text}"
            </p>
            <p className="text-[10px] mt-4 opacity-60 font-bold uppercase tracking-tighter">— {ministerialTip.ref}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
