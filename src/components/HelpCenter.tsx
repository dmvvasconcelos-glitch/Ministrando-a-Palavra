import { useState, useEffect, useRef } from 'react';
import { 
  HelpCircle, 
  Book, 
  Shield, 
  Mail, 
  ChevronRight, 
  LayoutDashboard, 
  PlusCircle, 
  Sparkles, 
  Mic2,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Calendar,
  Key,
  Clock,
  CornerDownRight,
  User as UserIcon,
  Trash2,
  Archive,
  ChevronDown,
  Instagram,
  MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, deleteDoc, doc, updateDoc, deleteField } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { ContactMessage } from '../types';
import { format } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';

type HelpTab = 'manual' | 'features' | 'api' | 'policy' | 'terms' | 'contact';

export default function HelpCenter() {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<HelpTab>('manual');
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [message, setMessage] = useState('');
  const [userMessages, setUserMessages] = useState<ContactMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [newReplyToast, setNewReplyToast] = useState<{ show: boolean, message: string } | null>(null);
  const [contactSubTab, setContactSubTab] = useState<'inbox' | 'archived'>('inbox');
  const isFirstLoad = useRef(true);

  const locale = language === 'pt' ? ptBR : language === 'es' ? es : enUS;

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!auth.currentUser) {
      setLoadingMessages(false);
      return;
    }
    
    // User Monitor - Always monitor for replies even if not in contact tab
    const q = query(
      collection(db, 'contactMessages'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactMessage));
      
      // Check for new replies
      if (!isFirstLoad.current) {
        const hasNewReply = snapshot.docChanges().some(change => 
          change.type === 'modified' && 
          (change.doc.data() as ContactMessage).status === 'replied' &&
          (snapshot.docs.find(d => d.id === change.doc.id)?.data() as ContactMessage).status !== 'replied' // Check if it was replied before? No, simpler:
        );

        // More accurate: find changes where status became replied
        snapshot.docChanges().forEach(change => {
          if (change.type === 'modified') {
            const data = change.doc.data() as ContactMessage;
            if (data.status === 'replied') {
               setNewReplyToast({ show: true, message: data.replyMessage || '' });
               
               if (Notification.permission === 'granted') {
                 new Notification('Nova Resposta do Administrador', {
                   body: data.replyMessage ? data.replyMessage.slice(0, 100) + '...' : 'Você recebeu uma resposta do administrador.',
                   icon: '/vite.svg'
                 });
               }
               
               try {
                 const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                 audio.play().catch(() => {});
               } catch (e) {}

               setTimeout(() => setNewReplyToast(null), 8000);
            }
          }
        });
      }

      // Sort in JS to avoid index requirement
      const sortedMsgs = msgs.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA;
      });
      setUserMessages(sortedMsgs);
      setLoadingMessages(false);
      isFirstLoad.current = false;
    }, (error) => {
      console.error("Error fetching contact messages:", error);
      setLoadingMessages(false);
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  const handleDeleteMessage = async (msgId: string) => {
    if (!window.confirm(t('confirmDeleteMessage') || 'Deseja realmente excluir esta mensagem?')) return;
    
    try {
      await deleteDoc(doc(db, 'contactMessages', msgId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `contactMessages/${msgId}`);
    }
  };

  const handleArchiveMessage = async (msgId: string) => {
    try {
      await updateDoc(doc(db, 'contactMessages', msgId), { 
        archived: true,
        archivedBy: 'user'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `contactMessages/${msgId}`);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    setIsSending(true);
    try {
      await addDoc(collection(db, 'contactMessages'), {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'Usuário',
        userEmail: auth.currentUser.email || '',
        message: message,
        status: 'pending',
        archived: false,
        createdAt: serverTimestamp(),
      });
      
      setIsSent(true);
      setMessage('');
      setTimeout(() => setIsSent(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'contactMessages');
    } finally {
      setIsSending(false);
    }
  };

  const categories = [
    {
      group: t('helpGuide'),
      items: [
        { id: 'manual', label: t('userManual'), icon: Book },
        { id: 'features', label: t('features') || 'Recursos', icon: LayoutDashboard },
      ]
    },
    {
      group: t('helpConfig'),
      items: [
        { id: 'api', label: t('apiUsage'), icon: Key },
      ]
    },
    {
      group: t('helpLegal'),
      items: [
        { id: 'contact', label: t('contactAdmin'), icon: Mail },
        { id: 'policy', label: t('privacyPolicy'), icon: Shield },
        { id: 'terms', label: t('termsOfUse'), icon: CheckCircle2 },
      ]
    }
  ];

  const features = [
    {
      title: t('aiAssistant') || 'Assistente IA',
      desc: 'Gere esboços profundos, encontre temas e receba sugestões bíblicas inteligentes para suas ministrações.',
      icon: Sparkles,
      color: 'from-purple-500 to-indigo-500',
      highlights: ['Esboços em segundos', 'Sugestões de temas', 'Modo Conversa']
    },
    {
      title: t('pulpitMode') || 'Modo Púlpito',
      desc: 'Interface otimizada para o momento da pregação, com controle de tempo, notas privadas e ajuste de fonte.',
      icon: Mic2,
      color: 'from-amber-500 to-orange-500',
      highlights: ['Cronômetro integrado', 'Notas invisíveis ao público', 'Auto-rolagem']
    },
    {
      title: t('bible') || 'Bíblia Digital',
      desc: 'Leitor bíblico completo com múltiplas versões, marcação de favoritos e insights ministeriais diários.',
      icon: Book,
      color: 'from-blue-500 to-cyan-500',
      highlights: ['Busca inteligente', 'Múltiplas versões', 'Dicas de pregação']
    },
    {
      title: t('agenda') || 'Agenda Ministerial',
      desc: 'Gerencie seus compromissos, convites e eventos de forma organizada e síncrona com sua equipe.',
      icon: Calendar,
      color: 'from-emerald-500 to-teal-500',
      highlights: ['Notificações 24h', 'Gestão de convidados', 'Mapa de locais']
    }
  ];

  const steps = [
    { 
      title: t('step1Title'), 
      desc: t('step1Desc'), 
      icon: LayoutDashboard,
      color: 'bg-blue-500/20 text-blue-400'
    },
    { 
      title: t('step2Title'), 
      desc: t('step2Desc'), 
      icon: PlusCircle,
      color: 'bg-green-500/20 text-green-400'
    },
    { 
      title: t('step3Title'), 
      desc: t('step3Desc'), 
      icon: Sparkles,
      color: 'bg-purple-500/20 text-purple-400'
    },
    { 
      title: t('step4Title'), 
      desc: t('step4Desc'), 
      icon: Mic2,
      color: 'bg-amber-500/20 text-amber-400'
    },
    { 
      title: t('step5Title'), 
      desc: t('step5Desc'), 
      icon: MessageSquare,
      color: 'bg-indigo-500/20 text-indigo-400'
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-8 border-b border-app-border/60">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-5 bg-app-accent rounded-full opacity-60" />
            <h1 className="text-xl font-bold tracking-tight text-app-text">
              {t('helpCenter')}
            </h1>
          </div>
          <p className="text-xs text-app-secondary font-medium tracking-wide transition-colors opacity-70">
            {t('howCanWeHelp') || 'Como podemos te ajudar hoje?'}
          </p>
        </div>
      </div>

      {/* Tabs Menu Grouped */}
      <div className="flex flex-col gap-6">
        {categories.map((cat, idx) => (
          <div key={idx} className="space-y-3">
            <h3 className="text-[10px] font-black text-app-secondary uppercase tracking-[0.2em] ml-2 opacity-60">
              {cat.group}
            </h3>
            <div className="flex flex-wrap gap-2">
              {cat.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as HelpTab)}
                  className={`
                    flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all border
                    ${activeTab === item.id 
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-600/20 scale-[1.02]' 
                      : 'bg-app-card border-app-border text-app-secondary hover:bg-app-card/80 hover:text-app-text hover:border-indigo-500/30'}
                  `}
                >
                  <item.icon size={14} className={activeTab === item.id ? 'text-white' : 'text-indigo-500/60'} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="frosted-glass rounded-[40px] border border-app-border p-8 min-h-[500px]">
        <AnimatePresence mode="wait">
          {activeTab === 'manual' && (
            <motion.div
              key="manual"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-12"
            >
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-app-text">{t('userManual')}</h2>
                <p className="text-app-secondary leading-relaxed max-w-2xl">{t('manualIntro')}</p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {steps.map((step, idx) => (
                  <div key={idx} className="group relative bg-app-card border border-app-border rounded-3xl p-6 hover:bg-app-card/60 transition-all hover:shadow-lg">
                    <div className="absolute -right-4 -top-4 w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-4xl font-black text-white/5 group-hover:text-white/10 transition-all italic">
                      {idx + 1}
                    </div>
                    <div className={`w-12 h-12 rounded-2xl ${step.color} flex items-center justify-center mb-6 shadow-sm ring-4 ring-white/5`}>
                      <step.icon size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-app-text mb-2 transition-colors">{step.title}</h3>
                    <p className="text-sm text-app-secondary leading-relaxed">{step.desc}</p>
                    
                    <div className="mt-6 pt-4 border-t border-app-border/40 flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                       <span className="text-[10px] font-bold text-indigo-400/60 uppercase tracking-widest">Recurso Essencial</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-8 border-t border-app-border">
                <div className="bg-indigo-500/10 rounded-3xl p-8 flex items-center justify-between gap-8 border border-indigo-500/5 shadow-inner">
                  <div className="space-y-2">
                    <h4 className="text-lg font-bold text-indigo-500">Dica Pro: Atalhos de Teclado</h4>
                    <p className="text-sm text-app-secondary">Pressione <span className="bg-app-card px-2 py-1 rounded text-app-text border border-app-border text-xs font-bold font-mono">ESC</span> para fechar qualquer janela ou <span className="bg-app-card px-2 py-1 rounded text-app-text border border-app-border text-xs font-bold font-mono">P</span> para abrir o Modo Púlpito rapidamente.</p>
                  </div>
                  <HelpCircle className="text-indigo-500/10 shrink-0" size={64} />
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'features' && (
            <motion.div
              key="features"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-12"
            >
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-app-text">Funcionalidades Principais</h2>
                <p className="text-app-secondary leading-relaxed max-w-2xl">Conheça as ferramentas poderosas que o Ministrando a palavra oferece para o seu ministério.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {features.map((feature, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="bg-app-card border border-app-border rounded-[32px] p-8 hover:shadow-2xl transition-all relative overflow-hidden group"
                  >
                    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${feature.color} opacity-5 blur-2xl group-hover:opacity-20 transition-opacity`} />
                    
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center text-white mb-6 shadow-lg shadow-indigo-500/20`}>
                      <feature.icon size={28} />
                    </div>

                    <h3 className="text-xl font-bold text-app-text mb-3">{feature.title}</h3>
                    <p className="text-sm text-app-secondary leading-relaxed mb-6">
                      {feature.desc}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {feature.highlights.map((h, i) => (
                        <span key={i} className="px-3 py-1 bg-app-bg border border-app-border rounded-full text-[10px] font-bold text-app-secondary uppercase tracking-tight">
                          {h}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
          {activeTab === 'api' && (
            <motion.div
              key="api"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center text-amber-500">
                  <Key size={24} />
                </div>
                <h2 className="text-2xl font-bold text-app-text">{t('apiUsageTitle')}</h2>
                <p className="text-app-secondary leading-relaxed max-w-2xl">{t('apiUsageDesc')}</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-app-card border border-app-border rounded-3xl p-6 space-y-4 hover:border-indigo-500/30 transition-all">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <Sparkles size={18} />
                    <h3 className="font-bold">{t('sharedKeyInfoTitle')}</h3>
                  </div>
                  <p className="text-sm text-app-secondary leading-relaxed">
                    {t('sharedKeyInfoDesc')}
                  </p>
                  <div className="bg-app-bg px-3 py-2 rounded-lg text-[10px] font-bold text-app-secondary uppercase tracking-widest border border-app-border">
                    5 {t('statPreachings').toLowerCase()} / dia
                  </div>
                </div>

                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-3xl p-6 space-y-4 hover:border-indigo-500/40 transition-all relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2">
                    <div className="bg-indigo-500 text-white text-[8px] font-black uppercase px-2 py-1 rounded-full tracking-tighter shadow-lg">
                      RECOMENDADO
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-indigo-500">
                    <CheckCircle2 size={18} />
                    <h3 className="font-bold">{t('individualKeyInfoTitle')}</h3>
                  </div>
                  <p className="text-sm text-app-secondary leading-relaxed">
                    {t('individualKeyInfoDesc')}
                  </p>
                  <div className="bg-indigo-500/10 px-3 py-2 rounded-lg text-[10px] font-bold text-indigo-500 uppercase tracking-widest border border-indigo-500/20">
                    15 {t('statPreachings').toLowerCase()} / dia
                  </div>
                </div>
              </div>

              <div className="bg-app-card/40 border border-app-border rounded-3xl p-8 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-app-bg flex items-center justify-center text-app-secondary shrink-0">
                  <ExternalLink size={20} />
                </div>
                <div className="space-y-2">
                  <h4 className="font-bold text-app-text">{t('howIncreaseLimitTitle') || 'Como migrar?'}</h4>
                  <p className="text-sm text-app-secondary leading-relaxed">
                    {t('howToIncreaseLimit')}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'policy' && (
            <motion.div
              key="policy"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-app-text">{t('privacyPolicy')}</h2>
              <div className="max-w-none space-y-4 text-app-secondary text-sm leading-relaxed">
                <p>Nossa Política de Privacidade descreve como coletamos, usamos e protegemos suas informações.</p>
                <h3 className="text-app-text font-bold">1. Coleta de Dados</h3>
                <p>Coletamos apenas as informações essenciais para o funcionamento da plataforma, como seu nome e e-mail via Google Auth.</p>
                <h3 className="text-app-text font-bold">2. Armazenamento Seguro</h3>
                <p>Seus estudos e ministrações são armazenados de forma criptografada e segura nos servidores do Firebase (Google).</p>
                <h3 className="text-app-text font-bold">3. Compartilhamento</h3>
                <p>Não compartilhamos seus data com terceiros. Seus estudos são privados, a menos que você opte por compartilhá-los com outros usuários.</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'terms' && (
            <motion.div
              key="terms"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-app-text">{t('termsOfUse')}</h2>
              <div className="max-w-none space-y-4 text-app-secondary text-sm leading-relaxed">
                <p>Ao utilizar o Ministrando a palavra, você concorda com os seguintes termos:</p>
                <h3 className="text-app-text font-bold">1. Uso Aceitável</h3>
                <p>A plataforma deve ser utilizada para fins ministeriais, estudos bíblicos e preparação de sermões.</p>
                <h3 className="text-app-text font-bold">2. Propriedade Intelectual</h3>
                <p>Você retém todos os direitos sobre o conteúdo criado por você. A plataforma e suas ferramentas são de propriedade da Ministrando a palavra.</p>
                <h3 className="text-app-text font-bold">3. Limitação de Responsabilidade</h3>
                <p>O Ministrando a palavra é fornecido "como está", buscando sempre a melhor disponibilidade, mas sem garantias de interrupções zero.</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'contact' && (
            <motion.div
              key="contact"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col lg:flex-row gap-12"
            >
              <div className="flex-1 space-y-8">
                <div className="space-y-4 text-center lg:text-left">
                  <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-500 mx-auto lg:mx-0 mb-4 border border-indigo-500/10 shadow-sm">
                    <Mail size={32} />
                  </div>
                  <h2 className="text-2xl font-bold text-app-text">{t('contactAdmin')}</h2>
                  <p className="text-app-secondary">{t('contactText')}</p>
                </div>

                <form onSubmit={handleSend} className="space-y-4 text-left">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-app-secondary opacity-70">{t('message') || 'Mensagem'}</label>
                    <textarea 
                      required
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={t('msgPlaceholder')}
                      className="w-full bg-app-card/30 border border-app-border rounded-2xl p-4 text-app-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[150px] resize-none transition-all shadow-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSending || isSent}
                    className={`
                      w-full py-4 rounded-2xl font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all
                      ${isSent ? 'bg-green-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'}
                      ${isSending ? 'opacity-70 cursor-not-allowed' : ''}
                    `}
                  >
                    {isSending ? (
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      >
                        <HelpCircle size={18} />
                      </motion.div>
                    ) : isSent ? (
                      <>
                        <CheckCircle2 size={18} />
                        {t('msgSent')}
                      </>
                    ) : (
                      <>
                        <MessageSquare size={18} />
                        {t('sendMsg')}
                      </>
                    )}
                  </button>
                </form>

                <div className="pt-8 space-y-4 text-center lg:text-left">
                  <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-app-secondary opacity-60">Siga-nos nas redes / Suporte Direto</p>
                  <div className="flex flex-wrap justify-center lg:justify-start gap-4">
                    <a 
                      href="https://wa.me/5531973148166" 
                      target="_blank" 
                      rel="noreferrer" 
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#25D366]/10 border border-[#25D366]/20 rounded-2xl text-xs font-bold text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all hover:shadow-md group"
                    >
                      <MessageCircle size={16} className="group-hover:scale-110 transition-transform" />
                      <span>WhatsApp</span>
                    </a>
                    <a 
                      href="https://www.instagram.com/ministrandoapalavra.app?igsh=MWE5N2JvcWo0Z25ydg=="
                      target="_blank" 
                      rel="noreferrer" 
                      className="flex items-center gap-2 px-5 py-2.5 bg-pink-500/5 border border-pink-500/20 rounded-2xl text-xs font-bold text-app-secondary hover:text-pink-500 hover:border-pink-500/30 transition-all group"
                    >
                      <Instagram size={16} className="text-pink-500 group-hover:scale-110 transition-transform" />
                      <span>Instagram</span>
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-6">
                <div className="flex items-center justify-between gap-2 text-app-text mb-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={20} className="text-indigo-500" />
                    <h3 className="font-bold text-lg">{t('messageHistory')}</h3>
                  </div>
                  <div className="flex gap-1 p-1 bg-app-card/40 border border-app-border rounded-xl">
                    <button
                      onClick={() => setContactSubTab('inbox')}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${contactSubTab === 'inbox' ? 'bg-indigo-500 text-white shadow-sm' : 'text-app-secondary hover:text-app-text'}`}
                    >
                      {language === 'pt' ? 'Entrada' : language === 'es' ? 'Bandeja' : 'Inbox'}
                    </button>
                    <button
                      onClick={() => setContactSubTab('archived')}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${contactSubTab === 'archived' ? 'bg-indigo-500 text-white shadow-sm' : 'text-app-secondary hover:text-app-text'}`}
                    >
                      {language === 'pt' ? 'Arquivo' : language === 'es' ? 'Archivo' : 'Archived'}
                    </button>
                  </div>
                </div>

                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 no-scrollbar">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                  ) : userMessages.filter(m => contactSubTab === 'archived' ? m.archived : !m.archived).length > 0 ? (
                    userMessages.filter(m => contactSubTab === 'archived' ? m.archived : !m.archived).map((msg) => (
                      <div key={msg.id} className="frosted-glass rounded-3xl border border-app-border p-5 space-y-4 transition-all hover:border-indigo-500/20">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                              <UserIcon size={16} />
                            </div>
                            <div>
                               <p className="text-[10px] font-bold text-app-text">{t('myMessages')}</p>
                               <p className="text-[9px] text-app-secondary opacity-60">
                                 {msg.createdAt ? format(msg.createdAt.toDate(), 'PPP HH:mm', { locale }) : '...'}
                               </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${msg.status === 'pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-green-500/10 text-green-500'}`}>
                              {t(msg.status)}
                            </div>
                            <button 
                              onClick={() => {
                                if (msg.archived) {
                                  updateDoc(doc(db, 'contactMessages', msg.id), { archived: false, archivedBy: deleteField() });
                                } else {
                                  handleArchiveMessage(msg.id);
                                }
                              }}
                              className={`p-1.5 transition-colors ${msg.archived ? 'text-indigo-500 hover:text-app-text' : 'text-app-secondary hover:text-indigo-500'}`}
                              title={msg.archived ? 'Desarquivar' : 'Arquivar'}
                            >
                              <Archive size={14} />
                            </button>
                            <button 
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="p-1.5 text-app-secondary hover:text-red-500 transition-colors"
                              title={t('confirmDeleteMessage')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-app-text leading-relaxed bg-app-bg/40 p-3 rounded-xl border border-app-border/20 italic">
                          {msg.message}
                        </p>

                        {msg.status === 'replied' && (
                          <div className="pl-4 space-y-3">
                            <div className="flex items-center gap-2 text-[9px] font-bold text-indigo-500 uppercase tracking-widest">
                              <CornerDownRight size={14} />
                              {t('adminReply')}
                            </div>
                            <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4 text-xs text-app-secondary italic whitespace-pre-wrap">
                              {msg.replyMessage}
                            </div>
                            <p className="text-[8px] text-indigo-400 opacity-60 ml-1">
                              Respondido em {msg.repliedAt ? format(msg.repliedAt.toDate(), 'PPP HH:mm', { locale }) : '...'}
                            </p>
                          </div>
                        )}

                        {msg.status === 'pending' && (
                          <div className="flex items-center gap-2 text-[9px] font-bold text-amber-500/60 uppercase tracking-widest pl-2">
                            <Clock size={12} />
                            {t('waitingReply')}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-12 text-center border-2 border-dashed border-app-border rounded-[40px] opacity-40">
                      <MessageSquare size={48} className="mx-auto mb-4 text-app-secondary" />
                      <p className="text-sm font-bold text-app-secondary">{t('noMessagesFound')}</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer / Copyright */}
      <div className="flex flex-col items-center gap-4 text-app-secondary/60 pb-12">
        <p className="text-xs font-medium">{t('copyright')}</p>
        <div className="flex items-center gap-4">
          <button className="text-[10px] uppercase font-bold tracking-widest hover:text-indigo-400 transition-colors">Política de Cookies</button>
          <span className="w-1 h-1 bg-app-border rounded-full" />
          <button className="text-[10px] uppercase font-bold tracking-widest hover:text-indigo-400 transition-colors">LGPD</button>
          <span className="w-1 h-1 bg-app-border rounded-full" />
          <button className="text-[10px] uppercase font-bold tracking-widest hover:text-indigo-400 transition-colors">Segurança</button>
        </div>
      </div>

      {/* New Reply Notification Toast */}
      <AnimatePresence>
        {newReplyToast?.show && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[110] bg-indigo-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 min-w-[300px]"
          >
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <MessageSquare size={20} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Nova Resposta!</p>
              <p className="text-sm font-bold truncate max-w-[200px]">O administrador respondeu seu contato.</p>
            </div>
            <button 
              onClick={() => {
                setNewReplyToast(null);
                setActiveTab('contact');
              }}
              className="ml-auto bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors"
            >
              <ChevronDown size={16} className="-rotate-90" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
