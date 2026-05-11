import { useState, useEffect } from 'react';
import { 
  Book, 
  PlusCircle, 
  Sparkles, 
  Mic2, 
  Calendar, 
  User as UserIcon, 
  Menu, 
  X,
  Play,
  History,
  LayoutDashboard,
  Sun,
  Moon,
  BookOpen,
  Copy,
  Check,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Clock,
  Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, serverTimestamp, query, collection, where, orderBy, updateDoc, limit, getDocs } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './lib/firebase';
import BibleReader from './components/BibleReader';
import SermonEditor from './components/SermonEditor';
import AIAssistant from './components/AIAssistant';
import PreachingMode from './components/PreachingMode';
import Dashboard from './components/Dashboard';
import EventsManager from './components/EventsManager';
import MinisterialAgenda from './components/MinisterialAgenda';
import SermonsList from './components/SermonsList';
import ProfileSettings from './components/ProfileSettings';
import HelpCenter from './components/HelpCenter';
import AdminDashboard from './components/AdminDashboard';
import SalesLandingPage from './components/SalesLandingPage';
import { UserProfile } from './types';
import { useLanguage } from './contexts/LanguageContext';
import { Language } from './translations';

type Tab = 'dashboard' | 'bible' | 'editor' | 'ai' | 'preach' | 'events' | 'agenda' | 'ministrations' | 'history' | 'profile' | 'help' | 'admin';
type Theme = 'dark' | 'light';

