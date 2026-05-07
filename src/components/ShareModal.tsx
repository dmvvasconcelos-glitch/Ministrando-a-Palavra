import { useState, useEffect } from 'react';
import { X, Search, UserPlus, Shield, User, Trash2, Mail, Loader2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../lib/firebase';
import { 
  doc, updateDoc, query, collection, where, getDocs, getDoc, limit, serverTimestamp
} from 'firebase/firestore';
import { Sermon, UserProfile } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

interface ShareModalProps {
  sermon: Sermon;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export default function ShareModal({ sermon, isOpen, onClose, onUpdate }: ShareModalProps) {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<{ profile: UserProfile, role: 'view' | 'edit' }[]>([]);
  const [role, setRole] = useState<'view' | 'edit'>('view');
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);

  const isOwner = auth.currentUser?.uid === sermon.ownerId;

  useEffect(() => {
    if (isOpen && sermon.sharedWith) {
      loadSharedUsers();
    }
  }, [isOpen, sermon.sharedWith]);

  const loadSharedUsers = async () => {
    if (!sermon.sharedWith) {
      setSharedUsers([]);
      return;
    }
    const uids = Object.keys(sermon.sharedWith);
    if (uids.length === 0) {
      setSharedUsers([]);
      return;
    }

    const users: { profile: UserProfile, role: 'view' | 'edit' }[] = [];
    for (const uid of uids) {
      try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (userSnap.exists()) {
          const userData = userSnap.data() as UserProfile;
          users.push({
            profile: { ...userData, uid: uid },
            role: sermon.sharedWith[uid]
          });
        } else {
          users.push({
            profile: { uid: uid, displayName: t('user') + ' Desconhecido', updatedAt: null } as UserProfile,
            role: sermon.sharedWith[uid]
          });
        }
      } catch (err) {
        console.error('Error loading shared user:', err);
      }
    }
    setSharedUsers(users);
  };

  const handleSearch = async () => {
    if (!email.trim() || !email.includes('@')) return;
    setSearching(true);
    setError(null);
    setSearchResult(null);
    try {
      const searchEmail = email.trim().toLowerCase();
      const q = query(collection(db, 'users'), where('email', '==', searchEmail), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        setError(t('noSermonsFound'));
      } else {
        const found = snap.docs[0].data() as UserProfile;
        if (found.uid === auth.currentUser?.uid) {
          setError('Você já é o proprietário desta ministração.');
        } else {
          setSearchResult({ ...found, uid: snap.docs[0].id });
        }
      }
    } catch (err) {
      setError(t('errorSaving'));
    } finally {
      setSearching(false);
    }
  };

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
      },
      operationType,
      path
    };
    console.error('Firestore Error ShareModal:', JSON.stringify(errInfo));
    return errInfo;
  };

  const handleShare = async () => {
    if (!searchResult || !auth.currentUser) return;
    setLoading(true);
    try {
      const updatedSharedWith = {
        ...(sermon.sharedWith || {}),
        [searchResult.uid]: role
      };

      await updateDoc(doc(db, 'sermons', sermon.id), {
        sharedWith: updatedSharedWith,
        updatedAt: serverTimestamp()
      });

      setSuccess(true);
      onUpdate();
      setEmail('');
      setSearchResult(null);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `sermons/${sermon.id}`);
      setError(t('errorSaving'));
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (uid: string) => {
    setLoading(true);
    setConfirmDeleteUid(null);
    
    const originalSharedUsers = [...sharedUsers];
    setSharedUsers(prev => prev.filter(u => u.profile.uid !== uid));
    
    try {
      const updatedSharedWith = { ...(sermon.sharedWith || {}) };
      delete updatedSharedWith[uid];

      await updateDoc(doc(db, 'sermons', sermon.id), {
        sharedWith: updatedSharedWith,
        updatedAt: serverTimestamp()
      });
      
      onUpdate();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `sermons/${sermon.id}`);
      setSharedUsers(originalSharedUsers);
      setError(t('errorSaving'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setConfirmDeleteUid(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md" onClick={handleClose}>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-slate-900 border border-white/10 rounded-[40px] w-full max-w-lg overflow-hidden shadow-2xl relative"
        >
        <div className="p-8 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
              <UserPlus size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">{t('publish')}</h2>
              <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">{t('syncWithColleagues')}</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-xl text-slate-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-8">
          {isOwner && (
            <div className="space-y-4">
              <div className="relative">
                <input
                  type="email"
                  placeholder={t('emailLabel') + '...'}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-12 py-4 outline-none focus:ring-2 focus:ring-indigo-500/50 text-white placeholder:text-slate-600 transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={20} />
                <button
                  onClick={handleSearch}
                  disabled={searching || !email.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
                >
                  {searching ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
                  {t('search')}
                </button>
              </div>

              {error && <p className="text-red-400 text-xs font-medium px-2">{error}</p>}

              <AnimatePresence>
                {searchResult && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {searchResult.photoURL ? (
                          <img src={searchResult.photoURL} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                            {searchResult.displayName[0]}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-bold text-white">{searchResult.displayName}</p>
                          <p className="text-xs text-slate-500">{email}</p>
                        </div>
                      </div>
                      <select
                        className="bg-slate-800 border-none rounded-lg text-xs font-bold text-slate-300 outline-none p-1 px-2"
                        value={role}
                        onChange={(e) => setRole(e.target.value as 'view' | 'edit')}
                      >
                        <option value="view">{t('reader')}</option>
                        <option value="edit">{t('edit')}</option>
                      </select>
                    </div>
                    <button
                      onClick={handleShare}
                      disabled={loading}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
                    >
                      {loading ? <Loader2 className="animate-spin" size={16} /> : success ? <Check size={16} /> : <UserPlus size={16} />}
                      {success ? t('synchronizedAt') + '!' : t('invitePartner')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-[10px] uppercase font-bold tracking-widest text-slate-500 px-2 flex items-center justify-between">
              <span>{t('shared')}</span>
              <span className="text-indigo-400">{sharedUsers.length}</span>
            </h3>
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
              {sharedUsers.length === 0 ? (
                <div className="text-center py-8 opacity-30">
                  <User size={32} className="mx-auto mb-2" />
                  <p className="text-xs font-medium uppercase tracking-tighter">...</p>
                </div>
              ) : (
                sharedUsers.map(({ profile, role: userRole }) => (
                  <div key={profile.uid} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl group">
                    <div className="flex items-center gap-3">
                      {profile.photoURL ? (
                        <img src={profile.photoURL} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold">
                          {profile.displayName?.[0] || 'U'}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-bold text-white">{profile.displayName}</p>
                        <div className="flex items-center gap-1.5 opacity-60">
                          <Shield size={10} className="text-indigo-400" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">
                            {userRole === 'edit' ? t('edit') : t('reader')}
                          </span>
                        </div>
                      </div>
                    </div>
                    {isOwner && (
                      <div className="flex items-center gap-2">
                        <AnimatePresence mode="wait">
                          {confirmDeleteUid === profile.uid ? (
                            <motion.div 
                              key="confirm"
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 20 }}
                              className="flex items-center gap-2"
                            >
                              <button
                                onClick={() => setConfirmDeleteUid(null)}
                                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                              >
                                {t('cancel')}
                              </button>
                              <button
                                onClick={() => handleRemove(profile.uid)}
                                className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all shadow-lg shadow-red-500/20"
                              >
                                {t('delete')}
                              </button>
                            </motion.div>
                          ) : (
                            <motion.button
                              key="trash"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() => setConfirmDeleteUid(profile.uid)}
                              className="p-3 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all active:scale-95"
                              title="Remover acesso"
                            >
                              <Trash2 size={18} />
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="p-8 bg-white/5 border-t border-white/10 flex items-center gap-4">
          <Shield size={24} className="text-indigo-400/30" />
          <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
            Proprietários podem editar tudo e remover acessos. <br />
            Editores podem modificar o conteúdo, mas não o compartilhamento.
          </p>
        </div>
      </motion.div>
      </div>
    </div>
  );
}
