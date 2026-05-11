import { useEffect, useState } from 'react';
import { CheckCircle2, Sparkles, BookOpen, Mic2, Calendar, ShieldCheck, ArrowRight, Star, Quote, Zap, Globe, MessageSquare, TrendingUp, Layers, MousePointer2, Copy, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';

export default function SalesLandingPage({ onLogin, isLoading = false }: { onLogin: () => void, isLoading?: boolean }) {
  const { t } = useLanguage();
  const CHECKOUT_URL = 'https://pay.cakto.com.br/3e8jisv_879064';

  useEffect(() => {
    document.title = "Ministrando a Palavra | Premium";
    
    // Set dynamic favicon
    const link = (document.querySelector("link[rel*='icon']") || document.createElement('link')) as HTMLLinkElement;
    link.type = 'image/svg+xml';
    link.rel = 'shortcut icon';
    link.href = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📖</text></svg>';
    document.getElementsByTagName('head')[0].appendChild(link);
  }, []);

  const features = [
    {
      icon: Sparkles,
      title: 'IA Assistente Teológica',
      description: 'IA profunda que aprende com seu estilo e evolui com seu ministério ao longo do tempo.'
    },
    {
      icon: BookOpen,
      title: 'Bíblia Integrada Multiversões',
      description: 'Acesse dezenas de versões bíblicas enquanto escreve ou prega, sem sair da ferramenta.'
    },
    {
      icon: Mic2,
      title: 'Modo Púlpito Profissional',
      description: 'Uma interface limpa para pregação com cronômetro, ajuste de fonte e notas espirituais exclusivas.'
    },
    {
      icon: Calendar,
      title: 'Gestão de Agenda Ministerial',
      description: 'Nunca perca um compromisso. Organize pregações, eventos e convites em um só lugar.'
    },
    {
      icon: MessageSquare,
      title: 'Suporte Direto com Admin',
      description: 'Dúvidas ou problemas? Fale diretamente no suporte@ministrandoapalavra.com.br.'
    },
    {
      icon: ShieldCheck,
      title: 'Segurança e Praticidade',
      description: 'Seus estudos salvos na nuvem, acessíveis de qualquer lugar do mundo com segurança total.'
    }
  ];

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-slate-900 font-sans selection:bg-indigo-100 overflow-x-hidden">
      {/* Background decoration with animated feel */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.4, 0.3],
            x: [0, 50, 0],
            y: [0, 30, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[5%] left-[-5%] w-[40%] h-[40%] bg-indigo-200/30 blur-[120px] rounded-full" 
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1],
            opacity: [0.4, 0.5, 0.4],
            x: [0, -30, 0],
            y: [0, 50, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[15%] right-[-5%] w-[50%] h-[50%] bg-rose-100/30 blur-[130px] rounded-full" 
        />
        <div className="absolute top-[40%] left-[20%] w-[30%] h-[30%] bg-amber-100/20 blur-[100px] rounded-full" />
      </div>

      {/* Header/Nav - Floating Style */}
      <nav className="fixed top-0 left-0 right-0 z-[100] px-4 py-4 md:px-6 md:py-6 pointer-events-none">
        <div className="max-w-7xl mx-auto flex items-center justify-between bg-white/70 backdrop-blur-xl border border-white/40 shadow-sm rounded-[2rem] px-6 py-3 pointer-events-auto">
          <div className="flex items-center gap-2 md:gap-3">
            <motion.div 
              whileHover={{ rotate: 10, scale: 1.1 }}
              className="w-10 h-10 md:w-11 md:h-11 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20"
            >
              <BookOpen className="text-white" size={20} />
            </motion.div>
            <div className="flex flex-col leading-tight">
              <span className="font-serif italic text-xl md:text-2xl text-slate-900 tracking-tight">Ministrando</span>
              <span className="font-bold tracking-[0.4em] text-[8px] md:text-[9px] text-indigo-600 uppercase mt-0.5 opacity-80">a palavra</span>
            </div>
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            <button 
              type="button"
              disabled={isLoading}
              onClick={onLogin}
              className="text-slate-500 font-bold text-xs md:text-sm hover:text-indigo-600 transition-colors px-2 md:px-4 py-2 flex items-center gap-2 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="animate-spin" size={14} /> : 'Entrar'}
            </button>
            <a 
              href={CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 bg-indigo-900 text-white px-6 md:px-8 py-2 md:py-3 rounded-full font-bold text-xs md:text-sm hover:bg-indigo-800 transition-all shadow-xl shadow-indigo-900/10 active:scale-95"
            >
              Assinar Agora
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section - Optimized for all screens */}
      <header className="relative z-10 pt-32 md:pt-48 pb-20 md:pb-32 px-6 max-w-7xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-flex items-center gap-2 bg-white/60 backdrop-blur-md text-indigo-700 px-4 md:px-5 py-2 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] mb-8 md:mb-12 border border-white shadow-sm">
            <Sparkles size={14} className="fill-indigo-700/20" /> Tecnologia inspirada para o seu chamado
          </div>
          
          <div className="relative mb-8 md:mb-10">
            <h1 className="text-5xl sm:text-6xl md:text-8xl lg:text-[7.5rem] font-serif italic text-slate-900 leading-[1.05] mb-8 md:mb-12 tracking-tight max-w-6xl mx-auto relative z-10">
              Sua pregação merece a melhor <span className="text-indigo-600 not-italic font-sans font-black tracking-tighter inline-block relative">
                ferramenta
                <svg className="absolute -bottom-2 left-0 w-full h-3 text-indigo-100 -z-10" viewBox="0 0 100 12" preserveAspectRatio="none"><path d="M0,10 C30,0 70,0 100,10" stroke="currentColor" strokeWidth="8" fill="none" /></svg>
              </span>
            </h1>
          </div>
          
          <p className="text-lg md:text-2xl text-slate-500 max-w-3xl mx-auto mb-12 md:mb-20 font-medium leading-relaxed px-4">
            A ferramenta definitiva para pastores e ministros. Crie esboços profundos com IA, organize sua agenda e pregue com a excelência que a Palavra exige.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 mb-20 px-4">
            <a 
              href={CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group w-full sm:w-auto bg-indigo-600 text-white px-10 md:px-14 py-5 md:py-7 rounded-[2.5rem] font-black uppercase text-xs md:text-sm tracking-widest hover:bg-indigo-500 transition-all shadow-2xl shadow-indigo-600/30 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95"
            >
              Assinar Premium <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </a>
            <button 
              type="button"
              disabled={isLoading}
              onClick={(e) => { e.preventDefault(); onLogin(); }}
              className="w-full sm:w-auto bg-white/80 backdrop-blur-sm text-indigo-600 border border-indigo-100 px-10 md:px-14 py-5 md:py-7 rounded-[2.5rem] font-black uppercase text-xs md:text-sm tracking-widest hover:border-indigo-600 transition-all flex items-center justify-center gap-3 hover:shadow-lg active:scale-95 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>Autenticando...</span>
                </>
              ) : (
                'Teste Grátis 3 Dias'
              )}
            </button>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 opacity-50 grayscale group-hover:grayscale-0 transition-all duration-700">
             <div className="flex items-center gap-2 font-black text-[9px] md:text-[10px] tracking-[0.2em] uppercase"><ShieldCheck size={16} className="text-indigo-600" /> Alta Segurança</div>
             <div className="hidden sm:block w-1 h-1 rounded-full bg-slate-300" />
             <div className="flex items-center gap-2 font-black text-[9px] md:text-[10px] tracking-[0.2em] uppercase"><TrendingUp size={16} className="text-indigo-600" /> IA Teológica</div>
             <div className="hidden sm:block w-1 h-1 rounded-full bg-slate-300" />
             <div className="flex items-center gap-2 font-black text-[9px] md:text-[10px] tracking-[0.2em] uppercase"><CheckCircle2 size={16} className="text-indigo-600" /> 7 Dias Garantia</div>
          </div>

          {/* Scroll Indicator */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 1 }}
            className="hidden md:flex flex-col items-center gap-3 mt-20"
          >
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Descobrir ferramentas</span>
            <div className="w-px h-12 bg-gradient-to-b from-indigo-200 to-transparent" />
          </motion.div>
        </motion.div>

        {/* Improved Responsive Mockup */}
        <motion.div 
          initial={{ opacity: 0, y: 60 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-24 md:mt-40 relative max-w-6xl mx-auto px-2"
        >
          {/* Decorative Glow */}
          <div className="absolute -inset-4 md:-inset-10 bg-gradient-to-tr from-indigo-500/10 via-amber-500/5 to-rose-500/10 blur-[80px] rounded-[4rem] -z-10" />
          
          <div className="bg-white rounded-[2rem] md:rounded-[4rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.15)] border border-slate-200/60 overflow-hidden flex flex-col relative aspect-video md:aspect-[16/9.5]">
             {/* Browser Bar - Simplified for mobile */}
             <div className="h-10 md:h-14 bg-slate-50/50 border-b border-slate-100 flex items-center px-4 md:px-8 gap-3">
                <div className="flex gap-1.5 md:gap-2">
                  <div className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 rounded-full bg-rose-200" />
                  <div className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 rounded-full bg-amber-200" />
                  <div className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 rounded-full bg-emerald-200" />
                </div>
                <div className="ml-4 md:ml-8 h-6 md:h-8 bg-white border border-slate-200/50 rounded-lg md:rounded-xl flex items-center px-3 md:px-4 w-full max-w-[280px] md:max-w-96 shadow-sm">
                  <Globe size={10} className="text-slate-300 mr-2" />
                  <span className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">ministrandoapalavra.com.br/dashboard</span>
                </div>
             </div>
             
             {/* Content Mockup - Responsive layout */}
             <div className="flex-1 flex bg-slate-50 relative overflow-hidden">
                {/* Sidebar - Desktop Only */}
                <div className="hidden md:flex w-24 bg-slate-900 flex-col items-center py-10 gap-8 border-r border-slate-800">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
                      <BookOpen size={24} />
                    </div>
                    {[1,2,3,4].map(i => (
                      <div key={i} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/30 border border-white/5 opacity-40">
                        <div className="w-5 h-5 rounded bg-current" />
                      </div>
                    ))}
                </div>

                {/* Main View */}
                <div className="flex-1 p-6 md:p-12 overflow-hidden flex flex-col">
                   <div className="max-w-5xl mx-auto w-full h-full flex flex-col gap-6 md:gap-10">
                      {/* Dashboard Header */}
                      <div className="flex justify-between items-start">
                         <div className="space-y-2 md:space-y-3">
                            <div className="h-6 md:h-10 bg-slate-200 rounded-lg md:rounded-xl w-32 md:w-64" />
                            <div className="h-3 md:h-4 bg-slate-100 rounded-md md:rounded-lg w-20 md:w-40" />
                         </div>
                         <div className="flex gap-2 md:gap-4">
                            <div className="hidden sm:block h-10 md:h-12 bg-white rounded-xl md:rounded-2xl w-10 md:w-12 border border-slate-200 flex items-center justify-center">
                               <div className="h-3 bg-slate-200 rounded-full w-full mx-2" />
                            </div>
                            <div className="h-10 md:h-12 bg-indigo-600 rounded-xl md:rounded-2xl w-24 md:w-40 shadow-xl shadow-indigo-600/20" />
                         </div>
                      </div>

                      {/* Content Grid */}
                      <div className="flex-1 grid grid-cols-12 gap-4 md:gap-8 min-h-0">
                         {/* Left List - Shrunk on mobile */}
                         <div className="col-span-12 md:col-span-4 space-y-3 md:space-y-4">
                            {[1,2,3].map(i => (
                              <div key={i} className="p-3 md:p-4 bg-white rounded-xl md:rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-2">
                                 <div className="h-2.5 md:h-3 bg-slate-200 rounded-full w-3/4" />
                                 <div className="h-1.5 md:h-2 bg-slate-100 rounded-full w-1/2" />
                              </div>
                            ))}
                         </div>
                         
                         {/* Editor View - Shown as primary on desktop */}
                         <div className="hidden md:flex md:col-span-8 bg-white border border-indigo-100/50 rounded-[2rem] md:rounded-[3rem] shadow-xl p-8 md:p-10 flex-col relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -m-10 opacity-60" />
                            
                            <div className="flex items-center gap-4 mb-8 md:mb-10 relative z-10">
                               <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 text-white rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
                                  <Sparkles className="w-5 h-5 md:w-6 md:h-6" />
                               </div>
                               <div className="space-y-1">
                                  <div className="h-4 md:h-5 bg-slate-200 rounded-lg w-32 md:w-48" />
                                  <div className="h-2.5 md:h-3 bg-slate-100 rounded-full w-24 md:w-32" />
                                </div>
                            </div>

                            <div className="space-y-4 md:space-y-6 flex-1 min-h-0 overflow-hidden relative z-10">
                               <div className="h-3 md:h-4 bg-slate-50 rounded-full w-full" />
                               <div className="h-3 md:h-4 bg-slate-50 rounded-full w-[95%]" />
                               <div className="h-3 md:h-4 bg-indigo-50/50 rounded-full w-[80%]" />
                               
                               <div className="pt-6 md:pt-8 space-y-4">
                                  <div className="inline-flex gap-2 items-center px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-[9px] font-bold uppercase tracking-wider">
                                     <Quote size={12} /> Sugestão Contextual
                                  </div>
                                  <div className="p-4 md:p-6 bg-slate-50/50 rounded-2xl md:rounded-3xl border border-slate-100 relative">
                                     <div className="h-2.5 md:h-3 bg-slate-200 rounded-full w-full mb-3" />
                                     <div className="h-2.5 md:h-3 bg-slate-200 rounded-full w-[90%]" />
                                     <div className="absolute -right-4 -bottom-4">
                                        <div className="bg-indigo-600 text-white p-2.5 md:p-3 rounded-xl md:rounded-2xl shadow-xl animate-pulse">
                                           <MousePointer2 size={16} />
                                        </div>
                                     </div>
                                  </div>
                               </div>
                            </div>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>

          {/* Floating UI Badges - Optimized Responsively */}
          <div className="absolute -top-6 md:-top-12 -left-4 md:-left-12 bg-white/90 backdrop-blur-xl p-4 md:p-8 rounded-2xl md:rounded-[2.5rem] shadow-2xl border border-white flex items-center gap-3 md:gap-5 hover:translate-y-[-5px] transition-transform duration-500 z-20">
             <div className="w-10 h-10 md:w-16 md:h-16 bg-indigo-50 text-indigo-600 rounded-xl md:rounded-3xl flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-6 h-6 md:w-8 md:h-8" />
             </div>
             <div>
                <p className="text-[7px] md:text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-0.5 md:mb-1">Inteligência Ágil</p>
                <p className="font-bold text-base md:text-2xl text-slate-900 tracking-tight leading-none md:leading-normal">Esboços em Segundos</p>
             </div>
          </div>

          <div className="absolute top-[60%] md:top-[15%] -right-4 md:-right-16 bg-white/90 backdrop-blur-xl p-4 md:p-8 rounded-2xl md:rounded-[2.5rem] shadow-2xl border border-white flex items-center gap-3 md:gap-5 transform rotate-2 md:-rotate-2 hover:rotate-0 transition-transform duration-500 z-20">
             <div className="w-10 h-10 md:w-16 md:h-16 bg-rose-50 text-rose-600 rounded-xl md:rounded-3xl flex items-center justify-center shadow-inner">
                <Mic2 className="w-6 h-6 md:w-8 md:h-8" />
             </div>
             <div>
                <p className="text-[7px] md:text-[10px] font-black uppercase tracking-[0.2em] text-rose-400 mb-0.5 md:mb-1">Foco no Altar</p>
                <p className="font-bold text-base md:text-2xl text-slate-900 tracking-tight leading-none md:leading-normal">Modo Púlpito</p>
             </div>
          </div>
        </motion.div>


      </header>

      {/* Platform Preview: Deep Dive */}
      <section className="py-40 px-6 bg-white relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1px] bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
        
        <div className="max-w-7xl mx-auto">
          {/* Section 1: AI */}
          <div className="flex flex-col lg:flex-row items-center gap-24 mb-48">
             <motion.div 
               initial={{ opacity: 0, x: -30 }}
               whileInView={{ opacity: 1, x: 0 }}
               viewport={{ once: true }}
               className="flex-1 space-y-10"
             >
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-sm">
                   <Sparkles size={14} /> Inteligência Teológica
                </div>
                <h2 className="text-5xl md:text-7xl font-serif italic text-slate-900 leading-tight">
                  Sua ferramenta para a <span className="text-indigo-600 font-sans font-black not-italic block md:inline">Palavra</span>
                </h2>
                <p className="text-xl text-slate-500 leading-relaxed max-w-xl">
                  Não é apenas uma ferramenta, é um parceiro que aprende com o seu estilo ao longo do tempo, ajudando você a encontrar as melhores palavras, referências e insights para abençoar a sua igreja.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-4">
                   <div className="space-y-4">
                      <div className="w-12 h-12 bg-white rounded-2xl shadow-lg border border-slate-50 flex items-center justify-center text-indigo-600">
                         <Layers size={24} />
                      </div>
                      <h4 className="font-bold text-slate-900">Múltiplas Versões</h4>
                      <p className="text-slate-500 text-sm">Compare traduções em tempo real enquanto escreve seu sermão.</p>
                   </div>
                   <div className="space-y-4">
                      <div className="w-12 h-12 bg-white rounded-2xl shadow-lg border border-slate-50 flex items-center justify-center text-amber-500">
                         <Zap size={24} />
                      </div>
                      <h4 className="font-bold text-slate-900">Velocidade Divina</h4>
                      <p className="text-slate-500 text-sm">Esboços estruturados que levariam horas, agora em segundos.</p>
                   </div>
                </div>
             </motion.div>

             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               whileInView={{ opacity: 1, scale: 1 }}
               viewport={{ once: true }}
               className="flex-1 relative"
             >
                <div className="bg-slate-50 rounded-[3rem] p-4 shadow-inner border border-slate-200">
                   <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden aspect-square flex flex-col p-8 sm:p-12 relative group">
                      <div className="absolute inset-0 bg-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="space-y-8 relative z-10">
                         <div className="h-4 bg-slate-100 rounded-full w-full" />
                         <div className="h-4 bg-slate-100 rounded-full w-5/6" />
                         <div className="h-4 bg-slate-100 rounded-full w-4/6" />
                         <div className="pt-8 flex gap-4">
                            <div className="h-16 bg-white border border-indigo-100 rounded-3xl flex-1 shadow-sm flex items-center px-6">
                               <div className="h-3 bg-indigo-600/20 rounded-full w-full" />
                            </div>
                            <div className="w-16 h-16 bg-indigo-600 rounded-3xl shadow-xl shadow-indigo-600/30 flex items-center justify-center text-white">
                               <Sparkles size={28} />
                            </div>
                         </div>
                         <div className="pt-12 grid grid-cols-2 gap-6">
                            {[1,2,3,4].map(i => (
                              <div key={i} className="h-20 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center">
                                 <div className="h-3 bg-slate-200 rounded-full w-1/2" />
                              </div>
                            ))}
                         </div>
                      </div>
                   </div>
                </div>
                {/* Visual Glow */}
                <div className="absolute -z-10 -bottom-10 -left-10 w-64 h-64 bg-indigo-600/10 blur-[100px] rounded-full" />
             </motion.div>
          </div>

          {/* Section 2: Púlpito */}
          <div className="flex flex-col lg:flex-row-reverse items-center gap-24">
             <motion.div 
               initial={{ opacity: 0, x: 30 }}
               whileInView={{ opacity: 1, x: 0 }}
               viewport={{ once: true }}
               className="flex-1 space-y-10"
             >
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-sm">
                   <Mic2 size={14} /> Modo Púlpito Profissional
                </div>
                <h2 className="text-5xl md:text-7xl font-serif italic text-slate-900 leading-tight">
                  Toda atenção na <span className="text-amber-600 font-sans font-black not-italic block md:inline">entrega da mensagem</span>
                </h2>
                <p className="text-xl text-slate-500 leading-relaxed max-w-xl">
                  Diga adeus à complicação tecnológica na hora de pregar. Uma interface feita para que nada tire o seu foco do altar.
                </p>
                <div className="space-y-6 pt-4">
                   {['Controle de tempo integrado', 'Ajuste dinâmico de leitura', 'Modo foco total (sem distrações)', 'Acesso imediato às notas'].map(item => (
                     <div key={item} className="flex items-center gap-4 text-slate-700 font-bold">
                        <div className="w-6 h-6 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center shadow-sm">
                           <CheckCircle2 size={14} />
                        </div>
                        {item}
                     </div>
                   ))}
                </div>
             </motion.div>

             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               whileInView={{ opacity: 1, scale: 1 }}
               viewport={{ once: true }}
               className="flex-1 relative"
             >
                <div className="bg-slate-900 rounded-[3.5rem] p-6 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] border border-slate-800">
                   <div className="bg-black rounded-[2.5rem] shadow-inner overflow-hidden aspect-square flex flex-col p-10 relative">
                      <div className="flex justify-between items-center text-slate-500 border-b border-slate-800/50 pb-8 mb-8">
                         <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-red-600 animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Tempo de Pregação</span>
                         </div>
                         <div className="font-mono text-xl text-indigo-400">45:00</div>
                      </div>
                      
                      <div className="space-y-8 text-slate-300">
                         <h3 className="text-4xl font-serif italic text-white">Introdução: A Rocha</h3>
                         <div className="h-4 bg-white/5 rounded-full w-full" />
                         <div className="h-4 bg-white/5 rounded-full w-full" />
                         <div className="h-4 bg-white/5 rounded-full w-3/4" />
                         
                         <div className="p-8 bg-indigo-500/5 border border-indigo-500/20 rounded-[2rem] text-indigo-300 italic text-xl shadow-lg">
                            "Pois onde estiver o vosso tesouro, ai estará também o vosso coração."
                            <div className="mt-4 text-[12px] font-black uppercase tracking-widest opacity-60">— Mateus 6:21</div>
                         </div>
                      </div>
                      
                      <div className="mt-auto h-20 bg-gradient-to-t from-black to-transparent absolute bottom-0 left-0 w-full" />
                   </div>
                </div>
                {/* Visual Glow */}
                <div className="absolute -z-10 -bottom-10 -right-10 w-64 h-64 bg-amber-500/10 blur-[100px] rounded-full" />
             </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="bg-white py-40 px-6 border-t border-slate-100">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 mb-6 tracking-tight">O que você recebe no <span className="text-indigo-600 italic font-serif font-medium">Premium</span></h2>
            <p className="text-slate-500 text-xl max-w-2xl mx-auto">Tudo o que você precisa para uma jornada ministerial produtiva, intuitiva e abençoada.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <motion.div
                key={idx}
                whileHover={{ y: -10 }}
                className="p-10 rounded-[3rem] bg-slate-50 border border-slate-200/50 hover:border-indigo-200 hover:bg-white hover:shadow-2xl hover:shadow-indigo-600/5 transition-all group"
              >
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-8 shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-500 border border-slate-100 group-hover:border-indigo-600">
                  <feature.icon size={32} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">{feature.title}</h3>
                <p className="text-slate-500 leading-relaxed text-lg break-words">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing / Irresistible Offer - Deep and Impactful */}
      <section id="offers" className="py-32 md:py-48 px-6 bg-[#0B0D11] text-white overflow-hidden relative">
        <div className="absolute top-[10%] right-[-10%] w-[600px] h-[600px] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[10%] left-[-10%] w-[600px] h-[600px] bg-rose-600/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16 md:mb-24">
            <motion.div 
               initial={{ opacity: 0, y: 20 }}
               whileInView={{ opacity: 1, y: 0 }}
               viewport={{ once: true }}
            >
              <h2 className="text-4xl md:text-8xl font-black mb-8 tracking-tighter leading-tight">
                Um convite para a <br /><span className="text-indigo-400 font-serif italic font-medium">excelência ministerial</span>
              </h2>
              <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto font-medium px-4">
                Recupere o seu tempo e potencialize o seu chamado com a melhor ferramenta de apoio para pregadores do Brasil.
              </p>
            </motion.div>
          </div>
          
          <div className="flex flex-col lg:flex-row items-stretch gap-8 md:gap-10 max-w-6xl mx-auto">
             <motion.div 
               whileHover={{ y: -5 }}
               className="flex-[1.5] bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[3rem] md:rounded-[4rem] p-8 md:p-20 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] relative overflow-hidden group"
             >
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-[80px] -m-32 transition-opacity group-hover:opacity-100 opacity-60" />
                
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-center gap-4 mb-10 md:mb-12">
                     <div className="w-12 h-12 md:w-16 md:h-16 bg-indigo-600 text-white rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/40">
                        <Star className="fill-white w-7 h-7 md:w-8 md:h-8" />
                     </div>
                     <span className="text-indigo-400 font-black uppercase tracking-[0.4em] text-[9px] md:text-[10px]">Acesso Premium Anual</span>
                  </div>

                  <div className="flex flex-col md:flex-row items-baseline gap-4 md:gap-8 mb-12 md:mb-16">
                    <div className="relative">
                      <span className="text-slate-500 text-2xl md:text-3xl line-through decoration-rose-500 font-bold opacity-60">R$ 147</span>
                      <div className="absolute -top-6 md:-top-8 -left-4 md:-left-8 bg-rose-600 text-white text-[9px] md:text-[10px] font-black px-3 md:px-4 py-1.5 md:py-2 rounded-xl shadow-xl">LANÇAMENTO</div>
                    </div>
                    <div className="flex items-baseline gap-3 md:gap-4">
                      <span className="text-slate-400 text-3xl md:text-4xl font-serif italic">por</span>
                      <span className="text-6xl md:text-8xl font-black tracking-tighter text-white leading-none">29,90</span>
                      <div className="flex flex-col items-start leading-[1.1] transform translate-y-[-5px] md:translate-y-[-10px]">
                        <span className="text-indigo-400 font-black text-xl md:text-2xl">R$</span>
                        <span className="text-slate-500 font-bold uppercase text-[10px] md:text-[12px] tracking-widest leading-none mt-1 md:mt-2">/ ano</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-slate-400 text-lg md:text-xl mb-12 md:mb-20 font-medium max-w-md leading-relaxed">
                    Menos que o preço de um café por mês para ter acesso a todas as ferramentas premium.
                  </p>

                  <div className="mt-auto space-y-4 md:space-y-6">
                    <a 
                      href={CHECKOUT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-indigo-600 text-white py-6 md:py-8 rounded-[2rem] md:rounded-[2.5rem] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] hover:bg-indigo-500 transition-all shadow-2xl shadow-indigo-600/40 block text-center text-lg md:text-xl active:scale-[0.98] hover:scale-[1.01]"
                    >
                      Ativar Premium Agora
                    </a>
                    <button 
                      type="button"
                      disabled={isLoading}
                      onClick={(e) => { e.preventDefault(); onLogin(); }}
                      className="w-full bg-white/5 hover:bg-white/10 text-white py-5 md:py-6 rounded-[2rem] md:rounded-[2.5rem] font-black uppercase tracking-[0.1em] md:tracking-[0.2em] border border-white/10 transition-all text-xs active:scale-[0.98] cursor-pointer flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          <span>Autenticando...</span>
                        </>
                      ) : (
                        'Começar Teste de 3 Dias'
                      )}
                    </button>
                  </div>
                </div>
             </motion.div>

             <div className="flex-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[3rem] md:rounded-[4rem] p-10 md:p-16 flex flex-col justify-center">
                <h4 className="text-xl md:text-2xl font-bold mb-10 md:mb-12 text-slate-300">O que você desbloqueia:</h4>
                <div className="space-y-8 md:space-y-10">
                   {[
                     'IA Teológica (que aprende com você)',
                     'Bíblia Multiversões Completa',
                     'Organizador de Agenda Ministerial',
                     'Modo Púlpito Personalizado',
                     'Backup em Nuvem Seguro',
                     'Suporte Exclusivo'
                   ].map(item => (
                     <div key={item} className="flex items-center gap-5 md:gap-6 text-base md:text-lg font-bold text-white/80">
                        <div className="w-7 h-7 md:w-8 md:h-8 bg-indigo-500/20 text-indigo-400 rounded-lg md:rounded-xl flex items-center justify-center border border-indigo-500/20 shadow-inner">
                           <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" />
                        </div>
                        {item}
                     </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Numbers Section */}
      <section className="py-48 bg-[#FDFCFB] border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
           <div className="flex flex-col lg:flex-row items-center gap-32">
              <div className="flex-1">
                 <Quote className="text-indigo-100 fill-indigo-100 -mb-6 -ml-10 opacity-60" size={120} />
                 <h3 className="text-5xl md:text-7xl font-serif italic text-slate-900 leading-tight mb-12 relative z-10">
                    "O Ministrando mudou a forma como me preparo para o altar. Mais tempo para oração, menos tempo em pastas e cadernos."
                 </h3>
                 <div className="flex items-center gap-6">
                    <div className="w-20 h-20 bg-slate-200 rounded-[2rem]" />
                    <div>
                       <p className="font-black text-2xl text-slate-900 leading-none">Pr. André Silveira</p>
                       <p className="text-slate-400 text-sm font-bold uppercase tracking-[0.3em] mt-3">Ministério Caminho de Fé</p>
                    </div>
                 </div>
              </div>
              
              <div className="flex-1 grid grid-cols-2 gap-4 md:gap-8 w-full">
                 <div className="bg-white p-8 md:p-16 rounded-[2.5rem] md:rounded-[3.5rem] shadow-2xl border border-slate-100 text-center space-y-4 md:space-y-6 hover:-translate-y-3 transition-transform duration-500 overflow-hidden relative group">
                    <div className="absolute inset-0 bg-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="text-4xl sm:text-5xl md:text-7xl font-black text-indigo-600 tracking-tighter transition-transform group-hover:scale-110 duration-500">500+</div>
                    <p className="text-slate-400 text-[8px] md:text-[10px] font-black uppercase tracking-[0.4em] relative z-10">Pastores Ativos</p>
                 </div>
                 <div className="bg-slate-900 p-8 md:p-16 rounded-[2.5rem] md:rounded-[3.5rem] shadow-2xl text-center space-y-4 md:space-y-6 mt-8 md:mt-12 hover:-translate-y-3 transition-transform duration-500 overflow-hidden relative group">
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="text-4xl sm:text-5xl md:text-7xl font-black text-indigo-400 tracking-tighter transition-transform group-hover:scale-110 duration-500">98%</div>
                    <p className="text-indigo-400/60 text-[8px] md:text-[10px] font-black uppercase tracking-[0.4em] relative z-10">Satisfação Geral</p>
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-48 bg-white overflow-hidden relative">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-32">
             <h2 className="text-5xl md:text-8xl font-serif italic text-slate-900 mb-8">Dúvidas Frequentes</h2>
             <p className="text-2xl text-slate-500 font-medium opacity-80 italic">Tudo o que você precisa saber.</p>
          </div>
          
          <div className="space-y-8">
             {[
               { q: 'Como recebo o acesso à minha conta?', a: 'Imediatamente após a confirmação do pagamento, sua conta será migrada para o status Premium automaticamente.' },
               { q: 'Posso usar em vários dispositivos?', a: 'Sim! O Ministrando a Palavra funciona no seu computador, tablet e celular de forma sincronizada.' },
               { q: 'A renovação é automática?', a: 'A assinatura é anual. Você receberá um aviso 7 dias antes da renovação para decidir se deseja continuar.' },
               { q: 'E se eu não gostar?', a: 'Oferecemos 7 dias de garantia total. Se não estiver satisfeito, devolvemos seu investimento integralmente.' }
             ].map((item, idx) => (
               <motion.div 
                 key={idx}
                 initial={{ opacity: 0, y: 15 }}
                 whileInView={{ opacity: 1, y: 0 }}
                 viewport={{ once: true }}
                 transition={{ delay: idx * 0.1 }}
                 className="p-12 bg-slate-50 rounded-[3rem] border border-slate-100 hover:border-indigo-200 hover:bg-white hover:shadow-xl transition-all cursor-default group"
               >
                  <h4 className="font-bold text-2xl text-slate-900 mb-6 group-hover:text-indigo-600 transition-colors tracking-tight">{item.q}</h4>
                  <p className="text-slate-500 leading-relaxed text-xl opacity-90">{item.a}</p>
               </motion.div>
             ))}
          </div>
          
          <div className="mt-32 text-center p-16 bg-indigo-600 rounded-[4rem] text-white space-y-10 shadow-[0_40px_100px_-20px_rgba(79,70,229,0.3)] relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-[100px] -m-48 transition-transform group-hover:scale-125 duration-1000" />
             <h3 className="text-4xl md:text-5xl font-serif italic relative z-10">Ainda tem alguma pergunta?</h3>
             <p className="text-xl opacity-80 max-w-xl mx-auto relative z-10">Nossa equipe está pronta para te atender agora mesmo e tirar qualquer dúvida.</p>
             <div className="flex flex-col sm:flex-row gap-6 justify-center relative z-10">
                <a href="mailto:suporte@ministrandoapalavra.com.br" className="bg-white text-indigo-600 px-12 py-6 rounded-3xl font-black uppercase text-xs tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4 shadow-xl">
                   Enviar E-mail <MessageSquare size={20} />
                </a>
                <a href="https://wa.me/5567992790901" target="_blank" rel="noreferrer" className="bg-green-500 text-white px-12 py-6 rounded-3xl font-black uppercase text-xs tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4 shadow-xl">
                   WhatsApp <MousePointer2 size={20} />
                </a>
             </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-50 py-32 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-24">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-600/20">
              <BookOpen className="text-white" size={28} />
            </div>
            <div className="flex flex-col">
              <span className="font-serif italic text-3xl text-slate-900">Ministrando a Palavra</span>
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.5em] mt-2 ml-1 opacity-60">Soli Deo Gloria</span>
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center gap-12 text-slate-400 text-[10px] font-black uppercase tracking-[0.4em]">
             <a href="#" className="hover:text-indigo-600 transition-colors">Privacidade</a>
             <a href="#" className="hover:text-indigo-600 transition-colors">Termos de Uso</a>
             <a href="mailto:suporte@ministrandoapalavra.com.br" className="hover:text-indigo-600 transition-colors">Suporte</a>
          </div>

          <div className="text-right space-y-3">
             <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em] opacity-60">
                © 2026 • Design de Excelência
             </p>
             <div className="h-0.5 w-12 bg-indigo-100 ml-auto" />
          </div>
        </div>
      </footer>
    </div>
  );
}
