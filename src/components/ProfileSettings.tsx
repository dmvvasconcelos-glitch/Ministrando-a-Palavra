import { useState, useEffect, useRef } from 'react';
import { 
  User as UserIcon, 
  Camera, 
  Save, 
  Building2, 
  CheckCircle2,
  ChevronRight,
  LogOut,
  Copy,
  Check,
  Mail,
  Cake,
  Heart,
  Plus,
  Trash2,
  Search,
  Bell,
  User,
  Users,
  Calendar as CalendarIcon,
  Wand2,
  ExternalLink,
  FileKey,
  Info as InfoIcon,
  ClipboardList,
  Sparkles,
  CreditCard,
  ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR, es, enUS } from 'date-fns/locale';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, deleteDoc, onSnapshot, query, orderBy, updateDoc } from 'firebase/firestore';
import { updateProfile, signOut } from 'firebase/auth';
import { UserProfile, Birthday } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { requestNotificationPermission } from '../services/notificationService';

export default function ProfileSettings() {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    displayName: auth.currentUser?.displayName || '',
    fullName: '',
    birthDate: '',
    newBirthDate: '',
    denomination: '',
    presidentPastor: '',
    photoURL: auth.currentUser?.photoURL || ''
  });
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [showAddBirthday, setShowAddBirthday] = useState(false);
  const [newBirthday, setNewBirthday] = useState({ name: '', date: '', relationship: '' });
  const [birthdaySearch, setBirthdaySearch] = useState('');
  const [addingBirthday, setAddingBirthday] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showKeyAssistant, setShowKeyAssistant] = useState(false);
  const [watchingClipboard, setWatchingClipboard] = useState(false);
  const [assistantStep, setAssistantStep] = useState(1);
  const [manualKey, setManualKey] = useState('');
  const [clipboardError, setClipboardError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const manualKeyRef = useRef<HTMLInputElement>(null);

  // Clipboard Watcher for API Key
  useEffect(() => {
    let interval: any;
    if (watchingClipboard && !clipboardError) {
      interval = setInterval(async () => {
        try {
          if (document.visibilityState === 'visible') {
            const text = await navigator.clipboard.readText();
            const trimmed = text.trim();
            if (trimmed.startsWith('AIzaSy') && trimmed.length >= 30 && trimmed.length <= 80) {
              handleKeyFound(trimmed);
            }
          }
        } catch (err) {
          // If it fails, we wait for user gesture (Paste button)
          setClipboardError(true);
        }
      }, 3000); 
    }
    return () => clearInterval(interval);
  }, [watchingClipboard, clipboardError, profile.geminiApiKey]);

  const handlePaste = async () => {
    try {
      // First try to read directly, might work if user already granted permission
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (trimmed.startsWith('AIzaSy') && trimmed.length >= 30) {
        handleKeyFound(trimmed);
        return;
      } else if (trimmed.length > 0) {
        setManualKey(trimmed);
      }
      manualKeyRef.current?.focus();
    } catch (err) {
      console.warn('Clipboard direct read failed, falling back to manual focus');
      setClipboardError(true);
      // Focus the manual field as fallback - this is the most reliable way in iframes
      if (manualKeyRef.current) {
        manualKeyRef.current.focus();
        // Visual feedback that focus happened
        manualKeyRef.current.classList.add('ring-4', 'ring-indigo-500/20');
        setTimeout(() => manualKeyRef.current?.classList.remove('ring-4', 'ring-indigo-500/20'), 1000);
      }
    }
  };

  const handleKeyFound = async (key: string) => {
    setProfile(prev => ({ ...prev, geminiApiKey: key }));
    setWatchingClipboard(false);
    setAssistantStep(4);
    
    // Auto-save logic
    try {
      const docRef = doc(db, 'users', auth.currentUser!.uid);
      await setDoc(docRef, { 
        geminiApiKey: key,
        updatedAt: serverTimestamp() 
      }, { merge: true });
      
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser?.uid}`);
    }
  };

  const handleCopyEmail = () => {
    if (auth.currentUser?.email) {
      navigator.clipboard.writeText(auth.currentUser.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    async function loadProfile() {
      if (!auth.currentUser) return;
      try {
        const docRef = doc(db, 'users', auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          setProfile(prev => ({
            ...prev,
            ...data,
            displayName: data.displayName || prev.displayName || '',
            fullName: data.fullName || '',
            birthDate: data.birthDate || '',
            newBirthDate: data.newBirthDate || '',
            denomination: data.denomination || '',
            presidentPastor: data.presidentPastor || '',
            photoURL: data.photoURL || prev.photoURL || ''
          }));
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;

    const birthdaysRef = collection(db, 'users', auth.currentUser.uid, 'birthdays');
    const q = query(birthdaysRef, orderBy('name', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Birthday));
      setBirthdays(bList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${auth.currentUser?.uid}/birthdays`);
    });

    return () => unsubscribe();
  }, []);

  const handleAddBirthday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newBirthday.name || !newBirthday.date) return;
    
    setAddingBirthday(true);
    try {
      const birthdaysRef = collection(db, 'users', auth.currentUser.uid, 'birthdays');
      await addDoc(birthdaysRef, {
        ...newBirthday,
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });
      setNewBirthday({ name: '', date: '', relationship: '' });
      setShowAddBirthday(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${auth.currentUser.uid}/birthdays`);
    } finally {
      setAddingBirthday(false);
    }
  };

  const handleDeleteBirthday = async (id: string) => {
    if (!auth.currentUser) return;
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'birthdays', id));
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${auth.currentUser.uid}/birthdays/${id}`);
    }
  };

  const filteredBirthdays = birthdays.filter(b => 
    b.name.toLowerCase().includes(birthdaySearch.toLowerCase()) || 
    b.relationship?.toLowerCase().includes(birthdaySearch.toLowerCase())
  );

  const handleSave = async () => {
    if (!auth.currentUser) return;
    setSaving(true);
    try {
      // Collect device and basic location info
      const ua = navigator.userAgent;
      const platform = navigator.platform;
      const screen = `${window.screen.width}x${window.screen.height}`;
      
      let browser = "Unknown";
      if (ua.includes("Firefox")) browser = "Firefox";
      else if (ua.includes("Chrome")) browser = "Chrome";
      else if (ua.includes("Safari")) browser = "Safari";
      else if (ua.includes("Edge")) browser = "Edge";

      const docRef = doc(db, 'users', auth.currentUser.uid);
      const docSnap = await getDoc(docRef);
      const isNew = !docSnap.exists();
      const existingData = docSnap.data() as UserProfile | undefined;

      // Update Firestore
      const saveContent: any = {
        uid: auth.currentUser.uid,
        displayName: profile.displayName,
        fullName: profile.fullName || '',
        birthDate: profile.birthDate || '',
        newBirthDate: profile.newBirthDate || '',
        denomination: profile.denomination || '',
        presidentPastor: profile.presidentPastor || '',
        photoURL: profile.photoURL,
        geminiApiKey: profile.geminiApiKey || '',
        notificationsEnabled: profile.notificationsEnabled ?? false,
        defaultNotify24h: profile.defaultNotify24h ?? true,
        defaultNotifyDayOf: profile.defaultNotifyDayOf ?? true,
        email: auth.currentUser.email || '',
        updatedAt: serverTimestamp(),
        deviceInfo: {
          model: platform,
          os: platform,
          browser: browser,
          platform: ua
        },
        // We keep existing role and status or default if new
        role: existingData?.role || 'user',
        subscriptionStatus: existingData?.subscriptionStatus || 'trial'
      };

      if (isNew) {
        saveContent.createdAt = serverTimestamp();
      }

      await setDoc(docRef, saveContent, { merge: true });

      // Update Firebase Auth Profile (Only if display name changed or photo is small/URL)
      const isDataUrl = profile.photoURL?.startsWith('data:');
      await updateProfile(auth.currentUser, {
        displayName: profile.displayName,
        photoURL: isDataUrl ? '' : profile.photoURL 
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving profile:', err);
      handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser?.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (limit to 5MB for the upload before compression)
      if (file.size > 5 * 1024 * 1024) {
        alert(t('imageTooLarge') || 'A imagem é muito grande. Escolha uma imagem de até 5MB.');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        
        // Compress image before setting state
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 400; // Fixed size for profile photo

          if (width > height) {
            if (width > maxDim) {
              height *= maxDim / width;
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width *= maxDim / height;
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const compressedUrl = canvas.toDataURL('image/jpeg', 0.8);
            setProfile(prev => ({ ...prev, photoURL: compressedUrl }));
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEnableNotifications = async () => {
    setNotificationLoading(true);
    try {
      const result = await requestNotificationPermission();
      if (result && result.token) {
        setProfile(prev => ({ ...prev, fcmToken: result.token, notificationsEnabled: true }));
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        const errorMsg = result?.error || "Erro desconhecido";
        if (errorMsg.includes('BLOQUEADO')) {
          alert(errorMsg);
        } else {
          alert(`Não foi possível habilitar as notificações: ${errorMsg}. Verifique as permissões do navegador.`);
        }
      }
    } catch (err) {
      console.error('Error enabling notifications:', err);
      alert("Erro ao habilitar notificações. Entre em contato com o suporte.");
    } finally {
      setNotificationLoading(false);
    }
  };

  const handleTogglePreference = async (key: 'defaultNotify24h' | 'defaultNotifyDayOf') => {
    const newValue = !profile[key];
    setProfile(prev => ({ ...prev, [key]: newValue }));
    
    if (auth.currentUser) {
      try {
        const docRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(docRef, {
          [key]: newValue,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error('Error updating notification preference:', err);
        handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
      }
    }
  };

  const getCheckoutUrl = () => {
    const baseUrl = 'https://pay.cakto.com.br/3e8jisv_879064';
    if (!auth.currentUser) return baseUrl;
    const params = new URLSearchParams();
    if (auth.currentUser.email) params.append('email', auth.currentUser.email);
    if (auth.currentUser.uid) {
      params.append('external_id', auth.currentUser.uid);
      params.append('ext_id', auth.currentUser.uid);
    }
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  };

  const handleSyncSubscription = async () => {
    setLoading(true);
    try {
      // Just a small delay to make the user feel like something is happening
      // and to allow some time for backend propagation if needed
      await new Promise(resolve => setTimeout(resolve, 1500));
      window.location.reload();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-app-text">{t('profileSettings')}</h1>
          <p className="text-app-secondary font-serif italic text-lg leading-snug">
            {t('profileSub')}
          </p>
        </div>
        <button 
          onClick={() => signOut(auth)}
          className="flex items-center gap-2 text-red-400 hover:text-red-500 font-bold uppercase text-[10px] tracking-widest px-4 py-2 hover:bg-red-500/10 rounded-xl transition-all"
        >
          <LogOut size={16} />
          {t('logout')}
        </button>
      </div>

      <div className="frosted-glass rounded-[40px] p-8 space-y-10 relative overflow-hidden border border-app-border">
        <div className="flex flex-col md:flex-row items-center gap-8 border-b border-app-border/60 pb-10">
          <div className="relative group">
            <div className="w-32 h-32 rounded-3xl overflow-hidden border-4 border-app-border group-hover:border-indigo-500 transition-all shadow-2xl relative">
              <img 
                src={profile.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${profile.displayName}`} 
                className="w-full h-full object-cover"
                alt="Profile"
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Camera className="text-white" size={32} />
              </button>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange}
            />
            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-lg border-4 border-[var(--bg-color)]">
              <Camera size={18} />
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <h3 className="text-xl font-bold text-app-text">{t('profilePhoto')}</h3>
            <p className="text-sm text-app-secondary leading-relaxed max-w-sm">
              {t('profilePhotoSub')}
            </p>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="text-indigo-400 text-xs font-bold uppercase tracking-[0.2em] hover:text-indigo-300 transition-colors"
            >
              {t('changeImage')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <UserIcon size={14} /> {t('profileNameLabel')}
            </label>
            <input 
              type="text"
              value={profile.displayName}
              onChange={(e) => setProfile(prev => ({ ...prev, displayName: e.target.value }))}
              placeholder={t('placeholderDisplayName')}
              className="w-full bg-app-card/40 border border-app-border rounded-2xl p-4 text-app-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium"
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <UserIcon size={14} /> {t('fullNameLabel')}
            </label>
            <input 
              type="text"
              value={profile.fullName}
              onChange={(e) => setProfile(prev => ({ ...prev, fullName: e.target.value }))}
              placeholder={t('placeholderName')}
              className="w-full bg-app-card/40 border border-app-border rounded-2xl p-4 text-app-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium"
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <Cake size={14} /> {t('birthDateLabel')}
            </label>
            <input 
              type="date"
              value={profile.birthDate}
              onChange={(e) => setProfile(prev => ({ ...prev, birthDate: e.target.value }))}
              className="w-full bg-app-card/40 border border-app-border rounded-2xl p-4 text-app-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <Heart size={14} /> {t('newBirthDateLabel')}
            </label>
            <input 
              type="date"
              value={profile.newBirthDate}
              onChange={(e) => setProfile(prev => ({ ...prev, newBirthDate: e.target.value }))}
              className="w-full bg-app-card/40 border border-app-border rounded-2xl p-4 text-app-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <Building2 size={14} /> {t('denominationLabel')}
            </label>
            <input 
              type="text"
              value={profile.denomination}
              onChange={(e) => setProfile(prev => ({ ...prev, denomination: e.target.value }))}
              placeholder={t('placeholderDenomination')}
              className="w-full bg-app-card/40 border border-app-border rounded-2xl p-4 text-app-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium"
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <UserIcon size={14} /> {t('presidentPastorLabel')}
            </label>
            <input 
              type="text"
              value={profile.presidentPastor}
              onChange={(e) => setProfile(prev => ({ ...prev, presidentPastor: e.target.value }))}
              placeholder={t('placeholderPresident')}
              className="w-full bg-app-card/40 border border-app-border rounded-2xl p-4 text-app-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium"
            />
          </div>

          <div className="space-y-3 md:col-span-2">
            <label className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
              <Mail size={14} /> {t('emailLabel')}
            </label>
            <div className="relative group">
              <input 
                type="text"
                value={auth.currentUser?.email || ''}
                readOnly
                className="w-full bg-app-card/20 border border-app-border rounded-2xl p-4 pr-16 text-app-secondary focus:outline-none transition-all font-medium cursor-default"
              />
              <button
                onClick={handleCopyEmail}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 px-4 bg-app-card hover:bg-app-card/60 border border-app-border/40 rounded-xl text-app-secondary hover:text-app-text transition-all flex items-center gap-2"
                title={t('copyEmailTitle')}
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                <span className="text-[10px] font-bold uppercase tracking-widest leading-none">
                  {copied ? t('copied') : t('copy')}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-app-border flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-xs text-app-secondary flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-500" />
            {t('privacyNote')}
          </p>
          
          <div className="flex items-center gap-4">
            <AnimatePresence>
              {savedSuccess && (
                <motion.span
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="text-green-500 text-xs font-bold uppercase tracking-widest"
                >
                  {t('savedSuccessMsg')}
                </motion.span>
              )}
            </AnimatePresence>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-3 bg-indigo-500 text-white px-8 py-4 rounded-2xl font-bold uppercase text-xs tracking-[0.2em] hover:bg-indigo-600 transition-all shadow-xl shadow-indigo-500/20 disabled:opacity-50"
            >
              {saving ? t('saving') : (
                <>
                  <Save size={18} />
                  {t('saveProfile')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Notifications Section */}
      <div className="frosted-glass rounded-[40px] p-8 space-y-6 relative overflow-hidden border border-app-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
            <Bell size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-app-text">{t('notificationPreferences')}</h2>
            <p className="text-xs text-app-secondary uppercase tracking-widest font-bold">{t('pushNotificationsSub')}</p>
          </div>
        </div>

        <div className="space-y-6">
          {!profile.notificationsEnabled ? (
            <button
              onClick={handleEnableNotifications}
              disabled={notificationLoading}
              className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-indigo-600 transition-all shadow-xl shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {notificationLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Bell size={18} />
                  {t('enablePushNotifications')}
                </>
              )}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-app-card/20 rounded-2xl border border-app-border/40 hover:border-indigo-500/30 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400">
                    <CalendarIcon size={16} />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-app-text">{t('remind24hBefore')}</label>
                    <p className="text-[10px] text-app-secondary uppercase tracking-wider">{t('reminderPrev')}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleTogglePreference('defaultNotify24h')}
                  className={`w-12 h-6 rounded-full transition-all relative ${profile.defaultNotify24h ? 'bg-indigo-500' : 'bg-app-border'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${profile.defaultNotify24h ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-app-card/20 rounded-2xl border border-app-border/40 hover:border-indigo-500/30 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400">
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-app-text">{t('remindOnDay')}</label>
                    <p className="text-[10px] text-app-secondary uppercase tracking-wider">{t('reminderDayOf')}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleTogglePreference('defaultNotifyDayOf')}
                  className={`w-12 h-6 rounded-full transition-all relative ${profile.defaultNotifyDayOf ? 'bg-indigo-500' : 'bg-app-border'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${profile.defaultNotifyDayOf ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* License Section */}
      <div className="frosted-glass rounded-[40px] p-8 space-y-6 relative overflow-hidden border border-app-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
            <FileKey size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-app-text">Licença de Uso</h2>
            <p className="text-xs text-app-secondary uppercase tracking-widest font-bold">Gestão da Assinatura</p>
          </div>
        </div>

        <div className="bg-app-card/30 border border-app-border rounded-3xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-app-border/40 pb-6">
            <div className="space-y-1">
              <p className="text-[10px] text-app-secondary uppercase font-black tracking-[0.2em]">Tipo de Licença</p>
              <div className="flex items-center gap-2">
                <span className={`
                  px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter
                  ${profile.role === 'admin' || profile.subscriptionStatus === 'active' 
                    ? 'bg-green-500/10 text-green-500' 
                    : profile.subscriptionStatus === 'trial' 
                    ? 'bg-amber-500/10 text-amber-500' 
                    : 'bg-red-500/10 text-red-500'}
                `}>
                  {profile.role === 'admin' ? 'ADMINISTRADOR' : (profile.subscriptionStatus === 'active' ? 'Premium (1 Ano)' : profile.subscriptionStatus === 'trial' ? `Acesso Trial (${profile.createdAt && profile.trialExpiresAt ? Math.ceil(((profile.trialExpiresAt.toDate ? profile.trialExpiresAt.toDate() : new Date(profile.trialExpiresAt)).getTime() - (profile.createdAt.toDate ? profile.createdAt.toDate() : new Date(profile.createdAt)).getTime()) / (1000 * 60 * 60 * 24)) : 3} dias)` : 'Expirada')}
                </span>
                {profile.subscriptionStatus === 'active' && <Sparkles size={14} className="text-amber-500" />}
              </div>
            </div>

            <div className="space-y-1 sm:text-right">
              <p className="text-[10px] text-app-secondary uppercase font-black tracking-[0.2em]">Expiração</p>
              <p className="text-sm font-bold text-app-text">
                {profile.role === 'admin' 
                  ? (language === 'pt' ? 'Nunca expira' : language === 'es' ? 'Nunca expira' : 'Never expires')
                  : profile.subscriptionExpiresAt?.toDate 
                    ? format(profile.subscriptionExpiresAt.toDate(), 'PPP p', { locale: (language === 'pt' ? ptBR : language === 'es' ? es : enUS) })
                    : (profile.trialExpiresAt?.toDate 
                      ? format(profile.trialExpiresAt.toDate(), 'PPP p', { locale: (language === 'pt' ? ptBR : language === 'es' ? es : enUS) })
                      : (profile.paidExpiresAt?.toDate
                        ? format(profile.paidExpiresAt.toDate(), 'PPP p', { locale: (language === 'pt' ? ptBR : language === 'es' ? es : enUS) })
                        : 'Expirada'))}
              </p>
            </div>
          </div>

          {profile.subscriptionStatus !== 'active' && (
            <div className="space-y-4 pt-2">
              <div className="bg-indigo-500/5 rounded-2xl p-4 border border-indigo-500/10">
                <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest mb-1">Oferta Exclusiva</p>
                <p className="text-xs text-app-secondary font-medium leading-relaxed">
                  Adquira o plano anual por apenas <span className="text-app-text font-black">R$ 29,90</span> e tenha acesso ilimitado a todas as ferramentas de IA, gestão ministerial e notificações push por 1 ano.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <a
                  href={getCheckoutUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-indigo-600 text-white h-16 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] hover:bg-indigo-500 transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <CreditCard size={18} />
                  Fazer Aquisição Premium (Anual)
                </a>
                
                <button
                  onClick={handleSyncSubscription}
                  className="w-full bg-app-card border border-app-border text-app-text h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-app-bg transition-all flex items-center justify-center gap-3 active:scale-95 group"
                >
                  <ArrowUpDown size={16} className="text-indigo-500 group-hover:rotate-180 transition-transform duration-500" />
                  Já pagou? Clique aqui para sincronizar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Key Section */}
      <div className="frosted-glass rounded-[40px] p-8 space-y-6 relative overflow-hidden border border-app-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-app-text">
              {t('aiSettings')}
            </h2>
            <p className="text-xs text-app-secondary uppercase tracking-widest font-bold">
              {t('individualApiKey')}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex gap-4 items-start">
            <Search className="text-amber-500 shrink-0" size={20} />
            <div className="space-y-1">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-100 italic">
                {t('recommendedForUnlimited')}
              </p>
              <p className="text-[10px] text-amber-700 dark:text-amber-200/70 leading-relaxed">
                {t('sharedQuotaInfo')}
              </p>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="no-referrer"
                className="text-[10px] text-amber-600 dark:text-amber-400 font-bold hover:underline inline-block mt-2 uppercase tracking-wider"
              >
                {t('getMyFreeKey')}
              </a>
            </div>
          </div>

          {!profile.geminiApiKey && (
            <div className="relative">
              <button
                onClick={() => setShowKeyAssistant(!showKeyAssistant)}
                className="w-full py-4 bg-indigo-500/10 hover:bg-indigo-500/20 border border-dashed border-indigo-500/30 rounded-2xl text-indigo-400 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all group"
              >
                <Wand2 size={16} className="group-hover:rotate-12 transition-transform" />
                {t('generateKeyBtn')}
              </button>

              <AnimatePresence>
                {showKeyAssistant && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="mt-4 p-6 bg-app-card border border-app-border rounded-3xl space-y-4 shadow-2xl relative"
                  >
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-app-text flex items-center gap-2">
                        <FileKey size={16} className="text-indigo-400" />
                        {t('autoKeyGenerator')}
                      </h4>
                      <p className="text-[10px] text-app-secondary">
                        {t('autoKeyGeneratorSub')}
                      </p>
                    </div>

                    <div className="space-y-3 p-4 bg-app-card/30 rounded-2xl border border-app-border">
                      <div className={`flex gap-3 items-start transition-opacity ${assistantStep >= 1 ? 'opacity-100' : 'opacity-30'}`}>
                        <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5">1</div>
                        <p className="text-[11px] text-app-text leading-tight">{t('step1')}</p>
                      </div>
                      <div className={`flex gap-3 items-start transition-opacity ${assistantStep >= 2 ? 'opacity-100' : 'opacity-30'}`}>
                        <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5">2</div>
                        <p className="text-[11px] text-app-text leading-tight">{t('step2')}</p>
                      </div>
                      <div className={`flex gap-3 items-start transition-opacity ${assistantStep >= 3 ? 'opacity-100' : 'opacity-30'}`}>
                        <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5">3</div>
                        <p className="text-[11px] text-app-text leading-tight">{t('step3')}</p>
                      </div>
                      <div className={`flex gap-3 items-start transition-opacity ${assistantStep >= 4 ? 'opacity-100' : 'opacity-30'}`}>
                        <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5">{assistantStep === 4 ? <Check size={10} /> : '4'}</div>
                        <p className="text-[11px] text-app-text leading-tight">{t('step4')}</p>
                      </div>
                    </div>

                    {assistantStep < 4 ? (
                      <div className="space-y-3">
                        <a
                          href="https://aistudio.google.com/app/apikey"
                          target="_blank"
                          rel="no-referrer"
                          onClick={() => {
                            setWatchingClipboard(true);
                            setAssistantStep(2);
                          }}
                          className="w-full h-12 bg-indigo-500 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20"
                        >
                          <ExternalLink size={14} />
                          {t('openAiStudio')}
                        </a>
                        
                        {watchingClipboard && (
                          <div className="space-y-4">
                            <div className="flex flex-col items-center gap-3 py-2">
                              {!clipboardError ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                                  <span className="text-[10px] text-indigo-400 font-bold italic animate-pulse">
                                    {t('waitingForKey')}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-2 px-4 text-center">
                                  <span className="text-[10px] text-rose-500 font-bold italic">
                                    {t('clipboardDenied')}
                                  </span>
                                  <button
                                    onClick={handlePaste}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg text-indigo-400 text-[10px] font-bold uppercase tracking-widest transition-all"
                                  >
                                    <ClipboardList size={14} />
                                    {t('pasteKey')}
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="space-y-2 pt-2 border-t border-app-border">
                              <label className="text-[9px] font-bold text-app-secondary uppercase tracking-widest text-center block">
                                {t('pasteKeyManually')}
                              </label>
                              <div className="flex gap-2">
                                <input
                                  ref={manualKeyRef}
                                  type="text"
                                  value={manualKey}
                                  onChange={(e) => {
                                    const val = e.target.value.trim();
                                    setManualKey(val);
                                    if (val.startsWith('AIzaSy') && val.length >= 30) {
                                      handleKeyFound(val);
                                    }
                                  }}
                                  onFocus={(e) => e.target.select()}
                                  placeholder={t('apiKeyPlaceholder')}
                                  className={`flex-1 bg-app-card/20 border rounded-xl px-4 py-2.5 text-xs text-app-text placeholder:text-app-secondary/30 focus:outline-none transition-all font-mono ${
                                    clipboardError ? 'border-orange-500/50 ring-2 ring-orange-500/10' : 'border-app-border focus:border-indigo-500/50'
                                  }`}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
                        <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center text-white shrink-0">
                          <Check size={18} />
                        </div>
                        <p className="text-[11px] text-green-500 font-bold leading-tight">
                          {t('keyDetected')}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest ml-1">
                GEMINI API KEY
              </label>
              {profile.geminiApiKey && (
                <button
                  type="button"
                  onClick={() => setProfile(prev => ({ ...prev, geminiApiKey: '' }))}
                  className="text-[9px] font-bold text-red-400 hover:text-red-500 uppercase tracking-widest transition-colors flex items-center gap-1"
                >
                  <Trash2 size={10} />
                  {t('clearKey')}
                </button>
              )}
            </div>
            <input 
              type="password"
              value={profile.geminiApiKey || ''}
              onChange={(e) => setProfile(prev => ({ ...prev, geminiApiKey: e.target.value }))}
              placeholder="AIzaSy..."
              className="w-full bg-app-card/40 border border-app-border rounded-2xl p-4 text-app-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono text-sm"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-14 bg-app-card hover:bg-app-card/60 border border-app-border text-app-text rounded-2xl transition-all flex items-center justify-center gap-3 font-bold text-xs uppercase tracking-[0.2em]"
          >
            {saving ? t('saving') : (
              <>
                <Save size={18} />
                {(t('saveKey') as string)}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Birthday Management Section */}
      <div className="frosted-glass rounded-[40px] p-8 space-y-6 relative overflow-hidden border border-app-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
              <Bell size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-app-text">{t('manageBirthdays')}</h2>
              <p className="text-xs text-app-secondary uppercase tracking-widest font-bold">{t('birthdays')}</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddBirthday(!showAddBirthday)}
            className="flex items-center gap-2 bg-indigo-500 text-white px-4 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20"
          >
            {showAddBirthday ? t('cancel') : <><Plus size={16} /> {t('addBirthday')}</>}
          </button>
        </div>

        <AnimatePresence>
          {showAddBirthday && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onSubmit={handleAddBirthday}
              className="overflow-hidden"
            >
              <div className="bg-app-card/40 border border-app-border rounded-3xl p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest ml-1">{t('birthdayNameLabel')}</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-app-secondary/30" size={18} />
                    <input
                      type="text"
                      required
                      value={newBirthday.name}
                      onChange={e => setNewBirthday(prev => ({ ...prev, name: e.target.value }))}
                      placeholder={t('placeholderBirthdayName')}
                      className="w-full bg-app-bg border border-app-border rounded-2xl py-4 pl-12 pr-4 text-sm text-app-text focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none transition-all placeholder:text-app-secondary/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest ml-1">{t('birthdayDateLabel')}</label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-app-secondary/30" size={18} />
                      <input
                        type="date"
                        required
                        value={newBirthday.date}
                        onChange={e => setNewBirthday(prev => ({ ...prev, date: e.target.value }))}
                        className="w-full bg-app-bg border border-app-border rounded-2xl py-4 pl-12 pr-4 text-sm text-app-text focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none transition-all [color-scheme:light] dark:[color-scheme:dark]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest ml-1">{t('relationshipLabel')}</label>
                    <div className="relative">
                      <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-app-secondary/30" size={18} />
                      <input
                        type="text"
                        value={newBirthday.relationship}
                        onChange={e => setNewBirthday(prev => ({ ...prev, relationship: e.target.value }))}
                        placeholder={t('placeholderRelationship')}
                        className="w-full bg-app-bg border border-app-border rounded-2xl py-4 pl-12 pr-4 text-sm text-app-text focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none transition-all placeholder:text-app-secondary/30"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={addingBirthday}
                  className="w-full h-14 bg-indigo-500 text-white rounded-2xl hover:bg-indigo-600 transition-all shadow-xl shadow-indigo-500/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 font-bold text-xs uppercase tracking-[0.2em]"
                >
                  {addingBirthday ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus size={20} strokeWidth={3} />
                      {t('addBirthday')}
                    </>
                  )}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-app-secondary" size={16} />
            <input 
              type="text"
              value={birthdaySearch}
              onChange={e => setBirthdaySearch(e.target.value)}
              placeholder={t('birthdaySearchPlaceholder')}
              className="w-full bg-app-card/40 border border-app-border rounded-2xl p-4 pl-12 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-app-accent/20 scrollbar-track-transparent">
            {filteredBirthdays.length > 0 ? filteredBirthdays.map(b => {
              const bDate = new Date(b.date + 'T00:00:00');
              const formattedDate = bDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
              const isDeleting = deletingId === b.id;
              
              return (
                <div 
                  key={b.id} 
                  className="bg-app-card/40 border border-app-border rounded-2xl p-4 flex items-center justify-between group hover:bg-app-card/60 transition-all border-l-4 border-l-indigo-500 relative overflow-hidden"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                      <Cake size={18} />
                    </div>
                    <div>
                      <h4 className="font-bold text-app-text line-clamp-1">{b.name}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-app-secondary font-medium">{formattedDate}</span>
                        {b.relationship && (
                          <>
                            <span className="w-1 h-1 bg-app-border rounded-full" />
                            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">{b.relationship}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setDeletingId(b.id)}
                    className="p-2 text-app-secondary hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                  >
                    <Trash2 size={16} />
                  </button>

                  <AnimatePresence>
                    {isDeleting && (
                      <motion.div
                        initial={{ opacity: 0, x: '100%' }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: '100%' }}
                        className="absolute inset-0 bg-app-card/95 backdrop-blur-sm flex items-center justify-center gap-3 p-4 z-10"
                      >
                        <span className="text-[10px] font-bold text-app-text uppercase tracking-wider mr-2">{t('deleteBirthdayConfirm')}</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDeletingId(null)}
                            className="px-4 py-1.5 rounded-lg text-[10px] font-bold text-app-secondary hover:text-app-text transition-colors"
                          >
                            {t('cancel')}
                          </button>
                          <button
                            onClick={() => handleDeleteBirthday(b.id)}
                            className="px-4 py-1.5 bg-rose-600 text-white rounded-lg text-[10px] font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20"
                          >
                            {t('confirm')}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }) : (
              <div className="md:col-span-2 py-8 text-center bg-app-card/20 rounded-3xl border border-dashed border-app-border">
                <p className="text-sm text-app-secondary italic">{t('noBirthdaysFound') || 'Nenhum aniversariante encontrado.'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
