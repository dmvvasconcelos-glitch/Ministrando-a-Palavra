import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Plus, 
  Trash2, 
  Bell, 
  ChevronRight,
  Search,
  CheckCircle2,
  X,
  User as UserIcon,
  Mic2,
  BookOpen,
  Users,
  Home,
  Globe,
  Activity,
  RefreshCw,
  MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, formatDistanceToNow, isAfter } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { collection, query, where, orderBy, onSnapshot, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, Timestamp, or, getDocs, limit, getDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { AgendaItem, UserProfile, Sermon } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

export default function MinisterialAgenda({ onPreach }: { onPreach?: (id: string) => void }) {
  const { t, language } = useLanguage();
  const [items, setItems] = useState<AgendaItem[]>([]);
  
  const locale = language === 'en' ? enUS : language === 'es' ? es : ptBR;
  const userNameTranslated = t('user');

  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewingItem, setViewingItem] = useState<AgendaItem | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notify24h, setNotify24h] = useState(true);
  const [notifyDayOf, setNotifyDayOf] = useState(true);
  const [sermonId, setSermonId] = useState('');
  const [type, setType] = useState('preaching');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Guest state
  const [guestSearch, setGuestSearch] = useState('');
  const [foundUsers, setFoundUsers] = useState<UserProfile[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<UserProfile | null>(null);
  const [isSearchingGuests, setIsSearchingGuests] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    const fetchProfile = async () => {
      const docRef = doc(db, 'users', auth.currentUser!.uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        setUserProfile(data);
        setNotify24h(data.defaultNotify24h ?? true);
        setNotifyDayOf(data.defaultNotifyDayOf ?? true);
      }
    };

    fetchProfile();
  }, []);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!auth.currentUser) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, 'ministerial_agenda'),
      or(
        where('userId', '==', auth.currentUser.uid),
        where('guestId', '==', auth.currentUser.uid)
      ),
      orderBy('date', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AgendaItem[];
      setItems(docs);
      setLoading(false);
    }, (error) => {
      console.error("MinisterialAgenda snapshot error:", error);
      handleFirestoreError(error, OperationType.GET, 'ministerial_agenda');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [refreshKey]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'sermons'),
      where('ownerId', '==', auth.currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Sermon[];
      setSermons(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'sermons');
    });

    return () => unsubscribe();
  }, []);

  // Search users for invitation
  useEffect(() => {
    const searchUsers = async () => {
      if (guestSearch.length < 3) {
        setFoundUsers([]);
        return;
      }

      setIsSearchingGuests(true);
      try {
        const q = query(
          collection(db, 'users'),
          where('email', '>=', guestSearch.toLowerCase()),
          where('email', '<=', guestSearch.toLowerCase() + '\uf8ff'),
          limit(5)
        );
        const snap = await getDocs(q);
        const users = snap.docs
          .map(d => d.data() as UserProfile)
          .filter(u => u.uid !== auth.currentUser?.uid);
        setFoundUsers(users);
      } catch (err) {
        console.error("Search users error:", err);
      } finally {
        setIsSearchingGuests(false);
      }
    };

    const timer = setTimeout(searchUsers, 500);
    return () => clearTimeout(timer);
  }, [guestSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !title || !date || !time) return;

    try {
      const eventDate = new Date(`${date}T${time}`);
      
      const itemData = {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || userNameTranslated,
        userEmail: auth.currentUser.email || '',
        title,
        description,
        location,
        address,
        date: Timestamp.fromDate(eventDate),
        type,
        isPreaching: type === 'preaching',
        notify24h,
        notifyDayOf,
        sermonId: sermonId || '',
        guestId: selectedGuest?.uid || '',
        guestName: selectedGuest?.displayName || '',
        updatedAt: serverTimestamp()
      };

      if (editingItemId) {
        await updateDoc(doc(db, 'ministerial_agenda', editingItemId), itemData);
      } else {
        await addDoc(collection(db, 'ministerial_agenda'), {
          ...itemData,
          createdAt: serverTimestamp(),
        });
      }

      setIsAdding(false);
      setEditingItemId(null);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'ministerial_agenda');
    }
  };

  const handleEdit = (item: AgendaItem) => {
    const eventDate = item.date?.toDate?.() || new Date(item.date);
    setTitle(item.title);
    setDescription(item.description || '');
    setLocation(item.location || '');
    setAddress(item.address || '');
    setDate(format(eventDate, 'yyyy-MM-dd'));
    setTime(format(eventDate, 'HH:mm'));
    setNotify24h(item.notify24h || false);
    setNotifyDayOf(item.notifyDayOf || false);
    setSermonId(item.sermonId || '');
    setType(item.type || 'preaching');
    
    if (item.guestId) {
      setSelectedGuest({
        uid: item.guestId,
        displayName: item.guestName || 'Convidado',
        updatedAt: null
      });
    } else {
      setSelectedGuest(null);
    }

    setEditingItemId(item.id);
    setViewingItem(null);
    setIsAdding(true);
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setAddress('');
    setDate('');
    setTime('');
    setNotify24h(true);
    setNotifyDayOf(true);
    setSermonId('');
    setType('preaching');
    setSelectedGuest(null);
    setGuestSearch('');
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    try {
      await deleteDoc(doc(db, 'ministerial_agenda', id));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `ministerial_agenda/${id}`);
    }
  };

  const filteredItems = items.filter(item => 
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.location?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2 border-b border-app-border/40">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-app-text flex items-center gap-2 md:normal-case">
            <div className="w-1.5 h-6 bg-app-accent rounded-full opacity-60" />
            {t('ministerialAgendaHeader')}
          </h1>
          <p className="text-app-secondary font-medium text-sm mt-1 opacity-70">{t('ministerialAgendaSub')}</p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center">
          <button 
            onClick={() => setRefreshKey(prev => prev + 1)}
            className="p-2.5 bg-app-card/40 border border-app-border rounded-xl text-app-secondary hover:text-indigo-500 transition-all active:rotate-180 duration-500"
            title="Atualizar"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-[9px] tracking-widest hover:bg-indigo-500 active:scale-95 transition-all shadow-xl shadow-indigo-600/20 border border-indigo-400/20"
          >
            <Plus size={14} />
            <span>{t('schedulePreachingBtn')}</span>
          </button>
          
          <a 
            href="https://wa.me/5531973148166" 
            target="_blank" 
            rel="noreferrer" 
            className="flex items-center gap-2 bg-[#25D366]/10 text-[#25D366] px-4 py-2 rounded-xl font-bold text-[9px] tracking-widest hover:bg-[#25D366] hover:text-white active:scale-95 transition-all border border-[#25D366]/20 group"
          >
            <MessageCircle size={14} className="group-hover:scale-110 transition-transform" />
            <span>WhatsApp</span>
          </a>
        </div>
      </div>

      {/* Stats/Quick Filters */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: t('statPreachings'), count: items.length, color: 'app-accent', textColor: 'text-app-accent' },
          { label: t('statAlerts'), count: items.filter(e => (e.notify24h || e.notifyDayOf) && !((e.date?.toDate?.() || new Date(e.date)) < new Date())).length, color: 'rose-500', textColor: 'text-rose-500' },
          { label: t('statToday'), count: items.filter(e => {
            const d = e.date?.toDate?.() || new Date(e.date);
            return format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          }).length, color: 'emerald-500', textColor: 'text-emerald-500' },
          { label: t('statUpcoming'), count: items.filter(e => {
            const d = e.date?.toDate?.() || new Date(e.date);
            const diff = (d.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
            return diff >= 0 && diff <= 7;
          }).length, color: 'sky-400', textColor: 'text-sky-400' },
          { label: t('statDrafted'), count: items.filter(e => (e.date?.toDate?.() || new Date(e.date)) > new Date()).length, color: 'amber-400', textColor: 'text-amber-400' },
          { label: t('statInvitations'), count: items.filter(e => e.guestId === auth.currentUser?.uid && e.userId !== e.guestId).length, color: 'indigo-400', textColor: 'text-indigo-400' }
        ].map(stat => (
          <div key={stat.label} className="bg-app-card/30 border border-app-border/40 rounded-xl p-3.5 relative overflow-hidden group hover:border-indigo-500/20 transition-all cursor-default shadow-sm">
            <span className="text-[8px] font-black tracking-widest text-app-secondary opacity-60 block mb-0.5">{stat.label}</span>
            <span className={`text-xl font-black ${stat.textColor} tracking-tight`}>{stat.count}</span>
            <div className={`absolute -right-2 -bottom-2 w-10 h-10 bg-white/5 rounded-full blur-lg group-hover:scale-150 transition-transform duration-700`} />
          </div>
        ))}
      </div>

      {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-app-secondary opacity-40 group-focus-within:text-app-accent group-focus-within:opacity-100 transition-all" size={18} />
        <input 
          type="text"
          placeholder={t('searchAgendaPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-app-card/40 border border-app-border rounded-2xl py-4 pl-14 pr-6 text-app-text font-medium placeholder:text-app-secondary/30 focus:outline-none focus:border-app-accent/40 focus:bg-app-card/60 transition-all shadow-sm"
        />
      </div>

      {/* List Section */}
      <div className="space-y-10">
        {/* Upcoming Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <h2 className="text-[10px] font-black tracking-[0.2em] text-indigo-400/80">{t('upcomingSection')}</h2>
            <div className="flex-1 h-px bg-indigo-500/10" />
          </div>

          <AnimatePresence mode="popLayout">
            {filteredItems.filter(e => (e.date?.toDate?.() || new Date(e.date)) >= new Date()).length > 0 ? (
              filteredItems
                .filter(e => (e.date?.toDate?.() || new Date(e.date)) >= new Date())
                .map((item) => {
                  const eventDate = item.date?.toDate?.() || new Date(item.date);
                  const isToday = format(eventDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                  
                  const getIcon = (type: string) => {
                    switch (type) {
                      case 'culto': return <Users size={18} />;
                      case 'celula': return <Home size={18} />;
                      case 'congresso': return <Globe size={18} />;
                      case 'extra': return <Activity size={18} />;
                      default: return <Mic2 size={18} />;
                    }
                  };
                  
                  return (
                    <motion.div
                      layout
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      onClick={() => setViewingItem(item)}
                      className={`bg-app-card/30 p-4 rounded-2xl border border-app-border/50 flex flex-col md:flex-row md:items-center gap-4 group hover:shadow-lg hover:border-indigo-500/20 transition-all relative overflow-hidden cursor-pointer ${
                        isToday ? 'bg-indigo-500/[0.03] border-indigo-500/30 shadow-indigo-500/5' : ''
                      }`}
                    >
                      <div className={`absolute top-3 bottom-3 left-0 w-1 rounded-r-lg ${
                        isToday ? 'bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.4)]' : 'bg-slate-500 opacity-10'
                      } transition-all duration-300 group-hover:w-1.5`} />
                      
                      <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 border transition-all duration-500 ${
                        isToday ? 'bg-indigo-600 text-white border-indigo-400/20 shadow-lg shadow-indigo-600/20 group-hover:scale-105' : 
                        'bg-app-bg text-app-secondary border-app-border/40 group-hover:border-indigo-500/20'
                      }`}>
                        <div className={`${isToday ? 'text-white/80' : 'text-indigo-400/60'} mb-1`}>
                          {getIcon(item.type || 'preaching')}
                        </div>
                        <div className="flex flex-col items-center leading-none">
                          <span className="text-[7px] font-black uppercase tracking-tighter opacity-80">
                            {format(eventDate, 'MMM', { locale })}
                          </span>
                          <span className="text-lg font-black mt-0.5">{format(eventDate, 'dd')}</span>
                        </div>
                      </div>
    
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center flex-wrap gap-2">
                           <span className={`px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest border transition-all ${
                             isToday ? 'bg-indigo-500 text-white border-white/20' : 'bg-app-bg text-app-secondary border-app-border'
                           }`}>
                            {item.type === 'preaching' ? t('preaching') : 
                             item.type === 'culto' ? t('cult') :
                             item.type === 'celula' ? t('cell') :
                             item.type === 'congresso' ? t('congress') : 
                             item.type === 'extra' ? t('others') : t('preaching')}
                          </span>
                          {(item.notify24h || item.notifyDayOf) && (
                            <div className="flex items-center gap-1 text-[8px] font-black tracking-widest text-indigo-400">
                              <Bell size={10} className="fill-current" />
                              <span>{t('activeAlerts')}</span>
                            </div>
                          )}
                        </div>
    
                        <h3 className="text-lg font-bold text-app-text group-hover:text-indigo-500 transition-colors tracking-tight line-clamp-1">{item.title}</h3>
                        
                        <div className="flex flex-wrap items-center gap-4 text-app-secondary font-medium text-[11px]">
                          <div className="flex items-center gap-1.5 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                            <Clock size={12} className="text-indigo-500" />
                            <span>{format(eventDate, 'HH:mm')}h</span>
                          </div>
                          {item.location && (
                            <div className="flex items-center gap-1.5 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                              <MapPin size={12} className="text-indigo-500" />
                              <span className="truncate max-w-[200px]">{item.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
    
                      <div className="flex items-center gap-2 shrink-0 md:opacity-0 group-hover:opacity-100 transition-all duration-300">
                        {item.userId === auth.currentUser?.uid && (
                          <>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(item);
                              }}
                              className="w-10 h-10 flex items-center justify-center rounded-xl bg-app-card border border-app-border text-app-secondary hover:text-indigo-500 hover:border-indigo-500/30 transition-all shadow-sm"
                              title="Editar"
                            >
                              <Plus className="rotate-45" size={18} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingId(item.id);
                              }}
                              className="w-10 h-10 flex items-center justify-center rounded-xl bg-app-card border border-app-border text-app-secondary hover:text-rose-500 hover:border-rose-500/30 transition-all shadow-sm"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingItem(item);
                          }}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-app-card border border-app-border text-app-secondary hover:text-indigo-500 hover:border-indigo-500/30 transition-all shadow-sm"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })
            ) : filteredItems.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-20 text-center bg-white/3 rounded-[48px] border border-dashed border-white/10"
              >
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Mic2 size={40} className="text-app-secondary opacity-40" />
                </div>
                <h3 className="text-xl font-bold text-app-secondary">{t('emptyAgendaTitle')}</h3>
                <p className="text-app-secondary/80 mt-2 max-w-xs mx-auto">{t('emptyAgendaSub')}</p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>

        {/* Completed Section */}
        {filteredItems.filter(e => (e.date?.toDate?.() || new Date(e.date)) < new Date()).length > 0 && (
          <section className="space-y-4">
             <div className="flex items-center gap-3 px-2">
              <h2 className="text-[10px] font-black tracking-[0.2em] text-app-secondary opacity-80">{t('completedSection')}</h2>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredItems
                .filter(e => (e.date?.toDate?.() || new Date(e.date)) < new Date())
                .sort((a, b) => {
                  const dateA = a.date?.toDate?.() || new Date(a.date);
                  const dateB = b.date?.toDate?.() || new Date(b.date);
                  return dateB.getTime() - dateA.getTime();
                })
                .map((item) => {
                  const eventDate = item.date?.toDate?.() || new Date(item.date);
                  
                  const getIconSmall = (type: string) => {
                    switch (type) {
                      case 'culto': return <Users size={12} />;
                      case 'celula': return <Home size={12} />;
                      case 'congresso': return <Globe size={12} />;
                      case 'extra': return <Activity size={12} />;
                      default: return <Mic2 size={12} />;
                    }
                  };

                  return (
                    <motion.div
                      layout
                      key={item.id}
                      onClick={() => setViewingItem(item)}
                      className="bg-app-card/10 p-3 rounded-xl border border-app-border/30 flex items-center gap-3 group grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer"
                    >
                      {/* Small Date Badge */}
                      <div className="w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 border border-white/5 bg-white/5 text-app-secondary relative">
                        <div className="absolute -right-1 -top-1 opacity-20">
                          {getIconSmall(item.type || 'preaching')}
                        </div>
                        <span className="text-[6px] font-black tracking-tighter opacity-60">
                          {format(eventDate, 'MMM', { locale })}
                        </span>
                        <span className="text-sm font-black leading-none">{format(eventDate, 'dd')}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-xs font-bold text-app-text truncate line-clamp-1">{item.title}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[8px] font-black text-emerald-500/60 flex items-center gap-1">
                            <CheckCircle2 size={10} />
                            {t('completed')}
                          </span>
                          <span className="text-[8px] text-app-secondary/60 font-medium">
                            {format(eventDate, 'HH:mm')}h
                          </span>
                        </div>
                      </div>

                      <ChevronRight size={14} className="text-app-secondary opacity-30 group-hover:translate-x-0.5 transition-transform" />
                    </motion.div>
                  );
                })}
            </div>
          </section>
        )}
      </div>

      {/* Modal Visualização */}
      <AnimatePresence>
        {viewingItem && (
          <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-md"
                onClick={() => setViewingItem(null)}
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-xl bg-[#0f172a] rounded-[32px] border border-white/10 shadow-2xl p-7 overflow-hidden"
              >
              <div className="flex justify-between items-center mb-5">
                <div className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-[9px] font-black tracking-widest border border-indigo-500/20">
                  {viewingItem.type === 'preaching' ? t('preaching') : 
                   viewingItem.type === 'culto' ? t('cult') :
                   viewingItem.type === 'celula' ? t('cell') :
                   viewingItem.type === 'congresso' ? t('congress') : 
                   viewingItem.type === 'extra' || viewingItem.type === 'others' ? t('others') : viewingItem.type}
                </div>
                <button 
                  onClick={() => setViewingItem(null)}
                  className="p-2 hover:bg-white/5 rounded-full text-slate-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
 
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-black text-app-text tracking-tight">{viewingItem.title}</h2>
                    <div className="flex items-center gap-4 mt-1.5 text-app-secondary font-medium text-xs">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-indigo-500" />
                        <span>{format(viewingItem.date?.toDate?.() || new Date(viewingItem.date), "dd 'de' MMMM", { locale })}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-indigo-500" />
                        <span>{format(viewingItem.date?.toDate?.() || new Date(viewingItem.date), "HH:mm")}h</span>
                        {isAfter(viewingItem.date?.toDate?.() || new Date(viewingItem.date), new Date()) && (
                           <span className="text-[9px] font-black text-indigo-400 ml-1 px-2 py-0.5 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                             {(language === 'en' ? 'In ' : language === 'es' ? 'En ' : 'Em ') + formatDistanceToNow(viewingItem.date?.toDate?.() || new Date(viewingItem.date), { locale })}
                          </span>
                        )}
                      </div>
                    </div>
                </div>
 
                {viewingItem.location && (
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-start gap-3">
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl">
                      <MapPin size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-app-secondary tracking-widest">{t('locationLabel')}</span>
                        {viewingItem.address && (
                          <button 
                            onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(viewingItem.address!)}`, '_blank')}
                            className="text-[9px] font-black text-indigo-400 uppercase tracking-widest hover:underline"
                          >
                            {t('navigate')}
                          </button>
                        )}
                        {!viewingItem.address && viewingItem.location && (
                          <button 
                            onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(viewingItem.location!)}`, '_blank')}
                            className="text-[9px] font-black text-indigo-400 uppercase tracking-widest hover:underline"
                          >
                            {t('navigate')}
                          </button>
                        )}
                      </div>
                      <p className="text-sm font-bold text-app-text mt-0.5">{viewingItem.location}</p>
                      {viewingItem.address && (
                        <p className="text-[11px] text-app-secondary opacity-80 mt-0.5 line-clamp-2">{viewingItem.address}</p>
                      )}
                    </div>
                  </div>
                )}
 
                {viewingItem.sermonId && (
                  <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl">
                        <BookOpen size={18} />
                      </div>
                      <div>
                        <span className="text-[9px] font-black text-emerald-600/60 tracking-widest">Ministração Associada</span>
                        <p className="text-sm font-bold mt-0.5 text-app-text">
                          {sermons.find(s => s.id === viewingItem.sermonId)?.title || t('privateSermon')}
                        </p>
                      </div>
                    </div>
                    {onPreach && sermons.find(s => s.id === viewingItem.sermonId) && (
                      <button 
                        onClick={() => onPreach(viewingItem.sermonId!)}
                        className="p-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                        title="Ir para o Púlpito"
                      >
                        <Mic2 size={16} />
                      </button>
                    )}
                  </div>
                )}
 
                {viewingItem.description && (
                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-app-secondary tracking-widest ml-1">{t('observations')}</span>
                    <div className="p-5 bg-white/5 rounded-2xl border border-white/5">
                      <p className="text-app-secondary text-xs leading-relaxed italic">{viewingItem.description}</p>
                    </div>
                  </div>
                )}
 
                {/* Info de Convite */}
                {(viewingItem.guestId || (viewingItem.userId !== auth.currentUser?.uid)) && (
                  <div className="p-5 bg-indigo-500/5 rounded-2xl border border-indigo-500/10 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                          <UserIcon size={20} />
                        </div>
                        <div>
                          <p className="text-[8px] font-black tracking-[0.2em] text-indigo-400/60 mb-0.5">
                            {viewingItem.userId === auth.currentUser?.uid ? t('invitedPerson') : t('organizerSentBy')}
                          </p>
                          <p className="text-sm font-black text-indigo-300">
                            {viewingItem.userId === auth.currentUser?.uid 
                              ? (viewingItem.guestName || t('guestBadge')) 
                              : (viewingItem.userName || t('organizer'))}
                          </p>
                        </div>
                      </div>
                      
                      {viewingItem.userId === auth.currentUser?.uid && viewingItem.guestId && (
                        <button 
                          onClick={async () => {
                            if (confirm(t('confirmRemoveGuest'))) {
                              try {
                                await updateDoc(doc(db, 'ministerial_agenda', viewingItem.id), {
                                  guestId: null,
                                  guestName: null,
                                  guestEmail: null,
                                  updatedAt: serverTimestamp()
                                });
                                setViewingItem(null);
                              } catch (e) {
                                handleFirestoreError(e, OperationType.UPDATE, 'ministerial_agenda');
                              }
                            }
                          }}
                          className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-indigo-600/20"
                        >
                          {t('removeGuest')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
 
                <div className="flex items-center gap-3 pt-3">
                  {viewingItem.userId === auth.currentUser?.uid ? (
                    <>
                      <button 
                        onClick={() => handleEdit(viewingItem)}
                        className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-[10px] tracking-widest hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/10"
                      >
                        {t('edit')}
                      </button>
                      <button 
                        onClick={() => {
                          setViewingItem(null);
                          setDeletingId(viewingItem.id);
                        }}
                        className="flex-1 py-3 bg-rose-500/10 text-rose-500 rounded-xl font-bold text-[10px] tracking-widest hover:bg-rose-500/20 transition-all"
                      >
                        {t('delete')}
                      </button>
                    </>
                  ) : (
                    <div className="flex-1 py-3 bg-white/5 text-slate-500 rounded-xl font-bold text-[10px] tracking-widest text-center opacity-50 border border-white/5">
                      {t('viewOnly')}
                    </div>
                  )}
                  <button 
                    onClick={() => setViewingItem(null)}
                    className="flex-1 py-3 bg-white/5 text-slate-400 rounded-xl font-bold text-[10px] tracking-widest hover:bg-white/10 transition-all"
                  >
                    {t('close')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>

      {/* Modal Confirmação Exclusão */}
      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                onClick={() => setDeletingId(null)}
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative w-full max-w-sm bg-[#0f172a] rounded-[40px] border border-white/10 p-8 text-center shadow-2xl"
              >
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-app-text mb-2">{t('confirmDeleteAgenda')}</h3>
              <p className="text-slate-400 text-sm mb-8 italic">{t('confirmDeleteAgendaSub')}</p>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setDeletingId(null)}
                  className="flex-1 py-4 bg-white/5 text-slate-400 rounded-2xl font-bold text-xs tracking-widest hover:bg-white/10 transition-all"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={() => handleDelete(deletingId)}
                  className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold text-xs tracking-widest shadow-lg shadow-red-500/20 hover:opacity-90 transition-all"
                >
                  {t('confirm')}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>

      {/* Modal Add */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-md"
                onClick={() => setIsAdding(false)}
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-xl bg-[#0f172a] rounded-[32px] border border-white/10 shadow-2xl p-7 overflow-hidden"
              >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-indigo-500/10 blur-3xl opacity-50 -z-10" />

              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black tracking-widest text-app-text flex items-center gap-3">
                  <Mic2 size={24} className="text-indigo-400" />
                  {editingItemId ? t('editScheduling') : t('newScheduling')}
                </h2>
                <button 
                  onClick={() => setIsAdding(false)}
                  className="p-2 hover:bg-white/5 rounded-full text-slate-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black tracking-[0.2em] text-indigo-400 ml-1">{t('categoryLabel')}</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { id: 'preaching', label: t('preaching'), icon: <Mic2 size={14} /> },
                        { id: 'culto', label: t('cult'), icon: <Users size={14} /> },
                        { id: 'celula', label: t('cell'), icon: <Home size={14} /> },
                        { id: 'congresso', label: t('congress'), icon: <Globe size={14} /> },
                        { id: 'extra', label: t('others'), icon: <Activity size={14} /> }
                      ].map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setType(cat.id)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-[10px] font-bold tracking-wider ${
                            type === cat.id 
                              ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' 
                              : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                          }`}
                        >
                          {cat.icon}
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black tracking-[0.2em] text-indigo-400 ml-1">{t('titleLabel')}</label>
                    <input 
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('titlePlaceholder')}
                      className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 text-app-text font-bold focus:outline-none focus:border-indigo-500/30 focus:bg-white/10 transition-all text-sm"
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black tracking-[0.2em] text-indigo-400 ml-1">{t('associatedSermon')}</label>
                      <div className="relative">
                        <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                        <select
                          value={sermonId}
                          onChange={(e) => {
                            const id = e.target.value;
                            setSermonId(id);
                            if (id) {
                              const selected = sermons.find(s => s.id === id);
                              if (selected && !title) {
                                setTitle(selected.title);
                              }
                            }
                          }}
                          className="w-full bg-white/5 border border-white/5 rounded-2xl py-3.5 pl-10 pr-10 text-app-text font-bold focus:outline-none focus:border-indigo-500/30 focus:bg-white/10 transition-all appearance-none cursor-pointer text-xs"
                        >
                          <option value="" className="bg-[#0f172a]">{t('selectSermonPlaceholder')}</option>
                          {sermons.map(s => (
                            <option key={s.id} value={s.id} className="bg-[#0f172a]">
                              {s.title}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <ChevronRight className="rotate-90 text-slate-600" size={12} />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black tracking-[0.2em] text-indigo-400 ml-1">{t('dateLabel')}</label>
                        <div className="relative">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
                          <input 
                            required
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full bg-white/5 border border-white/5 rounded-xl py-3.5 pl-10 pr-4 text-app-text font-bold focus:outline-none focus:border-indigo-500/30 focus:bg-white/10 transition-all text-xs [color-scheme:dark]"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black tracking-[0.2em] text-indigo-400 ml-1">{t('timeLabel')}</label>
                        <div className="relative">
                          <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
                          <input 
                            required
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="w-full bg-white/5 border border-white/5 rounded-xl py-3.5 pl-10 pr-4 text-app-text font-bold focus:outline-none focus:border-indigo-500/30 focus:bg-white/10 transition-all text-xs [color-scheme:dark]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black tracking-[0.2em] text-indigo-400 ml-1">{t('locationLabel')}</label>
                      <div className="relative">
                        <Plus className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 rotate-45" size={16} />
                        <input 
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder={t('locationPlaceholder')}
                          className="w-full bg-white/5 border border-white/5 rounded-xl py-3.5 pl-10 pr-4 text-app-text font-bold focus:outline-none focus:border-indigo-500/30 focus:bg-white/10 transition-all text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black tracking-[0.2em] text-indigo-400 ml-1">{t('addressLabel')}</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                        <input 
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder={t('addressPlaceholder')}
                          className="w-full bg-white/5 border border-white/5 rounded-xl py-3.5 pl-10 pr-4 text-app-text font-bold focus:outline-none focus:border-indigo-500/30 focus:bg-white/10 transition-all text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black tracking-[0.2em] text-indigo-400 ml-1">{t('invitePartner')}</label>
                    {selectedGuest ? (
                      <div className="flex items-center justify-between p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xs ring-2 ring-indigo-500/20">
                            {selectedGuest.displayName[0]}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-app-text">{selectedGuest.displayName}</p>
                            <p className="text-[9px] text-app-secondary">{selectedGuest.email}</p>
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setSelectedGuest(null)}
                          className="p-1.5 hover:bg-white/5 rounded-full text-app-secondary"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" size={16} />
                        <input 
                          value={guestSearch}
                          onChange={(e) => setGuestSearch(e.target.value)}
                          placeholder={t('searchEmailPlaceholder')}
                          className="w-full bg-white/5 border border-white/5 rounded-xl py-3.5 pl-10 pr-4 text-app-text text-xs focus:outline-none focus:border-indigo-500/30 focus:bg-white/10 transition-all"
                        />
                        {isSearchingGuests && (
                          <div className="absolute right-5 top-1/2 -translate-y-1/2">
                            <span className="w-4 h-4 border-2 border-app-accent border-t-transparent rounded-full animate-spin block"></span>
                          </div>
                        )}
                        {foundUsers.length > 0 && !selectedGuest && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[100]">
                            {foundUsers.map(u => (
                              <button
                                key={u.uid}
                                type="button"
                                onClick={() => {
                                  setSelectedGuest(u);
                                  setGuestSearch('');
                                  setFoundUsers([]);
                                }}
                                className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-all text-left border-b border-white/5 last:border-0"
                              >
                                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                  {u.displayName[0]}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-app-text truncate">{u.displayName}</p>
                                  <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 p-4 bg-app-accent/5 rounded-[32px] border border-app-accent/10">
                    <button
                      type="button"
                      onClick={() => setNotify24h(!notify24h)}
                      className={`flex items-center justify-between p-4 rounded-2xl transition-all ${
                        notify24h ? 'bg-app-accent/20 border border-app-accent/30' : 'bg-white/5'
                      }`}
                    >
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[10px] font-black tracking-tight">{t('notify24hLabel')}</span>
                        <span className="text-[9px] text-slate-500">{language === 'en' ? 'Reminder' : language === 'es' ? 'Recordatorio' : 'Lembrete'}</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center ${
                        notify24h ? 'border-app-accent bg-app-accent' : 'border-slate-700'
                      }`}>
                        {notify24h && <CheckCircle2 size={10} className="text-white" />}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNotifyDayOf(!notifyDayOf)}
                      className={`flex items-center justify-between p-4 rounded-2xl transition-all ${
                        notifyDayOf ? 'bg-app-accent/20 border border-app-accent/30' : 'bg-white/5'
                      }`}
                    >
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[10px] font-black tracking-tight">{t('notifyDayOfLabel')}</span>
                        <span className="text-[9px] text-slate-500">{language === 'en' ? 'Reminder' : language === 'es' ? 'Recordatorio' : 'Lembrete'}</span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center ${
                        notifyDayOf ? 'border-app-accent bg-app-accent' : 'border-slate-700'
                      }`}>
                        {notifyDayOf && <CheckCircle2 size={10} className="text-white" />}
                      </div>
                    </button>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsAdding(false);
                      setEditingItemId(null);
                      resetForm();
                    }}
                    className="flex-1 py-5 rounded-[28px] font-black text-xs tracking-widest text-slate-500 hover:bg-white/5 transition-all"
                  >
                    {t('cancel')}
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] bg-app-accent text-white py-5 rounded-[28px] font-black text-xs tracking-widest shadow-xl shadow-app-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    {editingItemId ? t('updateAppointment') : t('confirmAppointment')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
    </div>
  );
}
