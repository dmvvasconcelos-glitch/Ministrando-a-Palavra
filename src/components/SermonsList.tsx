import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, deleteDoc, doc, or } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Sermon } from '../types';
import { 
  Search, 
  Filter, 
  MoreVertical, 
  Trash2, 
  Edit3, 
  Play, 
  Calendar,
  BookOpen,
  Plus,
  Users,
  Shield,
  FileText,
  Sparkles,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

interface SermonsListProps {
  onEdit: (id: string) => void;
  onPreach: (id: string) => void;
  onNew: () => void;
}

export default function SermonsList({ onEdit, onPreach, onNew }: SermonsListProps) {
  const { t, language } = useLanguage();
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'draft' | 'published' | 'shared'>('all');

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    // We use two separate subscriptions and merge them to avoid complex index requirements
    const ownedQuery = query(
      collection(db, 'sermons'),
      where('ownerId', '==', uid),
      orderBy('updatedAt', 'desc')
    );

    // Shared query is tricky in Firestore because of dynamic keys.
    // For now, we'll try to find any sermon where the sharedWith map has our key.
    const sharedQuery = query(
      collection(db, 'sermons'),
      where(`sharedWith.${uid}`, 'in', ['view', 'edit'])
    );

    let ownedSermons: Sermon[] = [];
    let sharedSermons: Sermon[] = [];

    const updateSermons = () => {
      const all = [...ownedSermons, ...sharedSermons].sort((a, b) => {
        const dateA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
        const dateB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
        return dateB - dateA;
      });
      
      // Filter out duplicates just in case
      const unique = Array.from(new Map(all.map(s => [s.id, s])).values());
      setSermons(unique);
      setLoading(false);
    };

    const unsubOwned = onSnapshot(ownedQuery, (snap) => {
      ownedSermons = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sermon));
      updateSermons();
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sermons/owned'));

    const unsubShared = onSnapshot(sharedQuery, (snap) => {
      sharedSermons = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sermon));
      updateSermons();
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sermons/shared'));

    return () => {
      unsubOwned();
      unsubShared();
    };
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'sermons', id));
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `sermons/${id}`);
    }
  };

  const filteredSermons = sermons.filter(sermon => {
    const isOwner = sermon.ownerId === auth.currentUser?.uid;
    const matchesSearch = sermon.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         sermon.theme.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesFilter = true;
    if (filter === 'draft') matchesFilter = sermon.status === 'draft' || !sermon.status;
    else if (filter === 'published') matchesFilter = sermon.status === 'published';
    else if (filter === 'shared') matchesFilter = !isOwner;
    
    return matchesSearch && matchesFilter;
  });

  const formatSermonDate = (date: any) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : date;
    
    // Only time for today, otherwise full date/time?
    // The user specifically asked for the "hora" (hour/time)
    const localeStr = language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US';
    const atStr = t('at');
    
    const time = new Intl.DateTimeFormat(localeStr, {
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
    
    const dayMonth = new Intl.DateTimeFormat(localeStr, {
      day: '2-digit',
      month: 'short'
    }).format(d)
      .replace('.', '')
      .replace(/ de /g, ' ')
      .trim();
    
    const capitalizedMonth = dayMonth.split(' ').map((word, idx) => 
      idx > 0 && word.length > 2 ? word.charAt(0).toUpperCase() + word.slice(1) : word
    ).join(' ');
    
    return `${capitalizedMonth} ${atStr} ${time}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-app-text">{t('myMinistries')}</h1>
          <p className="text-app-secondary font-medium tracking-wide uppercase transition-colors">{t('myMinistriesSub')}</p>
        </div>
        <button 
          onClick={onNew}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-[11px] hover:bg-indigo-500 hover:shadow-indigo-500/25 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all shadow-lg shadow-indigo-600/20 self-start border border-white/10 uppercase tracking-widest"
        >
          <Plus size={14} className="stroke-[3]" />
          <span>{t('newMinistry')}</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-app-secondary" size={18} />
          <input 
            type="text"
            placeholder={t('searchSermonPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-app-card border border-app-border rounded-2xl py-3 pl-12 pr-4 text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent/50 transition-all"
          />
        </div>
        <div className="flex bg-app-card p-1 rounded-2xl border border-app-border w-full md:w-auto overflow-x-auto no-scrollbar">
          {(['all', 'draft', 'published', 'shared'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`
                px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex-1 md:flex-none whitespace-nowrap
                ${filter === f ? 'bg-app-accent text-white shadow-lg' : 'text-app-secondary hover:text-app-text'}
              `}
            >
              {f === 'all' ? t('all') : f === 'draft' ? t('drafts') : f === 'published' ? t('published') : t('shared')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredSermons.map((sermon) => {
            const isOwner = sermon.ownerId === auth.currentUser?.uid;
            const permission = sermon.sharedWith?.[auth.currentUser?.uid || ''];
            
            return (
                <motion.div
                  layout
                  key={sermon.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ y: -4, backgroundColor: 'var(--glass-bg)' }}
                  className="frosted-glass rounded-[32px] p-6 flex flex-col group hover:border-indigo-500/30 transition-all border border-app-border relative overflow-hidden group/card shadow-sm hover:shadow-xl cursor-pointer"
                  onClick={() => onEdit(sermon.id)}
                >
                  <div className="absolute -right-6 -bottom-6 opacity-[0.03] group-hover:opacity-10 transition-all pointer-events-none duration-700 group-hover:scale-125 group-hover:-rotate-12">
                    <BookOpen size={140} className="text-app-text" />
                  </div>
                  
                  <div className="absolute left-[-1px] top-4 bottom-4 w-1.5 bg-indigo-500 rounded-r-lg opacity-0 group-hover:opacity-100 transition-all duration-300 transform -translate-x-2 group-hover:translate-x-0" />
                  
                  <div className="flex justify-between items-start mb-5 relative z-10">
                    <div className="w-14 h-14 rounded-2xl bg-app-bg border border-app-border flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-app-accent/10 group-hover:border-app-accent/20 transition-all duration-500 shadow-sm">
                      {isOwner ? <FileText size={24} className="text-app-secondary group-hover:text-app-accent transition-colors" /> : <Users size={24} className="text-indigo-400" />}
                    </div>
                    <div className="flex gap-1 items-center relative z-20">
                      <AnimatePresence mode="wait">
                        {deletingId === sermon.id ? (
                          <motion.div 
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="flex items-center gap-1 bg-red-500/10 rounded-lg p-1 border border-red-500/20 shadow-inner"
                          >
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDelete(sermon.id); }}
                              className="px-3 py-1.5 bg-red-500 text-white text-[10px] font-black uppercase rounded-lg hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                            >
                              {t('confirm')}
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                              className="p-1.5 text-app-secondary hover:text-rose-500 transition-colors"
                            >
                              <Plus className="rotate-45" size={16} />
                            </button>
                          </motion.div>
                        ) : (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all"
                          >
                            <button 
                              onClick={(e) => { e.stopPropagation(); onPreach(sermon.id); }}
                              className="p-2.5 bg-indigo-600 text-white rounded-xl hover:scale-110 active:scale-95 transition-all shadow-lg shadow-indigo-600/20 group/play border border-indigo-400/20"
                              title={t('pulpitTool')}
                            >
                              <Play size={18} fill="currentColor" className="group-hover/play:translate-x-0.5 transition-transform" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); onEdit(sermon.id); }}
                              className="p-2.5 bg-app-card border border-app-border hover:border-indigo-500/20 rounded-xl text-app-secondary hover:text-indigo-600 transition-all group/edit shadow-sm"
                              title={isOwner || permission === 'edit' ? t('editSermon') : t('viewAll')}
                            >
                              {isOwner || permission === 'edit' ? <Edit3 size={18} className="group-hover/edit:scale-110 transition-transform" /> : <BookOpen size={18} />}
                            </button>
                            {isOwner && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setDeletingId(sermon.id); }}
                                className="p-2.5 hover:bg-red-500/10 rounded-xl text-app-secondary hover:text-red-500 transition-all opacity-40 group-hover:opacity-100"
                                title={t('removeStudy')}
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="space-y-4 relative z-10 flex-1">
                    <div className="space-y-3 pb-4 border-b border-app-border/40">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                          sermon.status === 'published' 
                            ? 'bg-emerald-500/5 text-emerald-500 border-emerald-500/20' 
                            : 'bg-amber-500/5 text-amber-500 border-amber-500/20'
                        }`}>
                          {sermon.status === 'published' ? t('publishedLabel') : t('draftLabel')}
                        </span>
                        
                        {!isOwner && (
                          <div className="flex items-center gap-1 text-[8px] bg-indigo-500/5 text-indigo-400 px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-indigo-500/10 shadow-sm">
                            <Shield size={10} />
                            {permission === 'edit' ? t('editorTool') : t('reader')}
                          </div>
                        )}

                        {isOwner && sermon.sharedWith && Object.keys(sermon.sharedWith).length > 0 && (
                          <div className="flex items-center gap-1 text-[8px] bg-emerald-500/5 text-emerald-400 px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-emerald-500/10 shadow-sm" title={t('sharedWithUsers').replace('{count}', Object.keys(sermon.sharedWith).length.toString())}>
                            <Users size={10} />
                            <span>{Object.keys(sermon.sharedWith).length}</span>
                          </div>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-app-text leading-tight group-hover:text-app-accent transition-colors uppercase tracking-wide truncate">
                        {sermon.title || t('untitled')}
                      </h3>
                      
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-app-bg text-app-secondary border border-app-border rounded-full text-[9px] font-black uppercase tracking-widest truncate max-w-[200px]">
                          {sermon.theme || t('noTheme')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-app-secondary relative z-10">
                    <div className="flex items-center gap-1.5 text-[10px] text-app-secondary/80 uppercase tracking-tight font-bold">
                      <Clock size={12} className="text-app-secondary/40" />
                      <span>{sermon.status === 'published' ? t('publishedLabel') : t('savedProgress')} {formatSermonDate(sermon.updatedAt)}</span>
                    </div>
                  </div>
                </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredSermons.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center space-y-4">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
              <Search size={32} className="text-slate-600" />
            </div>
            <p className="text-app-secondary font-serif italic text-lg">{t('noSermonsFound')}</p>
            <button 
              onClick={() => { setSearchTerm(''); setFilter('all'); }}
              className="text-app-accent font-bold uppercase text-xs tracking-[0.2em]"
            >
              {t('clearFilters')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
