import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, or, and, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Sermon, AgendaItem, UserProfile, Birthday } from '../types';
import { Plus, BookOpen, Clock, Calendar as CalIcon, MapPin, ChevronRight, Play, Edit2, Edit3, Heart, FileText, Sparkles, Mic2, Cake, Gift, PartyPopper } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DAILY_VERSES, DAILY_REFLECTIONS } from '../constants/dailyInspirations';
import { format, formatDistanceToNow, isAfter } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { useLanguage } from '../contexts/LanguageContext';

interface DashboardProps {
  profile: UserProfile | null;
  onEdit: (id: string | null) => void;
  onPreach: (id: string) => void;
  onSeeAll: () => void;
  onSeeAgenda: () => void;
  onSeeEvents: () => void;
  onEditProfile: () => void;
}

export default function Dashboard({ profile, onEdit, onPreach, onSeeAll, onSeeAgenda, onSeeEvents, onEditProfile }: DashboardProps) {
  const { t, language } = useLanguage();
  const [ministerialAgenda, setMinisterialAgenda] = useState<AgendaItem[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<AgendaItem[]>([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [verseOfDay, setVerseOfDay] = useState({ ref: '', text: '' });
  const [reflectionOfDay, setReflectionOfDay] = useState('');
  const [todayBirthdays, setTodayBirthdays] = useState<Birthday[]>([]);
  const [isUserBirthday, setIsUserBirthday] = useState(false);

  useEffect(() => {
    async function loadDailyInspiration() {
      if (!auth.currentUser) return;

      const todayKey = format(new Date(), 'yyyy-MM-dd');
      const docPath = `users/${auth.currentUser.uid}/daily_inspirations/${todayKey}_${language}`;
      const inspirationRef = doc(db, docPath);

      try {
        const inspirationSnap = await getDoc(inspirationRef);

        if (inspirationSnap.exists()) {
          const data = inspirationSnap.data();
          setVerseOfDay({ ref: data.verseRef, text: data.verseText });
          setReflectionOfDay(data.reflection);
        } else {
          // Generate new one
          try {
            const { generateDailyInspiration } = await import('../services/gemini');
            const newInspiration = await generateDailyInspiration(language);
            
            const saveData = {
              verseRef: newInspiration.verse.ref || '',
              verseText: newInspiration.verse.text || '',
              reflection: newInspiration.reflection || '',
              date: todayKey
            };

            await setDoc(inspirationRef, saveData);
            
            setVerseOfDay(newInspiration.verse);
            setReflectionOfDay(newInspiration.reflection);
          } catch (genErr: any) {
            // If limit exceeded, use fallback silent
            if (genErr.message === 'LIMITE_EXCEDIDO') {
              console.warn('AI limit reached for daily inspiration');
            }
            throw genErr; // Rethrow to trigger fallback in catch block
          }
        }
      } catch (err) {
        // If it's a Firestore error we already handled inside the 'else' block, don't handle again
        if (!(err instanceof Error && err.message.startsWith('{'))) {
          handleFirestoreError(err, OperationType.GET, docPath);
        }
        // Fallback to static if everything fails
        const verses = DAILY_VERSES[language] || DAILY_VERSES.pt;
        const reflections = DAILY_REFLECTIONS[language] || DAILY_REFLECTIONS.pt;
        
        const uidSeed = auth.currentUser?.uid.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) || 0;
        const today = new Date();
        const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
        
        const verseIndex = (dayOfYear + uidSeed) % verses.length;
        const reflectionIndex = (dayOfYear + uidSeed) % reflections.length;
        
        setVerseOfDay(verses[verseIndex]);
        setReflectionOfDay(reflections[reflectionIndex]);
      }
    }

    loadDailyInspiration();

    // Check user birthday
    if (profile?.birthDate) {
      const today = format(new Date(), 'MM-dd');
      const userBday = profile.birthDate.substring(5); // Assuming YYYY-MM-DD
      if (today === userBday) {
        setIsUserBirthday(true);
      }
    }

    // Load other birthdays
    async function checkBirthdays() {
      if (!auth.currentUser) return;
      const birthdaysRef = collection(db, 'users', auth.currentUser.uid, 'birthdays');
      const snapshot = await getDocs(birthdaysRef);
      const allBirthdays = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Birthday));
      
      const today = format(new Date(), 'MM-dd');
      const celebratingToday = allBirthdays.filter(b => b.date.substring(5) === today);
      setTodayBirthdays(celebratingToday);
    }
    checkBirthdays();

    // Refresh timer at midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    const timer = setTimeout(() => {
      loadDailyInspiration();
    }, msUntilMidnight);

    return () => clearTimeout(timer);
  }, [language, auth.currentUser]);

  useEffect(() => {
    if (profile?.displayName || auth.currentUser?.displayName) {
      setTempName(profile?.displayName || auth.currentUser?.displayName || '');
    }
  }, [profile]);

  const handleSaveName = async () => {
    if (!auth.currentUser || !tempName.trim()) {
      setIsEditingName(false);
      return;
    };
    
    setIsSaving(true);
    try {
      const { updateProfile } = await import('firebase/auth');
      const { getDoc, doc, setDoc, serverTimestamp } = await import('firebase/firestore');

      await updateProfile(auth.currentUser, { displayName: tempName });
      
      const docRef = doc(db, 'users', auth.currentUser.uid);
      const docSnap = await getDoc(docRef);
      const isNew = !docSnap.exists();

      const saveContent: any = {
        uid: auth.currentUser.uid,
        displayName: tempName,
        email: auth.currentUser.email || '',
        updatedAt: serverTimestamp()
      };

      if (isNew) {
        saveContent.createdAt = serverTimestamp();
      }

      await setDoc(docRef, saveContent, { merge: true });

      setIsEditingName(false);
    } catch (err) {
      console.error('Error updating name:', err);
      alert(t('errorUpdateName'));
    } finally {
      setIsSaving(false);
    }
  };

  const [today, setToday] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setToday(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;

    const startOfToday = new Date(today);
    startOfToday.setHours(0, 0, 0, 0);

    const qMinisterial = query(
      collection(db, 'ministerial_agenda'),
      and(
        or(
          where('userId', '==', auth.currentUser.uid),
          where('guestId', '==', auth.currentUser.uid)
        ),
        where('date', '>=', startOfToday)
      ),
      orderBy('date', 'asc'),
      limit(3)
    );

    const qEvents = query(
      collection(db, 'agenda'),
      and(
        or(
          where('userId', '==', auth.currentUser.uid),
          where('guestId', '==', auth.currentUser.uid)
        ),
        where('date', '>=', startOfToday)
      ),
      orderBy('date', 'asc'),
      limit(3)
    );

    const unsubMinisterial = onSnapshot(qMinisterial, (snapshot) => {
      setMinisterialAgenda(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AgendaItem)));
    }, (error) => {
      console.warn("Dashboard ministerial snapshot error:", error);
      handleFirestoreError(error, OperationType.LIST, 'ministerial_agenda');
    });

    const unsubEvents = onSnapshot(qEvents, (snapshot) => {
      setUpcomingEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AgendaItem)));
    }, (error) => {
      console.warn("Dashboard events snapshot error:", error);
      handleFirestoreError(error, OperationType.LIST, 'agenda');
    });

    return () => {
      unsubMinisterial();
      unsubEvents();
    };
  }, [auth.currentUser, today.toDateString()]); // Re-run if day changes

  const getLocale = () => {
    switch (language) {
      case 'en': return enUS;
      case 'es': return es;
      default: return ptBR;
    }
  };

  const formatSermonDate = (date: any) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : date;
    
    const time = new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
    
    const dayMonth = new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US', {
      day: '2-digit',
      month: 'short'
    }).format(d)
      .replace('.', '')
      .replace(/ de /g, ' ')
      .trim();
    
    const capitalized = dayMonth.split(' ').map(word => 
      word.length > 2 ? word.charAt(0)?.toUpperCase() + word.slice(1) : word
    ).join(' ');
    
    return `${capitalized} ${t('at')} ${time}`;
  };

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-8 border-b border-app-border/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-app-text transition-colors">
              {t('welcome')}, 
            </h1>
            {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input 
                    autoFocus
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                    disabled={isSaving}
                    className="text-xl font-bold bg-app-card/60 border-b-2 border-app-accent text-app-text focus:outline-none px-2 py-0.5 rounded-t-md min-w-[200px]"
                    placeholder={t('yourName')}
                  />
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={handleSaveName}
                      disabled={isSaving}
                      className="p-1.5 text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-app-card rounded-lg transition-all flex items-center gap-2 shadow-sm"
                      title="Salvar"
                    >
                      {isSaving ? (
                        <Clock size={14} className="animate-spin" />
                      ) : (
                        <Plus className="rotate-45" size={14} />
                      )}
                      <span className="text-[10px] font-bold uppercase">{t('save')}</span>
                    </button>
                    <button 
                      onClick={() => {
                        setIsEditingName(false);
                        setTempName(profile?.displayName || auth.currentUser?.displayName || '');
                      }}
                      disabled={isSaving}
                      className="p-1.5 text-app-secondary hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                      title={t('cancel')}
                    >
                      <Plus className="rotate-45" size={14} />
                    </button>
                  </div>
                </div>
            ) : (
              <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingName(true)}>
                <h1 className="text-xl font-bold tracking-tight text-app-text transition-colors underline decoration-app-accent/20 decoration-2 underline-offset-4 group-hover:decoration-app-accent transition-all">
                  {(profile?.displayName || auth.currentUser?.displayName || 'Ministro')?.split(' ').slice(0, 2).join(' ')}
                </h1>
                <Edit3 
                  size={16} 
                  className="text-app-secondary opacity-0 group-hover:opacity-100 transition-all hover:text-indigo-500" 
                />
              </div>
            )}
          </div>
          <p className="text-base text-app-secondary font-medium font-serif italic transition-colors">{t('prepareMessage')}</p>
        </div>
        <button 
          id="btn-new-sermon"
          onClick={() => onEdit(null)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-[11px] hover:bg-indigo-500 hover:shadow-indigo-500/25 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all shadow-lg shadow-indigo-600/20 self-start border border-white/10 uppercase tracking-widest"
        >
          <Plus size={14} className="stroke-[3]" />
          <span>{t('newMinistration')}</span>
        </button>
      </header>

      {/* Birthday Notifications */}
      <AnimatePresence>
        {(isUserBirthday || todayBirthdays.length > 0) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="relative z-20"
          >
            {isUserBirthday && (
              <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-cyan-700 p-6 rounded-[32px] shadow-2xl shadow-blue-500/30 border border-white/20 mb-6 overflow-hidden group relative">
                <div className="absolute -top-10 -right-10 p-4 opacity-10 group-hover:scale-110 transition-transform rotate-12">
                  <PartyPopper size={180} />
                </div>
                <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
                  <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center text-white backdrop-blur-xl shadow-2xl animate-bounce border border-white/30">
                    <Cake size={40} />
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full mb-2 backdrop-blur-md">
                      <Sparkles size={12} className="text-cyan-300" />
                      <span className="text-[10px] font-black text-cyan-200 uppercase tracking-[0.2em]">{t('congratulations')}</span>
                    </div>
                    <h2 className="text-3xl font-black text-white tracking-tight leading-tight">
                      {t('happyBirthday').replace('{name}', profile?.displayName?.split(' ')[0] || auth.currentUser?.displayName?.split(' ')[0] || '')}
                    </h2>
                    <p className="text-blue-100 font-serif italic text-lg leading-snug mt-2 opacity-90">
                      {t('todayIsYourBirthday')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {todayBirthdays.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {todayBirthdays.map(b => (
                  <div key={b.id} className="bg-white/5 border border-white/10 rounded-3xl p-5 flex items-center gap-4 hover:bg-white/10 transition-all border-l-4 border-l-amber-500 shadow-xl shadow-amber-500/5 group">
                    <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-110 transition-transform">
                      <Gift size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-amber-500 font-black uppercase tracking-widest mb-0.5">{t('churchMemberBirthday')}</p>
                      <h3 className="font-bold text-app-text truncate text-lg">{b.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <PartyPopper size={12} className="text-amber-500/60" />
                        <span className="text-[11px] text-app-secondary font-medium tracking-wide">
                          {t('happyBirthday').replace('{name}', '')}
                        </span>
                        {b.relationship && (
                          <span className="px-2 py-0.5 bg-white/5 rounded-full text-[9px] text-amber-400/80 font-bold uppercase tracking-wider border border-white/5">
                            {b.relationship}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Daily Inspiration Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 relative">
        <div className="hidden lg:block absolute left-1/2 top-4 bottom-4 w-px bg-app-border/40" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-indigo-500/10 to-blue-500/10 card-spirit p-6 sm:p-8 relative overflow-hidden group shadow-md border-indigo-500/20"
        >
          <div className="absolute -right-6 -bottom-6 opacity-10 pointer-events-none transition-transform duration-700 group-hover:scale-110 group-hover:rotate-6">
            <BookOpen size={180} className="text-indigo-600" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-1 px-2 pb-0.5 bg-indigo-500 text-white rounded-md text-[8px] font-black tracking-[0.2em] uppercase shadow-sm">{t('daily')}</span>
                <span className="text-[10px] uppercase tracking-widest font-bold text-indigo-500">{t('verseOfDay')}</span>
              </div>
              <div className="h-px flex-1 bg-indigo-500/10 mx-4" />
            </div>
            <p className="text-lg sm:text-xl font-serif leading-relaxed mb-4 text-app-text italic">"{verseOfDay.text}"</p>
            <p className="text-app-secondary text-sm font-medium">— {verseOfDay.ref} ({language === 'pt' ? 'NVI' : language === 'es' ? 'RVR' : 'NIV'})</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-emerald-500/5 to-teal-500/5 card-spirit p-6 sm:p-8 relative overflow-hidden group shadow-md border-emerald-500/20"
        >
          <div className="absolute -right-4 -bottom-4 opacity-10 pointer-events-none transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
            <Heart size={120} className="text-emerald-500" />
          </div>
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-emerald-500">{t('dailyReflection')}</span>
              </div>
              <div className="h-px flex-1 bg-emerald-500/10 mx-4" />
            </div>
            <div className="flex-1 mt-auto">
              <p className="text-lg sm:text-xl font-serif leading-relaxed text-app-text italic">
                "{reflectionOfDay}"
              </p>
              <p className="text-[10px] text-emerald-500/60 font-bold uppercase tracking-wider italic mt-4">{t('thinkAboutIt')}</p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 pt-4">
        {/* Ministerial Agenda */}
        <section className="space-y-5">
          <div className="flex items-center justify-between px-2">
            <div className="flex flex-col">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 text-indigo-500">
                <Mic2 size={14} />
                {t('ministerialAgenda')}
              </h2>
              <p className="text-[10px] text-slate-500 font-medium ml-6 mt-1">{t('nextAppointmentsSub')}</p>
            </div>
            <button 
              onClick={onSeeAgenda}
              className="text-[10px] font-black uppercase tracking-widest text-app-secondary hover:text-indigo-400 transition-colors bg-app-card px-3 py-1.5 rounded-full border border-app-border hover:border-app-border/40 shadow-sm"
            >
              {t('seeAgenda')}
            </button>
          </div>
          
          <div className="space-y-3 relative">
            {ministerialAgenda.filter(item => {
              const itemDate = item.date?.toDate ? item.date.toDate() : new Date(item.date);
              return itemDate >= today;
            }).length > 0 ? ministerialAgenda.filter(item => {
              const itemDate = item.date?.toDate ? item.date.toDate() : new Date(item.date);
              return itemDate >= today;
            }).map((item) => {
              const itemDate = item.date?.toDate ? item.date.toDate() : new Date(item.date);
              const isToday = format(itemDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');

              return (
                <motion.div 
                  key={item.id}
                  whileHover={{ x: 6, backgroundColor: 'var(--glass-bg)' }}
                  className={`card-spirit p-4 transition-all flex items-center gap-4 hover:shadow-xl relative overflow-hidden group cursor-pointer ${
                    isToday ? 'border-indigo-500/30 bg-indigo-500/5 shadow-lg shadow-indigo-500/5' : 'border-app-border'
                  }`}
                  onClick={onSeeAgenda}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 transform scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-500" />
                  
                  <div className={`w-12 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 transition-all duration-500 ${
                    isToday ? 'bg-indigo-600 shadow-lg shadow-indigo-600/20 text-white' : 'bg-app-card text-app-text border border-app-border group-hover:border-indigo-500/20'
                  }`}>
                    <span className={`text-[9px] font-black uppercase tracking-tighter mb-0.5 ${isToday ? 'text-white/80' : 'text-indigo-500'}`}>
                      {format(itemDate, 'MMM', { locale: getLocale() })}
                    </span>
                    <span className="text-xl font-black leading-none">
                      {format(itemDate, 'dd')}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                        isToday ? 'bg-indigo-500/20 text-indigo-400' : 'bg-app-card text-app-secondary border border-app-border'
                      }`}>
                        {item.type === 'preaching' ? t('preaching') : 
                         item.type === 'culto' ? t('cult') :
                         item.type === 'celula' ? t('cell') :
                         item.type === 'congresso' ? t('congress') : 
                         item.type === 'extra' ? t('others') : t('agenda')}
                      </span>
                      {isToday && (
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                          <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">{t('now')}</span>
                        </div>
                      )}
                    </div>
                    <h3 className="font-bold text-app-text group-hover:text-indigo-500 transition-colors uppercase text-[12px] tracking-wide truncate">
                      {item.title}
                    </h3>
                    {item.userId !== auth.currentUser?.uid && (
                      <p className="text-[9px] font-bold text-indigo-400/80 mt-0.5 truncate uppercase tracking-tighter">
                        {t('from')}: {item.userName || 'Organizador'}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-app-secondary">
                      <div className="flex items-center gap-1 text-[9px] font-bold">
                        <Clock size={10} className="group-hover:text-indigo-500 transition-colors" />
                        <span>{format(itemDate, 'HH:mm')}h</span>
                        {isAfter(itemDate, new Date()) && (
                          <span className="text-[8px] font-black text-indigo-400 ml-2 uppercase">
                            {language === 'pt' ? 'Em' : language === 'es' ? 'En' : 'In'} {formatDistanceToNow(itemDate, { locale: getLocale() })}
                          </span>
                        )}
                      </div>
                      {item.location && (
                        <div className="flex items-center gap-1 text-[9px] font-bold">
                          <MapPin size={10} className="text-indigo-400/40 group-hover:text-indigo-500 transition-colors" />
                          <span className="truncate max-w-[120px]">{item.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-app-secondary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </motion.div>
              );
            }) : (
              <div className="p-12 text-center bg-app-card/30 rounded-[32px] border border-dashed border-app-border">
                <div className="w-14 h-14 bg-app-card rounded-full flex items-center justify-center mx-auto mb-4 border border-app-border">
                  <CalIcon size={24} className="text-app-secondary" />
                </div>
                <p className="text-app-secondary font-medium text-xs tracking-wide">{t('ministerialAgendaPlaceholder')}</p>
              </div>
            )}
          </div>
        </section>

        {/* Upcoming Events */}
        <section className="space-y-5">
          <div className="flex items-center justify-between px-2">
            <div className="flex flex-col">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 text-indigo-500">
                <CalIcon size={14} />
                {t('upcomingEvents')}
              </h2>
              <p className="text-[10px] text-slate-500 font-medium ml-6 mt-1">{language === 'pt' ? 'Sua programação de atividades' : language === 'es' ? 'Tu programación de actividades' : 'Your activity schedule'}</p>
            </div>
            <button 
              onClick={() => onSeeEvents()}
              className="text-[10px] font-black uppercase tracking-widest text-app-secondary hover:text-indigo-400 transition-colors bg-app-card px-3 py-1.5 rounded-full border border-app-border hover:border-app-border/40 shadow-sm"
            >
              {t('seeMore')}
            </button>
          </div>

          <div className="space-y-3">
            {upcomingEvents.filter(event => {
              const eventDate = event.date?.toDate ? event.date.toDate() : new Date(event.date);
              return eventDate >= today;
            }).length > 0 ? upcomingEvents.filter(event => {
              const eventDate = event.date?.toDate ? event.date.toDate() : new Date(event.date);
              return eventDate >= today;
            }).map((event) => {
              const eventDate = event.date?.toDate ? event.date.toDate() : new Date(event.date);
              const isToday = format(eventDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
              
              return (
                <motion.div 
                  key={event.id}
                  whileHover={{ x: 6, backgroundColor: 'var(--glass-bg)' }}
                  className={`card-spirit p-4 transition-all flex items-center gap-4 hover:shadow-xl relative overflow-hidden group cursor-pointer ${
                    isToday ? 'border-indigo-500/30 bg-indigo-500/5 shadow-lg shadow-indigo-500/5' : 'border-app-border'
                  }`}
                  onClick={() => onSeeEvents()}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 transform scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-500" />
                  
                  <div className={`w-12 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 transition-all duration-500 ${
                    isToday ? 'bg-indigo-600 shadow-lg shadow-indigo-600/20 text-white' : 'bg-app-card text-app-text border border-app-border group-hover:border-indigo-500/20'
                  }`}>
                    <span className={`text-[9px] font-black uppercase tracking-tighter mb-0.5 ${isToday ? 'text-white/80' : 'text-indigo-400'}`}>
                      {format(eventDate, 'MMM', { locale: getLocale() })}
                    </span>
                    <span className="text-xl font-black leading-none">
                      {format(eventDate, 'dd')}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                        isToday ? 'bg-indigo-500/20 text-indigo-400' : 'bg-app-card text-app-secondary border border-app-border'
                      }`}>
                        {event.type === 'preaching' ? t('preaching') : 
                         event.type === 'culto' ? t('cult') :
                         event.type === 'celula' ? t('cell') :
                         event.type === 'congresso' ? t('congress') : 
                         event.type === 'extra' ? t('others') : event.type}
                      </span>
                      {isToday && (
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                          <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">{t('today')}</span>
                        </div>
                      )}
                    </div>
                    <h3 className="font-bold text-app-text group-hover:text-indigo-500 transition-colors uppercase text-[12px] tracking-wide truncate">
                      {event.title}
                    </h3>
                    {event.userId !== auth.currentUser?.uid && (
                      <p className="text-[9px] font-bold text-indigo-400/80 mt-0.5 truncate uppercase tracking-tighter">
                        {t('from')}: {event.userName || 'Organizador'}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-app-secondary">
                      <div className="flex items-center gap-1 text-[9px] font-bold">
                        <Clock size={10} className="group-hover:text-indigo-400 transition-colors" />
                        <span>{format(eventDate, 'HH:mm')}h</span>
                        {isAfter(eventDate, new Date()) && (
                          <span className="text-[8px] font-black text-indigo-400 ml-2 uppercase">
                            {(language === 'pt' ? 'Em' : language === 'es' ? 'En' : 'In')} {formatDistanceToNow(eventDate, { locale: getLocale() })}
                          </span>
                        )}
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-1 text-[9px] font-bold">
                          <MapPin size={10} className="text-indigo-400/40 group-hover:text-indigo-400 transition-colors" />
                          <span className="truncate max-w-[120px]">{event.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-app-secondary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </motion.div>
              );
            }) : (
              <div className="p-12 text-center bg-app-card/30 rounded-[32px] border border-dashed border-app-border">
                <div className="w-14 h-14 bg-app-card rounded-full flex items-center justify-center mx-auto mb-4 border border-app-border">
                  <CalIcon size={24} className="text-app-secondary" />
                </div>
                <p className="text-app-secondary font-medium text-xs tracking-wide">{t('noScheduledEvents')}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
