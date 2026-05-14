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
  Filter,
  CheckCircle2,
  X,
  User as UserIcon,
  Tag,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, formatDistanceToNow, isAfter } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { collection, query, where, orderBy, onSnapshot, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, Timestamp, or, getDocs, limit, getDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { AgendaItem, UserProfile } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

export default function EventsManager() {
  const { t, language } = useLanguage();
  const [events, setEvents] = useState<AgendaItem[]>([]);
  
  const locale = language === 'en' ? enUS : language === 'es' ? es : ptBR;
  const userNameTranslated = t('user');

  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewingEvent, setViewingEvent] = useState<AgendaItem | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState<AgendaItem['type']>('culto');
  const [notify24h, setNotify24h] = useState(true);
  const [notifyDayOf, setNotifyDayOf] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

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

  // Guest state
  const [guestSearch, setGuestSearch] = useState('');
  const [foundUsers, setFoundUsers] = useState<UserProfile[]>([]);
  const [selectedGuests, setSelectedGuests] = useState<UserProfile[]>([]);
  const [isSearchingGuests, setIsSearchingGuests] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'agenda'),
      or(
        where('userId', '==', auth.currentUser.uid),
        where('guestIds', 'array-contains', auth.currentUser.uid),
        where('guestId', '==', auth.currentUser.uid)
      ),
      orderBy('date', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AgendaItem[];
      setEvents(docs);
      setLoading(false);
    }, (error) => {
      console.error("EventsManager snapshot error:", error);
      handleFirestoreError(error, OperationType.GET, 'agenda');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [refreshKey]);

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
      
      const guestIds = selectedGuests.map(g => g.uid);
      const guestData = selectedGuests.map(g => ({
        uid: g.uid,
        displayName: g.displayName,
        email: g.email || ''
      }));

      const eventData = {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || userNameTranslated,
        userEmail: auth.currentUser.email || '',
        title,
        description,
        location,
        address,
        date: Timestamp.fromDate(eventDate),
        type,
        notify24h,
        notifyDayOf,
        guestIds,
        guests: guestData,
        // Keep for backward compatibility
        guestId: guestIds[0] || '',
        guestName: guestData[0]?.displayName || '',
        updatedAt: serverTimestamp()
      };

      if (editingEventId) {
        await updateDoc(doc(db, 'agenda', editingEventId), eventData);
      } else {
        await addDoc(collection(db, 'agenda'), {
          ...eventData,
          createdAt: serverTimestamp()
        });
      }

      setIsAdding(false);
      setEditingEventId(null);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'agenda');
    }
  };

  const handleEdit = (event: AgendaItem) => {
    const eventDate = event.date?.toDate?.() || new Date(event.date);
    setTitle(event.title);
    setDescription(event.description || '');
    setLocation(event.location || '');
    setAddress(event.address || '');
    setDate(format(eventDate, 'yyyy-MM-dd'));
    setTime(format(eventDate, 'HH:mm'));
    setType(event.type);
    setNotify24h(event.notify24h || false);
    setNotifyDayOf(event.notifyDayOf || false);
    
    if (event.guests && event.guests.length > 0) {
      setSelectedGuests(event.guests.map(g => ({
        uid: g.uid,
        displayName: g.displayName,
        email: g.email,
        updatedAt: null
      })));
    } else if (event.guestId) {
      setSelectedGuests([{
        uid: event.guestId,
        displayName: event.guestName || 'Convidado',
        updatedAt: null
      }]);
    } else {
      setSelectedGuests([]);
    }

    setEditingEventId(event.id);
    setViewingEvent(null);
    setIsAdding(true);
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setAddress('');
    setDate('');
    setTime('');
    setType('culto');
    setNotify24h(true);
    setNotifyDayOf(true);
    setSelectedGuests([]);
    setGuestSearch('');
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    try {
      await deleteDoc(doc(db, 'agenda', id));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `agenda/${id}`);
    }
  };

  const filteredEvents = events.filter(event => 
    event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2 border-b border-app-border/40">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-app-text flex items-center gap-2 md:normal-case">
            <div className="w-1.5 h-5 bg-app-accent rounded-full opacity-60" />
            {t('myEventsHeader')}
          </h1>
          <p className="text-xs text-app-secondary font-medium tracking-wide opacity-70 mt-0.5">{t('myEventsSub')}</p>
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
            <span>{t('newEventBtn')}</span>
          </button>
        </div>
      </div>

      {/* Stats/Quick Filters */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: t('statEvents'), count: events.length, color: 'app-accent', textColor: 'text-app-accent' },
          { label: t('statAlerts'), count: events.filter(e => (e.notify24h || e.notifyDayOf) && !((e.date?.toDate?.() || new Date(e.date)) < new Date())).length, color: 'rose-500', textColor: 'text-rose-500' },
          { label: t('statToday'), count: events.filter(e => {
            const d = e.date?.toDate?.() || new Date(e.date);
            return format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          }).length, color: 'emerald-500', textColor: 'text-emerald-500' },
          { label: t('statUpcoming'), count: events.filter(e => {
            const d = e.date?.toDate?.() || new Date(e.date);
            const diff = (d.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
            return diff >= 0 && diff <= 7;
          }).length, color: 'sky-400', textColor: 'text-sky-400' },
          { label: t('statPending'), count: events.filter(e => (e.date?.toDate?.() || new Date(e.date)) > new Date()).length, color: 'amber-400', textColor: 'text-amber-400' },
          { label: t('statInvitations'), count: events.filter(e => (e.guestIds?.includes(auth.currentUser?.uid || '') || e.guestId === auth.currentUser?.uid) && e.userId !== auth.currentUser?.uid).length, color: 'indigo-400', textColor: 'text-indigo-400' }
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
          placeholder={t('searchEventsPlaceholder')}
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
            {filteredEvents.filter(e => (e.date?.toDate?.() || new Date(e.date)) >= new Date()).length > 0 ? (
              filteredEvents
                .filter(e => (e.date?.toDate?.() || new Date(e.date)) >= new Date())
                .map((event) => {
                  const eventDate = event.date?.toDate?.() || new Date(event.date);
                  const isToday = format(eventDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                  
                  return (
                    <motion.div
                      layout
                      key={event.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      onClick={() => setViewingEvent(event)}
                      className={`bg-app-card/30 p-4 rounded-2xl border border-app-border/50 flex flex-col md:flex-row md:items-center gap-4 group hover:shadow-lg hover:border-indigo-500/20 transition-all relative overflow-hidden cursor-pointer ${
                        isToday ? 'bg-indigo-500/[0.03] border-indigo-500/30 shadow-indigo-500/5' : ''
                      }`}
                    >
                      <div className={`absolute top-3 bottom-3 left-0 w-1 rounded-r-lg ${
                        isToday ? 'bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.4)]' : 'bg-slate-500 opacity-10'
                      } transition-all duration-300 group-hover:w-1.5`} />
                      
                      {/* Date Badge */}
                      <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 border transition-all duration-500 ${
                        isToday ? 'bg-indigo-600 text-white border-indigo-400/20 shadow-lg shadow-indigo-600/20 group-hover:scale-105' : 
                        'bg-app-bg text-app-secondary border-app-border/40 group-hover:border-indigo-500/20'
                      }`}>
                        <span className="text-[8px] font-black tracking-tighter opacity-80">
                          {format(eventDate, 'MMM', { locale })}
                        </span>
                        <span className="text-xl font-black leading-none mt-0.5">{format(eventDate, 'dd')}</span>
                      </div>
    
                      {/* Info */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center flex-wrap gap-2">
                           <span className={`px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest border transition-all ${
                             isToday ? 'bg-indigo-500 text-white border-white/20' : 'bg-app-bg text-app-secondary border-app-border'
                           }`}>
                            {event.type === 'preaching' ? t('preaching') : 
                             event.type === 'culto' ? t('cult') :
                             event.type === 'celula' ? t('cell') :
                             event.type === 'congresso' ? t('congress') : 
                             event.type === 'extra' ? t('others') : event.type}
                          </span>
                          {(event.notify24h || event.notifyDayOf) && (
                            <div className="flex items-center gap-1 text-[8px] font-black tracking-widest text-indigo-400">
                              <Bell size={10} className="fill-current" />
                              <span>{t('activeAlerts')}</span>
                            </div>
                          )}
                        </div>
    
                        <h3 className="text-lg font-bold text-app-text group-hover:text-indigo-500 transition-colors tracking-tight line-clamp-1">{event.title}</h3>
                        
                        <div className="flex flex-wrap items-center gap-4 text-app-secondary font-medium text-[11px]">
                          <div className="flex items-center gap-1.5 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                            <Clock size={12} className="text-indigo-500" />
                            <span>{format(eventDate, 'HH:mm')}h</span>
                          </div>
                          {event.location && (
                            <div className="flex items-center gap-1.5 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                              <MapPin size={12} className="text-indigo-500" />
                              <span className="truncate max-w-[200px]">{event.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
    
                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0 md:opacity-0 group-hover:opacity-100 transition-all duration-300">
                        {event.userId === auth.currentUser?.uid && (
                          <>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(event);
                              }}
                              className="w-10 h-10 flex items-center justify-center rounded-xl bg-app-card border border-app-border text-app-secondary hover:text-indigo-500 hover:border-indigo-500/30 transition-all shadow-sm"
                              title="Editar"
                            >
                              <Plus className="rotate-45" size={18} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingId(event.id);
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
                            setViewingEvent(event);
                          }}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-app-card border border-app-border text-app-secondary hover:text-indigo-500 hover:border-indigo-500/30 transition-all shadow-sm"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })
            ) : filteredEvents.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-20 text-center bg-white/3 rounded-[48px] border border-dashed border-white/10"
              >
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Calendar size={40} className="text-slate-700" />
                </div>
                <h3 className="text-xl font-bold text-slate-500">{t('emptyEventsTitle')}</h3>
                <p className="text-slate-600 mt-2 max-w-xs mx-auto">{t('emptyEventsSub')}</p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>

        {/* Completed Section */}
        {filteredEvents.filter(e => (e.date?.toDate?.() || new Date(e.date)) < new Date()).length > 0 && (
          <section className="space-y-4">
             <div className="flex items-center gap-3 px-2">
              <h2 className="text-[10px] font-black tracking-[0.2em] text-slate-500 opacity-60">{t('completedSection')}</h2>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredEvents
                .filter(e => (e.date?.toDate?.() || new Date(e.date)) < new Date())
                .sort((a, b) => {
                  const dateA = a.date?.toDate?.() || new Date(a.date);
                  const dateB = b.date?.toDate?.() || new Date(b.date);
                  return dateB.getTime() - dateA.getTime(); // Most recent first for past events
                })
                .map((event) => {
                  const eventDate = event.date?.toDate?.() || new Date(event.date);
                  
                  return (
                    <motion.div
                      layout
                      key={event.id}
                      onClick={() => setViewingEvent(event)}
                      className="bg-app-card/10 p-3 rounded-xl border border-app-border/30 flex items-center gap-3 group grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer"
                    >
                      {/* Small Date Badge */}
                      <div className="w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 border border-white/5 bg-white/5 text-app-secondary">
                        <span className="text-[6px] font-black tracking-tighter opacity-60">
                          {format(eventDate, 'MMM', { locale })}
                        </span>
                        <span className="text-sm font-black leading-none">{format(eventDate, 'dd')}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-xs font-bold text-app-text truncate line-clamp-1">{event.title}</h3>
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
        {viewingEvent && (
          <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-md"
                onClick={() => setViewingEvent(null)}
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-xl bg-[#0f172a] rounded-[32px] border border-white/10 shadow-2xl p-7 overflow-hidden"
              >
              <div className="flex justify-between items-center mb-5">
                <div className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-[9px] font-black uppercase tracking-widest border border-indigo-500/20">
                  {viewingEvent.type === 'preaching' ? t('preachingBadge') : 
                   viewingEvent.type === 'culto' ? t('categoryCulto') :
                   viewingEvent.type === 'celula' ? t('categoryCelula') :
                   viewingEvent.type === 'congresso' ? t('categoryCongresso') : 
                   viewingEvent.type === 'extra' ? t('categoryOutro') : viewingEvent.type}
                </div>
                <button 
                  onClick={() => setViewingEvent(null)}
                  className="p-3 hover:bg-white/5 rounded-full text-slate-500 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-black text-app-text tracking-tight">{viewingEvent.title}</h2>
                    <div className="flex items-center gap-4 mt-1.5 text-slate-400 font-medium text-xs">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-indigo-500" />
                        <span>{format(viewingEvent.date?.toDate?.() || new Date(viewingEvent.date), "dd 'de' MMMM", { locale })}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} className="text-indigo-500" />
                        <span>{format(viewingEvent.date?.toDate?.() || new Date(viewingEvent.date), "HH:mm")}h</span>
                        {isAfter(viewingEvent.date?.toDate?.() || new Date(viewingEvent.date), new Date()) && (
                          <span className="text-[9px] font-black uppercase text-indigo-400 ml-1 px-2 py-0.5 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                            {(language === 'en' ? 'In ' : language === 'es' ? 'En ' : 'Em ') + formatDistanceToNow(viewingEvent.date?.toDate?.() || new Date(viewingEvent.date), { locale })}
                          </span>
                        )}
                      </div>
                    </div>
                </div>

                {viewingEvent.location && (
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-start gap-4">
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl">
                      <MapPin size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">{t('locationLabel')}</span>
                        {viewingEvent.address && (
                          <button 
                            onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(viewingEvent.address!)}`, '_blank')}
                            className="text-[9px] font-black text-indigo-400 uppercase tracking-widest hover:underline"
                          >
                            {t('navigate')}
                          </button>
                        )}
                        {!viewingEvent.address && viewingEvent.location && (
                          <button 
                            onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(viewingEvent.location!)}`, '_blank')}
                            className="text-[9px] font-black text-indigo-400 uppercase tracking-widest hover:underline"
                          >
                            {t('navigate')}
                          </button>
                        )}
                      </div>
                      <p className="text-sm font-bold text-app-text mt-0.5">{viewingEvent.location}</p>
                      {viewingEvent.address && (
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{viewingEvent.address}</p>
                      )}
                    </div>
                  </div>
                )}

                {viewingEvent.description && (
                  <div className="space-y-2">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest ml-1">{t('observations')}</span>
                    <div className="p-5 bg-white/5 rounded-2xl border border-white/5">
                      <p className="text-slate-300 text-xs leading-relaxed italic">{viewingEvent.description}</p>
                    </div>
                  </div>
                )}

                {/* Info de Convite */}
                {(viewingEvent.guestIds?.length || viewingEvent.guestId || (viewingEvent.userId !== auth.currentUser?.uid)) && (
                  <div className="p-6 bg-indigo-500/5 rounded-[32px] border border-indigo-500/10 space-y-4">
                    <div className="space-y-4">
                      {viewingEvent.userId === auth.currentUser?.uid ? (
                        <div className="space-y-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400/60 mb-1">
                            {t('guestsBadge')}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {(viewingEvent.guests || (viewingEvent.guestId ? [{ uid: viewingEvent.guestId, displayName: viewingEvent.guestName }] : [])).map((guest: any) => (
                              <div key={guest.uid} className="flex items-center justify-between p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/10">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                    {guest.displayName?.[0] || 'G'}
                                  </div>
                                  <span className="text-xs font-bold text-indigo-300 truncate">{guest.displayName}</span>
                                </div>
                                <button 
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (confirm(t('confirmRemoveGuestEvent'))) {
                                      try {
                                        const newGuests = (viewingEvent.guests || []).filter((g: any) => g.uid !== guest.uid);
                                        const newGuestIds = (viewingEvent.guestIds || []).filter((id: string) => id !== guest.uid);
                                        await updateDoc(doc(db, 'agenda', viewingEvent.id), {
                                          guests: newGuests,
                                          guestIds: newGuestIds,
                                          guestId: newGuestIds[0] || null,
                                          guestName: newGuests[0]?.displayName || null,
                                          updatedAt: serverTimestamp()
                                        });
                                        setViewingEvent(null);
                                      } catch (e) {
                                        handleFirestoreError(e, OperationType.UPDATE, 'agenda');
                                      }
                                    }
                                  }}
                                  className="p-1.5 hover:bg-rose-500/20 text-rose-400 rounded-xl transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <UserIcon size={24} />
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400/60 mb-1">
                              {t('organizerSentBy')}
                            </p>
                            <p className="text-base font-black text-indigo-300">
                               {viewingEvent.userName || t('organizer')}
                            </p>
                            {viewingEvent.userEmail && (
                              <p className="text-[10px] font-medium text-indigo-400/80 mt-1 lowercase">
                                {viewingEvent.userEmail}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-3">
                  {viewingEvent.userId === auth.currentUser?.uid ? (
                    <>
                      <button 
                        onClick={() => handleEdit(viewingEvent)}
                        className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/10"
                      >
                        {t('edit')}
                      </button>
                      <button 
                        onClick={() => {
                          setViewingEvent(null);
                          setDeletingId(viewingEvent.id);
                        }}
                        className="flex-1 py-3 bg-rose-500/10 text-rose-500 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-rose-500/20 transition-all"
                      >
                        {t('delete')}
                      </button>
                    </>
                  ) : (
                    <div className="flex-1 py-3 bg-white/5 text-slate-500 rounded-xl font-bold text-[10px] uppercase tracking-widest text-center opacity-50 border border-white/5">
                      {t('viewOnly')}
                    </div>
                  )}
                  <button 
                    onClick={() => setViewingEvent(null)}
                    className="flex-1 py-3 bg-white/5 text-slate-400 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all"
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
              <h3 className="text-xl font-bold text-app-text mb-2">{t('confirmDeleteEvent')}</h3>
              <p className="text-slate-400 text-sm mb-8 italic">{t('confirmDeleteEventSub')}</p>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setDeletingId(null)}
                  className="flex-1 py-4 bg-white/5 text-slate-400 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={() => handleDelete(deletingId)}
                  className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-red-500/20 hover:opacity-90 transition-all"
                >
                  {t('confirm')}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>

      {/* Modal Multi-step (Simple) */}
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
              {/* Decorative Glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-indigo-500/10 blur-3xl opacity-50 -z-10" />

              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black uppercase tracking-widest text-app-text">
                  {editingEventId ? t('editRegistry') : t('newRegistry')}
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
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 ml-1">Título do Evento</label>
                    <input 
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Congresso de Jovens, Conferência..."
                      className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 text-app-text font-bold text-sm focus:outline-none focus:border-indigo-500/30 focus:bg-white/10 transition-all"
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 ml-1">Categoria do Evento</label>
                        <select
                          value={type}
                          onChange={(e) => setType(e.target.value as AgendaItem['type'])}
                          className="w-full bg-white/5 border border-white/5 rounded-2xl py-3.5 px-4 text-app-text text-sm font-bold focus:outline-none focus:border-indigo-500/30 focus:bg-white/10 transition-all appearance-none cursor-pointer"
                        >
                          <option value="culto" className="bg-[#0f172a]">Culto</option>
                          <option value="celula" className="bg-[#0f172a]">Célula</option>
                          <option value="congresso" className="bg-[#0f172a]">Congresso</option>
                          <option value="extra" className="bg-[#0f172a]">Outro</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 ml-1">Data</label>
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
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 ml-1">Horário</label>
                        <div className="relative flex-1">
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
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 ml-1">Local do Evento</label>
                      <div className="relative">
                        <Plus className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 rotate-45" size={16} />
                        <input 
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="Ex: Igreja Central..."
                          className="w-full bg-white/5 border border-white/5 rounded-xl py-3.5 pl-10 pr-4 text-app-text font-bold focus:outline-none focus:border-indigo-500/30 focus:bg-white/10 transition-all text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 ml-1">Endereço (GPS)</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                        <input 
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Cidade, Bairro ou Rua..."
                          className="w-full bg-white/5 border border-white/5 rounded-xl py-3.5 pl-10 pr-4 text-app-text font-bold focus:outline-none focus:border-indigo-500/30 focus:bg-white/10 transition-all text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 ml-1">{t('invitePartner')}</label>
                    <div className="space-y-3">
                      {selectedGuests.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {selectedGuests.map(guest => (
                            <div key={guest.uid} className="flex items-center justify-between p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-[10px] shrink-0">
                                  {guest.displayName[0]}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-bold text-app-text truncate">{guest.displayName}</p>
                                </div>
                              </div>
                              <button 
                                type="button"
                                onClick={() => setSelectedGuests(prev => prev.filter(g => g.uid !== guest.uid))}
                                className="p-1 hover:bg-rose-500/20 text-rose-400 rounded-lg"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" size={16} />
                        <input 
                          value={guestSearch}
                          onChange={(e) => setGuestSearch(e.target.value)}
                          placeholder={t('searchEmailPlaceholder')}
                          className="w-full bg-white/5 border border-white/5 rounded-xl py-3.5 pl-10 pr-4 text-app-text text-xs focus:outline-none focus:border-indigo-500/30 focus:bg-white/10 transition-all font-bold"
                        />
                        {isSearchingGuests && (
                          <div className="absolute right-5 top-1/2 -translate-y-1/2">
                            <span className="w-4 h-4 border-2 border-app-accent border-t-transparent rounded-full animate-spin block"></span>
                          </div>
                        )}
                        {foundUsers.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[100]">
                            {foundUsers
                              .filter(u => !selectedGuests.find(sg => sg.uid === u.uid))
                              .map(u => (
                              <button
                                key={u.uid}
                                type="button"
                                onClick={() => {
                                  setSelectedGuests(prev => [...prev, u]);
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
                    </div>
                  </div>

                    <div className="grid grid-cols-2 gap-3 p-3 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                    <button
                      type="button"
                      onClick={() => setNotify24h(!notify24h)}
                      className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                        notify24h ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white/5 text-slate-400'
                      }`}
                    >
                      <div className="flex flex-col items-start gap-1 text-[9px] font-black uppercase tracking-tight">
                        <span>{t('notify24hLabel')}</span>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded-full border transition-all flex items-center justify-center ${
                        notify24h ? 'border-white bg-white' : 'border-slate-700'
                      }`}>
                        {notify24h && <CheckCircle2 size={10} className="text-indigo-600" />}
                      </div>
                    </button>
 
                    <button
                      type="button"
                      onClick={() => setNotifyDayOf(!notifyDayOf)}
                      className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                        notifyDayOf ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white/5 text-slate-400'
                      }`}
                    >
                      <div className="flex flex-col items-start gap-1 text-[9px] font-black uppercase tracking-tight">
                        <span>{t('notifyDayOfLabel')}</span>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded-full border transition-all flex items-center justify-center ${
                        notifyDayOf ? 'border-white bg-white' : 'border-slate-700'
                      }`}>
                        {notifyDayOf && <CheckCircle2 size={10} className="text-indigo-600" />}
                      </div>
                    </button>
                  </div>
                </div>
 
                <div className="flex items-center gap-3 pt-4">
                   <button 
                    type="button"
                    onClick={() => {
                      setIsAdding(false);
                      setEditingEventId(null);
                      resetForm();
                    }}
                    className="flex-1 py-3.5 rounded-xl font-bold uppercase text-[10px] tracking-widest text-slate-500 hover:bg-white/5 transition-all"
                  >
                    {t('cancel')}
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] bg-indigo-600 text-white py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 active:scale-95 transition-all"
                  >
                    {editingEventId ? t('saveChanges') : t('registerEvent')}
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
