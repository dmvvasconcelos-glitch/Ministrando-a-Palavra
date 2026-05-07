import { useState, useEffect, useRef } from 'react';
import { X, Maximize, Minimize, Settings, Play, Pause, ChevronUp, ChevronDown, MessageSquare, Clock as ClockIcon, Timer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Sermon } from '../types';

import { useLanguage } from '../contexts/LanguageContext';

interface PreachingModeProps {
  sermonId: string;
  onClose: () => void;
}

export default function PreachingMode({ sermonId, onClose }: PreachingModeProps) {
  const { t, language } = useLanguage();
  const [sermon, setSermon] = useState<Sermon | null>(null);
  const [fontSize, setFontSize] = useState(24);
  const [scrollSpeed, setScrollSpeed] = useState(0);
  const [notes, setNotes] = useState<{ id: string, text: string }[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollInterval = useRef<any>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let interval: any;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setElapsedSeconds(s => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? `${h}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    async function load() {
      const d = await getDoc(doc(db, 'sermons', sermonId));
      if (d.exists()) {
        const data = d.data() as Sermon;
        setSermon(data);
        
        // Extract notes from content using regex (looking for data-note="...")
        const noteRegex = /data-note="([^"]+)"/g;
        const matches = Array.from(data.content.matchAll(noteRegex));
        const extractedNotes = matches.map((match, index) => ({
          id: `note-${index}`,
          text: match[1]
        }));
        setNotes(extractedNotes);
        // Requirement: Notes panel remains OFF by default, user chooses to turn it ON
        // if (extractedNotes.length > 0) setShowNotes(true);
      }
    }
    load();
  }, [sermonId]);

  useEffect(() => {
    if (scrollSpeed > 0) {
      scrollInterval.current = setInterval(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop += 1;
        }
      }, 100 / (scrollSpeed * 0.5 + 0.1)); // Adjusted speed math for smoother feel
    } else {
      clearInterval(scrollInterval.current);
    }
    return () => clearInterval(scrollInterval.current);
  }, [scrollSpeed]);

  if (!sermon) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] flex flex-col bg-[#0d1117] text-slate-200 overflow-hidden"
    >
      <div className="mesh-gradient-bg">
        <div className="mesh-blob-1"></div>
        <div className="mesh-blob-2"></div>
      </div>

      {/* Top Bar */}
      <header className="px-6 py-4 flex items-center justify-between frosted-glass m-4 rounded-2xl relative z-20 shadow-2xl">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h2 className="font-bold tracking-tight truncate max-w-[150px] md:max-w-xs text-white uppercase text-sm leading-tight">{sermon.title}</h2>
            <span className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.2em] mt-0.5">{sermon.theme || t('ministryBadge')}</span>
          </div>
          
          <div className="hidden lg:flex items-center gap-6 border-l border-white/10 pl-6 h-10">
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">{t('currentHour')}</span>
              <div className="flex items-center gap-1.5 text-white font-mono font-bold">
                <ClockIcon size={12} className="text-indigo-400" />
                <span className="text-sm">{currentTime.toLocaleTimeString(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">{t('timer')}</span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  className={`flex items-center gap-1.5 font-mono font-bold transition-all px-2 py-0.5 rounded-md ${isTimerRunning ? 'text-app-accent bg-app-accent/10' : 'text-slate-400 bg-white/5'}`}
                >
                  <Timer size={12} />
                  <span className="text-sm">{formatElapsed(elapsedSeconds)}</span>
                </button>
                <button 
                  onClick={() => {
                    setElapsedSeconds(0);
                    setIsTimerRunning(false);
                  }}
                  className="p-1 hover:bg-white/10 rounded text-slate-500 hover:text-white transition-colors"
                  title={t('resetTimer')}
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-6">
          <button 
            onClick={() => setShowNotes(!showNotes)}
            className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl border transition-all text-[10px] md:text-sm font-black uppercase tracking-widest ${showNotes ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
          >
            <Settings size={18} className={`${showNotes ? 'rotate-90' : ''} transition-transform duration-300`} />
            <span className="hidden sm:inline">{showNotes ? t('panelOn') : t('panelOff')}</span>
          </button>

          <div className="flex items-center gap-1 md:gap-4 bg-white/5 rounded-xl py-1 px-1 md:px-4 border border-white/10 shadow-inner">
            <button onClick={() => setFontSize(Math.max(16, fontSize - 2))} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 font-black hover:text-white transition-colors" title={t('decreaseFont')}>A-</button>
            <span className="text-[10px] md:text-xs font-black w-6 text-center text-white">{fontSize}</span>
            <button onClick={() => setFontSize(Math.min(64, fontSize + 2))} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 font-black hover:text-white transition-colors" title={t('increaseFont')}>A+</button>
          </div>
          
          <button 
            id="btn-close-preach"
            onClick={onClose} 
            className="p-3 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-xl transition-all shadow-lg hover:shadow-red-600/20"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Content Area */}
        <main 
          ref={scrollRef}
          className={`flex-1 overflow-y-auto px-6 py-12 md:px-12 transition-all duration-500 scroll-smooth ${showNotes ? 'lg:mr-0' : 'lg:px-[15vw] xl:px-[20vw]'}`}
        >
          <div 
            className={`prose prose-invert max-w-none prose-headings:font-serif prose-headings:font-medium prose-p:leading-relaxed prose-p:mb-12 mx-auto ${showNotes ? 'max-w-4xl' : 'max-w-3xl'}`}
            style={{ 
              fontSize: `${fontSize}px`, 
              color: '#CBD5E1', 
              fontFamily: 'serif'
            }}
          >
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-white text-3xl sm:text-4xl md:text-5xl text-center mb-16 md:mb-24 font-serif italic"
            >
              {sermon.title}
            </motion.h1>
            <div 
              className="preach-content shrink-0"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                const trigger = target.closest('.personal-note-trigger');
                if (trigger) {
                  const note = (trigger as HTMLElement).dataset.note;
                  if (note) setActiveNote(activeNote === note ? null : note);
                }
              }}
              dangerouslySetInnerHTML={{ __html: sermon.content }} 
            />

            <AnimatePresence>
              {activeNote && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  className="fixed z-[110] bg-indigo-950/95 text-white p-8 rounded-[2.5rem] border border-indigo-500/30 shadow-[0_30px_100px_rgba(0,0,0,0.8)] backdrop-blur-2xl max-w-md left-1/2 -translate-x-1/2 bottom-40"
                >
                  <button 
                    onClick={() => setActiveNote(null)}
                    className="absolute -top-3 -right-3 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg border border-indigo-400/50 hover:bg-indigo-500 transition-colors"
                  >
                    <X size={20} />
                  </button>
                  <div className="flex items-start gap-5">
                    <div className="p-3 bg-indigo-500/20 rounded-2xl flex-shrink-0">
                      <MessageSquare size={24} className="text-indigo-400" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 block mb-3 font-sans">{t('spiritualInsight')}</span>
                      <p className="text-2xl font-serif italic italic leading-relaxed text-slate-100 italic">
                        "{activeNote}"
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 pt-4 border-t border-indigo-500/20 text-center">
                    <span className="text-[9px] text-indigo-400/60 uppercase tracking-widest font-bold">{t('touchToClose')}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="h-screen" />
          </div>
        </main>

        {/* Side Panel (Personal Notes) */}
        <AnimatePresence>
          {showNotes && (
            <motion.aside
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="w-full lg:w-96 border-l border-white/10 frosted-glass m-4 ml-0 rounded-3xl overflow-hidden flex flex-col relative z-20 shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 bg-white/5">
                <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-400 flex items-center gap-2">
                  <Play className="rotate-90" size={14} /> {t('personalNotes')}
                </h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {notes.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                      <Play className="rotate-90 opacity-20" size={24} />
                    </div>
                    <p className="text-sm italic">{t('noNotes')}</p>
                  </div>
                ) : (
                  notes.map((note) => (
                    <motion.div 
                      key={note.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="group bg-white/5 p-5 rounded-2xl border border-white/5 hover:bg-white/10 hover:border-indigo-500/30 transition-all cursor-help relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <p className="text-lg text-slate-300 font-serif leading-relaxed italic">
                        "{note.text}"
                      </p>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-[9px] uppercase tracking-widest font-bold text-slate-600">{t('spiritualDirection')}</span>
                        <div className="w-2 h-2 rounded-full bg-indigo-500/50 group-hover:animate-pulse" />
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              <div className="p-6 bg-indigo-600/5 mt-auto border-t border-white/5">
                 <p className="text-[10px] text-center text-slate-500 font-bold uppercase tracking-widest">
                   {t('listeningSpirit')}
                 </p>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Auto Scroll Controls */}
      <footer className="px-4 md:px-6 py-2 flex items-center justify-between frosted-glass m-2 md:m-4 rounded-3xl relative z-20 shadow-2xl">
        <div className="flex items-center gap-3 md:gap-10">
          <div className="flex items-center gap-2 md:gap-3">
             <div className="flex flex-col items-start">
               <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-0.5 ml-1">{t('autoScroll')}</span>
               <div className="flex items-center gap-0.5 md:gap-1 bg-white/5 p-0.5 rounded-2xl border border-white/5">
                  <button 
                    onClick={() => setScrollSpeed(Math.max(0, scrollSpeed - 1))}
                    className="p-1.5 md:p-2 bg-white/5 rounded-xl hover:bg-white/10 text-slate-400 transition-all hover:text-white"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <div className="flex flex-col items-center px-1 md:px-1.5">
                    <span className="text-sm md:text-lg font-black text-white leading-none">{scrollSpeed}</span>
                  </div>
                  <button 
                    onClick={() => setScrollSpeed(Math.min(10, scrollSpeed + 1))}
                    className="p-1.5 md:p-2 bg-white/5 rounded-xl hover:bg-white/10 text-slate-400 transition-all hover:text-white"
                  >
                    <ChevronUp size={14} />
                  </button>
               </div>
             </div>
          </div>

          <button 
            onClick={() => setScrollSpeed(scrollSpeed === 0 ? 2 : 0)}
            className={`h-9 w-9 md:h-11 md:w-11 rounded-full transition-all flex items-center justify-center shadow-xl ${scrollSpeed > 0 ? 'bg-indigo-600 text-white scale-110 shadow-indigo-600/40 ring-4 ring-indigo-600/20' : 'bg-white text-slate-900 shadow-white/10 hover:scale-105'}`}
          >
            {scrollSpeed > 0 ? <Pause size={16} /> : <Play size={16} className="ml-0.5 md:ml-1" fill="currentColor" />}
          </button>
        </div>
        
        <div className="flex items-center gap-3 lg:gap-12">
          {/* Mobile Clock/Timer displayed here when top header is hidden/scrolled or just extra info */}
          <div className="flex lg:hidden items-center gap-2 md:gap-4 text-white font-mono text-[10px] md:text-xs font-bold border-l border-white/10 pl-2 md:pl-4">
             <div className="flex items-center gap-1 md:gap-1.5 bg-white/5 px-2 md:px-2.5 py-1 md:py-1.5 rounded-xl">
               <ClockIcon size={12} className="text-indigo-400" />
               <span>{currentTime.toLocaleTimeString(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
             </div>
          </div>

          <div className="hidden sm:flex flex-col items-end opacity-40 select-none">
             <span className="text-[10px] font-black text-slate-500 tracking-[0.4em] uppercase">Soli Deo Gloria</span>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}