export default function App() {
  const { language, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [isRedirectProcessed, setIsRedirectProcessed] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const [currentSermonId, setCurrentSermonId] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'dark');
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [pendingOutline, setPendingOutline] = useState<string | null>(null);
  const [adminNewMsgCount, setAdminNewMsgCount] = useState(0);
  const [userNewMsgCount, setUserNewMsgCount] = useState(0);
  const [trialTimeLeft, setTrialTimeLeft] = useState<string>("");

  const trialDurationDays = 3;

  // Final loading state: wait for both redirect processing AND auth state observation
  const isAppLoading = loading || !isAuthInitialized || !isRedirectProcessed;

  // Final check for admin status - hardcoded or via profile role
  const isUserAdmin = profile?.role === 'admin' || user?.email?.toLowerCase() === 'dmv.vasconcelos@gmail.com';

  useEffect(() => {
    if (user) {
      console.log('App: User Status Check:', {
        email: user.email,
        profileRole: profile?.role,
        isUserAdmin: isUserAdmin,
        activeTab: activeTab
      });
    }
  }, [user, profile, activeTab, isUserAdmin]);

  // Auto-expire trials locally only.
  const isTrialExpired = !isUserAdmin && 
    !profile?.isPremium &&
    profile?.subscriptionStatus === 'trial' && 
    profile?.trialExpiresAt && 
    (profile.trialExpiresAt.toDate ? profile.trialExpiresAt.toDate() : new Date(profile.trialExpiresAt)) < new Date();
  
  const isActualExpired = !isUserAdmin && 
    !profile?.isPremium &&
    profile?.subscriptionStatus === 'expired';
    
  const isSubscriptionBlocked = isTrialExpired || isActualExpired;
  const isManuallyBlocked = profile?.isBlocked === true;
  const isBlocked = isSubscriptionBlocked || isManuallyBlocked;

  useEffect(() => {
    if (profile?.subscriptionStatus !== 'trial') return;
    const expiryRef = profile?.subscriptionExpiresAt || profile?.trialExpiresAt;
    if (!expiryRef) return;

    const calculateTimeLeft = () => {
      const expiryDate = expiryRef.toDate ? expiryRef.toDate() : new Date(expiryRef);
      const now = new Date();
      const diff = expiryDate.getTime() - now.getTime();

      if (diff <= 0) {
        setTrialTimeLeft(t('expired') || 'Expirado');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTrialTimeLeft(`${days}${t('daysShort')} ${hours}${t('hoursShort')}`);
      } else if (hours > 0) {
        setTrialTimeLeft(`${hours}${t('hoursShort')} ${minutes}${t('minutesShort')}`);
      } else {
        setTrialTimeLeft(`${minutes}${t('minutesShort')}`);
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 60000);
    return () => clearInterval(timer);
  }, [profile?.trialExpiresAt, profile?.subscriptionExpiresAt, profile?.subscriptionStatus, t]);

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (user?.email) {
      navigator.clipboard.writeText(user.email);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // Refresh data when app becomes visible (especially on mobile)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setLastRefresh(Date.now());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Handle redirect result and set persistence once
  useEffect(() => {
    const initAuth = async () => {
      try {
        console.log('Initializing auth persistence...');
        await setPersistence(auth, browserLocalPersistence);
        
        console.log('Checking for redirect results...');
        const result = await getRedirectResult(auth);
        
        if (result?.user) {
          console.log('Redirect login success:', result.user.email);
          setUser(result.user);
          // Flag that we just logged in via redirect to trigger dashboard transition
          sessionStorage.setItem('just_logged_in', 'true');
        }
      } catch (error: any) {
        console.error('Auth initialization / Redirect error:', error);
      } finally {
        setIsRedirectProcessed(true);
        // Clean up any pending login flags
        localStorage.removeItem('auth_pending');
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      console.log('Auth observer triggered:', u ? `User: ${u.email}` : 'No active session');
      setUser(u);
      
      // If we just logged in, force navigation out of landing ASAP
      if (u && (sessionStorage.getItem('just_logged_in') === 'true' || localStorage.getItem('just_logged_in') === 'true')) {
        setActiveTab('dashboard');
        sessionStorage.removeItem('just_logged_in');
        localStorage.removeItem('just_logged_in');
      }

      if (u) {
        // Reset logging in state if we found a user
        setIsLoggingIn(false);
        
        // Ensure user document exists in 'users' collection for searching/sharing
        const userRef = doc(db, 'users', u.uid);
        
        try {
          const userSnap = await getDoc(userRef);
          
          // Collect device info
          const ua = navigator.userAgent;
          const platform = navigator.platform;
          let browser = "Unknown";
          if (ua.includes("Firefox")) browser = "Firefox";
          else if (ua.includes("Chrome")) browser = "Chrome";
          else if (ua.includes("Safari")) browser = "Safari";
          else if (ua.includes("Edge")) browser = "Edge";

          const deviceInfo = {
            model: platform,
            os: platform,
            browser: browser,
            platform: ua
          };

          // Fetch location info
          let locationInfo: any = {};
          try {
            // Initial attempt via IP (fast fallback)
            const locRes = await fetch('https://ipapi.co/json/').then(r => r.json());
            if (locRes && !locRes.error) {
              locationInfo = {
                neighborhood: '',
                city: locRes.city || '',
                state: locRes.region || '',
                country: locRes.country_name || '',
                ip: locRes.ip || ''
              };
            }
          } catch (locErr) {
            console.warn("Could not fetch IP location info:", locErr);
          }

          // Try high-accuracy browser geolocation
          try {
            if ("geolocation" in navigator) {
              const pos: GeolocationPosition = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                  enableHighAccuracy: true,
                  timeout: 8000,
                  maximumAge: 0
                });
              });

              if (pos) {
                const { latitude, longitude } = pos.coords;
                locationInfo.latitude = latitude;
                locationInfo.longitude = longitude;

                // Try to get address info from coordinates (Reverse Geocoding)
                try {
                  const revRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`, {
                    headers: { 'Accept-Language': 'pt-BR' }
                  }).then(r => r.json());

                  if (revRes && revRes.address) {
                    const addr = revRes.address;
                    locationInfo.neighborhood = addr.suburb || addr.neighbourhood || addr.village || addr.road || '';
                    locationInfo.city = addr.city || addr.town || addr.municipality || locationInfo.city;
                    locationInfo.state = addr.state || locationInfo.state;
                  }
                } catch (revErr) {
                  console.warn("Reverse geocoding failed:", revErr);
                }
              }
            }
          } catch (geoErr) {
            console.warn("Hardware geolocation failed or denied:", geoErr);
          }

          if (!userSnap.exists()) {
            const now = new Date();
            const trialExpiresAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days trial

            // Check for placeholder by email (if exists but has different ID)
            const qPlaceholder = query(collection(db, 'users'), where('email', '==', u.email?.toLowerCase()), limit(1));
            const placeholderSnap = await getDocs(qPlaceholder);
            
            let initialData: any = {
              uid: u.uid,
              email: u.email?.toLowerCase() || '',
              displayName: u.displayName || 'Ministro',
              photoURL: u.photoURL || '',
              role: u.email?.toLowerCase() === 'dmv.vasconcelos@gmail.com' ? 'admin' : 'user',
              subscriptionStatus: 'trial',
              trialExpiresAt: trialExpiresAt,
              trialDuration: 3,
              subscriptionExpiresAt: trialExpiresAt,
              deviceInfo: deviceInfo,
              locationInfo: locationInfo,
              lastLogin: serverTimestamp(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            };

            if (!placeholderSnap.empty) {
              const placeholderData = placeholderSnap.docs[0].data();
              console.log('App: Found placeholder, merging:', placeholderData);
              // Merge placeholder data but keep current UID
              initialData = { ...initialData, ...placeholderData, uid: u.uid };
              
              // If the placeholder had a different ID, we should delete it to avoid duplicates
              if (placeholderSnap.docs[0].id !== u.uid) {
                console.log('App: Marking placeholder for deletion:', placeholderSnap.docs[0].id);
                // In a real app we might delete it, here we just merge
              }
            }

            await setDoc(userRef, initialData);
          } else {
            const data = userSnap.data();
            const updateObj: any = {
              email: u.email?.toLowerCase() || '',
              role: u.email?.toLowerCase() === 'dmv.vasconcelos@gmail.com' ? 'admin' : (data?.role || 'user'),
              lastLogin: serverTimestamp(),
              deviceInfo: deviceInfo,
              locationInfo: locationInfo,
              updatedAt: serverTimestamp()
            };

            // Migration: Set trialExpiresAt for existing trial users missing it
            if (data?.subscriptionStatus === 'trial' && u.email?.toLowerCase() !== 'dmv.vasconcelos@gmail.com') {
              if (!data.trialExpiresAt) {
                const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
                const expectedTrialExpiry = new Date(createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);
                updateObj.trialExpiresAt = expectedTrialExpiry;
                updateObj.subscriptionExpiresAt = expectedTrialExpiry;
                updateObj.trialDuration = 3;
              }
            } else if (u.email?.toLowerCase() === 'dmv.vasconcelos@gmail.com') {
              // Ensure admin is active/admin
              if (data?.role !== 'admin') updateObj.role = 'admin';
              if (data?.subscriptionStatus !== 'active') updateObj.subscriptionStatus = 'active';
              if (data?.isPremium !== true) updateObj.isPremium = true;
            }
            
            // Secure consistency checks
            if ((data?.subscriptionStatus === 'active' || data?.role === 'premium') && data?.isPremium !== true) {
              updateObj.isPremium = true;
              updateObj.subscriptionStatus = 'active'; 
            }

            // Check for premium by email if current doc is still trial
            if (data?.subscriptionStatus === 'trial' && !data?.isPremium) {
               try {
                 const qPremium = query(collection(db, 'users'), where('email', '==', u.email?.toLowerCase()), where('isPremium', '==', true), limit(1));
                 const premiumSnap = await getDocs(qPremium);
                 if (!premiumSnap.empty) {
                    const premData = premiumSnap.docs[0].data();
                    console.log('App: Found premium account by email, upgrading current session');
                    updateObj.isPremium = true;
                    updateObj.role = 'premium';
                    updateObj.subscriptionStatus = 'active';
                    updateObj.paidAt = premData.paidAt || serverTimestamp();
                 }
               } catch (e) {
                 console.warn("Email premium search error:", e);
               }
            }

            if (data?.isPremium === true && !data?.subscriptionStatus) {
              updateObj.subscriptionStatus = 'active';
            }
            
            // Fix subscriptionExpiresAt if missing but status is trial
            if (data?.subscriptionStatus === 'trial' && !data.subscriptionExpiresAt && data.trialExpiresAt) {
              updateObj.subscriptionExpiresAt = data.trialExpiresAt;
            }

            // Only update if we have meaningful changes
            // Standard user can update everything EXCEPT role and subscriptionStatus
            const restrictedFields = ['role', 'subscriptionStatus'];
            const isSelfAdmin = u.email?.toLowerCase() === 'dmv.vasconcelos@gmail.com';
            
            const keysToSync = Object.keys(updateObj).filter(key => {
              if (isSelfAdmin) return true;
              
              // If we are promoting to premium because we found a valid payment/placeholder,
              // we MUST allow role and subscriptionStatus to be updated.
              if (updateObj.isPremium === true && restrictedFields.includes(key)) return true;
              
              if (restrictedFields.includes(key)) return false;
              // Only update if value is different
              return updateObj[key] !== data?.[key];
            });

            if (keysToSync.length > 0) {
              const syncObj: any = {};
              keysToSync.forEach(k => syncObj[k] = updateObj[k]);
              console.log('App: Syncing user profile:', syncObj);
              await setDoc(userRef, syncObj, { merge: true });
            }
          }
        } catch (err) {
          console.error('Profile sync error:', err);
        }

        // Subscribe to profile changes
        unsubscribeProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          }
        }, (error) => handleFirestoreError(error, OperationType.GET, `users/${u.uid}`));
      } else {
        setProfile(null);
        if (unsubscribeProfile) unsubscribeProfile();
      }
      setIsAuthInitialized(true);
      setLoading(false);
      setIsLoggingIn(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ 
        prompt: 'select_account'
      });
      
      await setPersistence(auth, browserLocalPersistence);
      
      const isLocalhost = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1' || 
                         window.location.hostname.includes('webcontainer.io');
      
      // On non-localhost, try popup first but be ready for redirect
      // If Hostinger blocks popups aggressively, this tried-and-true chain works best
      try {
        console.log('Attempting popup login...');
        const result = await signInWithPopup(auth, provider);
        if (result.user) {
          setIsLoggingIn(false);
          setActiveTab('dashboard');
          return;
        }
      } catch (popupError: any) {
        console.warn('Popup interrupted or failed:', popupError.code);
        if (popupError.code === 'auth/popup-blocked' || popupError.code === 'auth/popup-closed-by-user' || !isLocalhost) {
          console.log('Proceeding with redirect flow...');
          localStorage.setItem('auth_pending', 'true');
          await signInWithRedirect(auth, provider);
          return;
        }
      }
    } catch (error: any) {
      console.error('Login process failed:', error);
      setIsLoggingIn(false);
      localStorage.removeItem('auth_pending');
    }
  };

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    if (!user) {
      setAdminNewMsgCount(0);
      setUserNewMsgCount(0);
      return;
    }

    let unsubAdmin: (() => void) | undefined;
    
    // Admin Monitor (All pending messages)
    if (profile?.role === 'admin') {
      const qAdmin = query(collection(db, 'contactMessages'), where('status', '==', 'pending'), where('archived', '==', false));
      unsubAdmin = onSnapshot(qAdmin, (snap) => setAdminNewMsgCount(snap.size));
    }

    // User Monitor (Replied messages of this user)
    const qUser = query(
      collection(db, 'contactMessages'), 
      where('userId', '==', user.uid), 
      where('status', '==', 'replied'),
      where('archived', '==', false)
    );
    const unsubUser = onSnapshot(qUser, (snap) => setUserNewMsgCount(snap.size));

    return () => {
      if (unsubAdmin) unsubAdmin();
      unsubUser();
    };
  }, [user, profile?.role]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input or textarea
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName);
      if (isInput) return;

      if (e.key === 'Escape') {
        setIsMenuOpen(false);
        if (activeTab === 'preach' || activeTab === 'editor' || activeTab === 'profile' || activeTab === 'help') {
          setActiveTab('dashboard');
        }
      }

      if (e.key.toLowerCase() === 'p') {
        if (currentSermonId) {
          handlePreach(currentSermonId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, currentSermonId]);

  // Check for upcoming events and notify
  useEffect(() => {
    if (!user) return;

    const requestNotificationPermission = async () => {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    };
    requestNotificationPermission();

    // Query events (Church)
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    const qEvents = query(
      collection(db, 'agenda'),
      where('userId', '==', user.uid),
      where('date', '>=', today),
      orderBy('date', 'asc')
    );

    // Query preachings (Ministerial)
    const qPreachings = query(
      collection(db, 'ministerial_agenda'),
      where('userId', '==', user.uid),
      where('date', '>=', today),
      orderBy('date', 'asc')
    );

    const processSnapshot = (snapshot: any, type: string) => {
      const now = new Date();
      snapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        const eventDate = data.date?.toDate?.() || new Date(data.date);
        const diffMs = eventDate.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        const sessionId = `notif_${type}_${doc.id}_${Math.floor(diffHours)}`;
        if (sessionStorage.getItem(sessionId)) return;

        if (Notification.permission === 'granted') {
          if (diffHours <= 24 && diffHours > 0 && data.notify24h) {
             new Notification(type === 'preaching' ? t('remind24h') : t('remindEvent24h'), {
               body: t('remindBody').replace('{title}', data.title).replace('{location}', data.location || t('locationNotinformed')),
               icon: '/favicon.ico'
             });
             sessionStorage.setItem(sessionId, 'true');
          } else if (diffHours <= 1 && diffHours > 0 && data.notifyDayOf) {
             new Notification(type === 'preaching' ? t('remindStarting') : t('remindEventStarting'), {
               body: t('remindBody').replace('{title}', data.title).replace('{location}', data.location || t('locationNotinformed')),
               icon: '/favicon.ico'
             });
             sessionStorage.setItem(sessionId, 'true');
          }
        }
      });
    };

    const unsubEvents = onSnapshot(qEvents, (s) => processSnapshot(s, 'event'), (error) => {
      console.warn("Agenda listener failed, retrying on next cycle", error);
    });
    const unsubPreachings = onSnapshot(qPreachings, (s) => processSnapshot(s, 'preaching'), (error) => {
      console.warn("Ministerial listener failed, retrying on next cycle", error);
    });

    return () => {
      unsubEvents();
      unsubPreachings();
    };
  }, [user]);

  const handleSermonEdit = (id: string | null) => {
    setCurrentSermonId(id);
    setActiveTab('editor');
  };

  const handlePreach = (id: string) => {
    setCurrentSermonId(id);
    setActiveTab('preach');
  };

  if (isAppLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--bg-color)]">
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-indigo-500 flex flex-col items-center gap-4"
        >
          <Book size={48} />
          <p className="font-serif italic text-lg text-slate-500">{t('graceAndPeace')}</p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return <SalesLandingPage onLogin={handleLogin} isLoading={isLoggingIn} />;
  }

  const getCheckoutUrl = () => {
    const baseUrl = 'https://pay.cakto.com.br/38ydnyy_878109';
    if (!user) return baseUrl;
    const params = new URLSearchParams();
    if (user.email) params.append('email', user.email);
    if (user.uid) {
      params.append('external_id', user.uid);
      params.append('ext_id', user.uid);
    }
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  };

  if (isBlocked) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">
        <div className="mesh-gradient-bg">
          <div className="mesh-blob-1 bg-red-500/20"></div>
          <div className="mesh-blob-2 bg-amber-500/20"></div>
        </div>
        <div className="max-w-md w-full frosted-glass p-10 rounded-[40px] text-center relative z-10 border-red-500/20">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center"
          >
            <div className="w-20 h-20 bg-red-500/10 rounded-[32px] flex items-center justify-center mb-8 border border-red-500/20 shadow-2xl shadow-red-500/10 animate-pulse">
              <ShieldCheck className="text-red-500" size={40} />
            </div>
            
            <h1 className="text-3xl font-black text-app-text mb-4 tracking-tighter uppercase leading-tight">
              Acesso <span className="text-red-500">{isManuallyBlocked ? 'Suspenso' : 'Expirado'}</span>
            </h1>
            
            <div className="space-y-4 mb-10">
              <p className="text-app-secondary font-medium tracking-wide">
                {isManuallyBlocked 
                  ? 'Sua conta foi suspensa por um administrador. Por favor, entre em contato com o suporte para mais informações.'
                  : 'Seu período de teste de 3 dias terminou. Para continuar desfrutando de todas as ferramentas de IA e gestão ministerial, adquira o plano anual.'
                }
              </p>
              
              {!isManuallyBlocked && (
                <div className="bg-indigo-500/5 rounded-3xl p-6 border border-indigo-500/10 shadow-inner">
                  <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Promoção de Lançamento</p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-app-text text-xl font-bold italic">R$</span>
                    <span className="text-5xl font-black text-app-text tracking-tighter">19,90</span>
                  </div>
                  <p className="text-app-secondary text-[11px] font-bold uppercase tracking-widest mt-1 opacity-60">Licença Premium • 1 Ano</p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 w-full">
              {!isManuallyBlocked && (
                <a
                  href={getCheckoutUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-indigo-600 text-white h-16 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] hover:bg-indigo-500 transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Sparkles size={18} />
                  Fazer Aquisição Premium (Anual)
                </a>
              )}
              
              <button
                onClick={() => signOut(auth)}
                className="w-full h-12 bg-app-card text-app-secondary border border-app-border rounded-xl font-black uppercase text-[9px] tracking-[0.2em] hover:bg-app-accent/10 transition-all"
              >
                Sair da Conta
              </button>
            </div>

            <p className="mt-8 text-[9px] text-app-secondary uppercase font-black tracking-widest opacity-40">
              Suporte: suporte@ministrandoapalavra.com.br
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { id: 'ministrations', label: t('ministrations'), icon: BookOpen },
    { id: 'bible', label: t('bible'), icon: Book },
    { id: 'editor', label: t('newSermon'), icon: PlusCircle },
    { id: 'ai', label: t('aiAssistant'), icon: Sparkles },
    { id: 'events', label: t('events'), icon: Calendar },
    { id: 'agenda', label: t('agenda'), icon: Mic2 },
    { id: 'profile', label: t('profile'), icon: UserIcon },
    { id: 'help', label: t('help'), icon: HelpCircle, badge: profile?.role === 'admin' ? adminNewMsgCount : userNewMsgCount },
  ];

  if (isUserAdmin) {
    // We already have a dedicated button at the bottom for admin
  }

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-color)] flex flex-col md:flex-row relative transition-colors duration-300">
      <div className="mesh-gradient-bg">
        <div className="mesh-blob-1"></div>
        <div className="mesh-blob-2"></div>
        <div className="mesh-blob-3"></div>
      </div>

      {/* Floating Toggle Button when Sidebar is Collapsed */}
      <AnimatePresence>
        {isSidebarCollapsed && (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="hidden md:flex fixed top-10 left-6 z-[110]"
          >
            <button 
              onClick={() => setIsSidebarCollapsed(false)}
              className="w-10 h-10 bg-app-card text-app-text rounded-xl flex items-center justify-center shadow-lg hover:border-indigo-500/40 transition-all border border-app-border active:scale-95 group"
              title={t('expandMenu')}
            >
              <PanelLeftOpen size={20} className="group-hover:scale-110 transition-transform" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-app-bg/8 backdrop-blur-lg border-b border-app-border z-50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg">
            <Book className="text-white" size={12} />
          </div>
          <div className="flex flex-col leading-tight py-1 whitespace-nowrap">
            <span className="font-serif italic text-xl text-app-text px-1 drop-shadow-sm">Ministrando</span>
            <span className="font-bold tracking-[0.3em] text-[8px] text-indigo-500 uppercase mt-0.5">a palavra</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={toggleTheme} className="p-2 text-app-secondary transition-colors">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button id="btn-mobile-menu" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X className="text-app-text" /> : <Menu className="text-app-text" />}
          </button>
        </div>
      </div>

      {/* Sidebar Overlay Mobile */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMenuOpen(false)}
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <nav className={`
        fixed inset-y-0 left-0 z-[100] w-72 md:w-64 frosted-glass m-4 rounded-[2.5rem] transform transition-all duration-500 ease-out md:relative md:translate-x-0 md:flex md:flex-col md:m-6 overflow-hidden
        ${isMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-[120%] md:translate-x-0'}
        ${isSidebarCollapsed ? 'md:w-0 md:m-0 md:opacity-0 md:pointer-events-none' : 'md:w-64 md:opacity-100'}
      `}>
        {/* Mobile Header Inside Sidebar context */}
        <div className="md:hidden flex items-center gap-3 p-8 border-b border-app-border mb-6 px-6">
          <div className="w-8 h-8 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Book className="text-white" size= {16} />
          </div>
          <div className="flex flex-col leading-tight py-1 whitespace-nowrap">
            <span className="font-serif italic text-xl text-app-text px-1 tracking-tight">Ministrando</span>
            <span className="font-bold tracking-[0.4em] text-[10px] text-indigo-500 uppercase mt-0.5">a palavra</span>
          </div>
        </div>
        <div className="p-8 hidden md:flex items-center justify-between gap-2 mb-10 border-b border-app-border/10 px-6">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
              <Book className="text-white" size={16} />
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col leading-tight py-1 whitespace-nowrap">
                <span className="text-lg font-serif italic text-app-text px-1 tracking-tight">Ministrando</span>
                <span className="text-[9px] font-bold tracking-[0.3em] text-indigo-500 uppercase mt-0.5">a palavra</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button 
              onClick={toggleTheme} 
              className="p-1.5 hover:bg-app-accent/10 rounded-lg text-app-secondary hover:text-indigo-500 transition-colors"
              title={theme === 'dark' ? t('lightMode') : t('darkMode')}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button 
              onClick={() => setIsSidebarCollapsed(true)} 
              className="p-1.5 hover:bg-app-accent/10 rounded-lg text-app-secondary hover:text-indigo-500 transition-colors hidden md:block"
              title={t('collapseMenu')}
            >
              <PanelLeftClose size={15} />
            </button>
          </div>
        </div>

        <div className="flex-1 px-4 space-y-1 overflow-y-auto no-scrollbar flex flex-col">
          <div className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`nav-${tab.id}`}
                onClick={() => {
                  setActiveTab(tab.id as Tab);
                  setIsMenuOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative group
                  ${activeTab === tab.id ? 'bg-indigo-500/10 text-indigo-500 shadow-sm' : 'text-app-secondary hover:bg-app-card hover:text-app-text'}
                  ${theme === 'light' && activeTab !== tab.id ? 'border-b border-transparent hover:border-slate-200' : ''}
                `}
              >
                <tab.icon size={18} className={activeTab === tab.id ? 'text-indigo-500' : ''} />
                <span className="font-bold text-[10px] uppercase tracking-widest">{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute right-4 w-4 h-4 bg-red-500 text-white text-[8px] font-black flex items-center justify-center rounded-full shadow-lg border-2 border-app-card transition-all">
                    {tab.badge}
                  </span>
                )}
                {theme === 'light' && activeTab === tab.id && (
                  <motion.div 
                    layoutId="activeNavIndicator"
                    className="absolute left-0 w-1 h-6 bg-indigo-500 rounded-r-full"
                  />
                )}
              </button>
            ))}
          </div>

          {(profile?.role === 'admin' || isUserAdmin) && (
            <div className="pt-4 mt-auto border-t border-app-border/20 pb-2">
              <button
                id="nav-admin"
                onClick={() => {
                  console.log('Switching to Admin tab');
                  setActiveTab('admin');
                  setIsMenuOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-4 rounded-xl transition-all relative group
                  ${activeTab === 'admin' ? 'bg-indigo-600 text-white shadow-lg' : 'text-indigo-500/60 hover:bg-indigo-500/10 hover:text-indigo-500'}
                `}
              >
                <ShieldCheck size={20} />
                <span className="font-bold text-xs uppercase tracking-[0.2em]">{t('admin') || 'Admin'}</span>
                {adminNewMsgCount > 0 && (
                  <span className="absolute right-4 w-5 h-5 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full shadow-lg border-2 border-app-card transition-all">
                    {adminNewMsgCount}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="p-4 mt-auto border-t border-app-border">
          {/* Discrete Language Selector */}
          <div className="flex items-center justify-center gap-4 mb-4">
            {(['pt', 'en', 'es'] as Language[]).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`text-[9px] font-black uppercase tracking-[0.2em] transition-all p-1 ${language === lang ? 'text-indigo-500 underline underline-offset-4' : 'text-slate-600 hover:text-slate-400'}`}
              >
                {lang}
              </button>
            ))}
          </div>

          <button 
            onClick={() => currentSermonId && handlePreach(currentSermonId)}
            className={`w-full mb-4 py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all ${currentSermonId ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-app-card text-app-secondary border border-app-border cursor-not-allowed'}`}
          >
            <Play size={16} fill={currentSermonId ? "currentColor" : "none"} />
            <span className="font-bold uppercase text-[9px] tracking-widest">{t('pulpitMode')}</span>
          </button>

          <div 
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-3 p-4 rounded-2xl border border-app-border cursor-pointer transition-all ${activeTab === 'profile' ? 'bg-indigo-500/10 border-indigo-500/20 shadow-sm' : 'bg-app-card hover:bg-app-card/60 hover:shadow-md'}`}
          >
            <img 
              src={profile?.photoURL || user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${profile?.displayName || user.displayName}`} 
              className="w-10 h-10 rounded-full border border-app-border object-cover" 
              alt="User" 
            />
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-bold truncate text-app-text">{profile?.displayName || user.displayName}</p>
              <div className="flex items-center gap-1 group/email">
                <p className="text-[10px] text-app-secondary truncate">{user.email}</p>
                <button 
                  onClick={handleCopyEmail}
                  className="p-1 hover:bg-app-card rounded-md text-app-secondary hover:text-indigo-400 transition-all opacity-0 group-hover/email:opacity-100"
                  title={t('copyEmailTitle')}
                >
                  {copiedEmail ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
                </button>
              </div>
              <button id="btn-logout" onClick={(e) => { e.stopPropagation(); signOut(auth); }} className="text-[10px] uppercase font-bold text-app-secondary hover:text-indigo-400 transition-colors mt-1">{t('logout')}</button>
            </div>
          </div>
        </div>

        {/* Close Button Mobile */}
        <button id="btn-close-mobile" className="md:hidden absolute top-4 right-4 p-2 text-app-secondary" onClick={() => setIsMenuOpen(false)}>
          <X size={24} />
        </button>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto w-full relative transition-all duration-500 ease-in-out">
        {profile?.subscriptionStatus === 'trial' && !profile?.isPremium && profile?.role !== 'admin' && (
          <div className="relative group overflow-hidden shrink-0">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-indigo-600/20 to-amber-500/10 opacity-70 pointer-events-none" />
            <div className="relative backdrop-blur-xl border-b border-white/10 px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-500 shadow-lg shadow-amber-500/10 border border-amber-500/30">
                  <Crown size={20} className="animate-pulse" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] bg-amber-500 text-white px-2 py-0.5 rounded-md">EXPERIMENTAL</span>
                    <p className="text-xs font-black text-app-text tracking-tight uppercase">Período de Experiência Ativo</p>
                  </div>
                  <p className="text-[10px] font-bold text-app-secondary flex items-center gap-1.5 mt-0.5">
                    <Clock size={12} className="text-amber-500" />
                    Seu acesso expira em: <span className="text-app-text font-black underline">{trialTimeLeft}</span>
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-8">
                <div className="hidden lg:flex flex-col items-end border-r border-app-border pr-8">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-app-secondary opacity-60">Promoção de Lançamento</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-app-secondary text-[10px] font-bold line-through opacity-40">R$ 59,90</span>
                    <span className="text-lg font-black text-app-text italic">R$ 19,90 <span className="text-[9px] not-italic opacity-40 font-bold uppercase tracking-tighter">p/ano</span></span>
                  </div>
                </div>
                
                <a 
                  href={getCheckoutUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 transition-all hover:scale-[1.03] active:scale-95 group/btn"
                >
                  <Sparkles size={16} className="fill-white/20 group-hover/btn:animate-pulse" />
                  Ativar Premium Agora
                </a>
              </div>
            </div>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto"
          >
            {activeTab === 'dashboard' && <Dashboard profile={profile} onEdit={handleSermonEdit} onPreach={handlePreach} onSeeAll={() => setActiveTab('ministrations')} onSeeAgenda={() => setActiveTab('agenda')} onSeeEvents={() => setActiveTab('events')} onEditProfile={() => setActiveTab('profile')} />}
            {activeTab === 'ministrations' && <SermonsList onEdit={handleSermonEdit} onPreach={handlePreach} onNew={() => handleSermonEdit(null)} />}
            {activeTab === 'bible' && <BibleReader profile={profile} />}
            {activeTab === 'editor' && (
              <SermonEditor 
                profile={profile}
                sermonId={currentSermonId} 
                pendingOutline={pendingOutline}
                onClearPendingOutline={() => setPendingOutline(null)}
                onSaved={() => {
                  setCurrentSermonId(null);
                  setActiveTab('ministrations');
                }} 
                onIdChange={(id) => setCurrentSermonId(id)}
              />
            )}
            {activeTab === 'ai' && <AIAssistant profile={profile} onApplyOutline={(outline) => {
              setPendingOutline(outline);
              setCurrentSermonId(null); // Ensure we start a new study for the outline
              setActiveTab('editor');
            }} />}
            {activeTab === 'events' && <EventsManager />}
            {activeTab === 'agenda' && <MinisterialAgenda onPreach={handlePreach} />}
            {activeTab === 'profile' && <ProfileSettings />}
            {activeTab === 'help' && <HelpCenter />}
            {activeTab === 'admin' && isUserAdmin && <AdminDashboard />}
            {activeTab === 'preach' && currentSermonId && <PreachingMode sermonId={currentSermonId} onClose={() => setActiveTab('dashboard')} />}
            {activeTab === 'history' && <div>{t('historyOfMessages')}</div>}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
