import { CheckCircle2, Sparkles, BookOpen, Mic2, Calendar, ShieldCheck, ArrowRight, Star, Quote, Zap, Globe, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';

export default function SalesLandingPage({ onLogin }: { onLogin: () => void }) {
  const { t } = useLanguage();
  const CHECKOUT_URL = 'https://pay.cakto.com.br/neg39tz_876938';

  const features = [
    {
      icon: Sparkles,
      title: 'IA Assistente Teológica',
      description: 'Gere esboços profundos e estruturados em segundos. Sua inspiração auxiliada por tecnologia de ponta.'
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
      description: 'Dúvidas ou problemas? Fale diretamente com quem entende do seu ministério.'
    },
    {
      icon: ShieldCheck,
      title: 'Acesso Premium Vitalício (1 Ano)',
      description: 'Todas as ferramentas desbloqueadas por um preço simbólico de lançamento.'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 overflow-x-hidden">
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-200/30 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-amber-100/30 blur-[120px] rounded-full" />
      </div>

      {/* Header/Nav */}
      <nav className="relative z-50 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <BookOpen className="text-white" size={20} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-serif italic text-2xl text-slate-900 tracking-tight">Ministrando</span>
            <span className="font-bold tracking-[0.3em] text-[9px] text-indigo-600 uppercase mt-0.5">a palavra</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={onLogin}
            className="text-slate-600 font-bold text-sm hover:text-indigo-600 transition-colors px-4 py-2"
          >
            Entrar
          </button>
          <a 
            href={CHECKOUT_URL}
            className="hidden md:flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-full font-bold text-sm hover:bg-indigo-500 transition-all shadow-md active:scale-95"
          >
            Começar Agora
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative z-10 pt-16 pb-24 px-6 max-w-7xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest mb-8 border border-indigo-100">
            <Zap size={14} className="fill-indigo-700" /> Oportunidade Exclusiva para Pastores e Ministros
          </div>
          <h1 className="text-5xl md:text-7xl font-serif italic text-slate-900 leading-tight mb-8 drop-shadow-sm max-w-4xl mx-auto">
            Potencialize seu Ministério com <span className="text-indigo-600 not-italic font-sans font-black">Inteligência Artificial</span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-600 max-w-2xl mx-auto mb-12 font-medium leading-relaxed">
            A ferramenta definitiva para pastores e professores da Palavra criarem esboços estruturados, organizarem sua agenda e pregarem com excelência.
          </p>
          
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <a 
              href={CHECKOUT_URL}
              className="w-full md:w-auto bg-indigo-600 text-white px-10 py-5 rounded-2xl font-black uppercase text-sm tracking-widest hover:bg-indigo-500 transition-all shadow-2xl shadow-indigo-600/30 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95"
            >
              Assinar Premium por R$ 19,90 <ArrowRight size={18} />
            </a>
            <button 
              onClick={onLogin}
              className="w-full md:w-auto bg-white text-indigo-600 border-2 border-indigo-100 px-10 py-5 rounded-2xl font-black uppercase text-sm tracking-widest hover:border-indigo-600 transition-all flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95"
            >
              Teste Grátis por 3 Dias
            </button>
            <p className="text-slate-400 text-sm font-medium italic hidden lg:block">Menos de R$ 1,70 por mês!</p>
          </div>
        </motion.div>

        {/* Enhanced Visual Mockup */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="mt-20 relative max-w-5xl mx-auto"
        >
          <div className="bg-white rounded-[2.5rem] shadow-[0_45px_120px_-30px_rgba(0,0,0,0.2)] border border-slate-200 overflow-hidden aspect-[16/9] flex flex-col relative group">
             {/* Browser Bar */}
             <div className="h-12 bg-slate-50 border-b border-slate-100 flex items-center px-6 gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-slate-200" />
                  <div className="w-3 h-3 rounded-full bg-slate-200" />
                  <div className="w-3 h-3 rounded-full bg-slate-200" />
                </div>
                <div className="ml-6 h-6 bg-white border border-slate-200 rounded-lg flex items-center px-3 w-72">
                  <Globe size={10} className="text-slate-300 mr-2" />
                  <div className="h-1 w-full bg-slate-100 rounded-full" />
                </div>
             </div>
             
             {/* Content Mockup */}
             <div className="flex-1 flex bg-slate-50 relative overflow-hidden">
                {/* Sidebar */}
                <div className="w-20 bg-indigo-900 flex flex-col items-center py-8 gap-6">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                      <BookOpen size={20} />
                    </div>
                    {[1,2,3,4].map(i => (
                      <div key={i} className="w-10 h-10 rounded-xl bg-indigo-800/50 flex items-center justify-center text-indigo-300">
                        <div className="w-5 h-5 rounded bg-current opacity-20" />
                      </div>
                    ))}
                    <div className="mt-auto w-10 h-10 rounded-full bg-indigo-800" />
                </div>

                {/* Main View */}
                <div className="flex-1 p-10 overflow-hidden">
                   <div className="max-w-4xl mx-auto h-full flex flex-col gap-8">
                      {/* Dashboard Header */}
                      <div className="flex justify-between items-end">
                         <div className="space-y-2">
                            <div className="h-8 bg-slate-200 rounded-lg w-48" />
                            <div className="h-4 bg-slate-100 rounded-lg w-32" />
                         </div>
                         <div className="h-10 bg-indigo-600 rounded-xl w-32 shadow-lg shadow-indigo-600/20" />
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-4 gap-6">
                         {[1,2,3,4].map(i => (
                           <div key={i} className="h-28 bg-white rounded-3xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between">
                              <div className="w-8 h-8 rounded-xl bg-indigo-50" />
                              <div className="space-y-2">
                                <div className="h-3 bg-slate-100 rounded-full w-full" />
                                <div className="h-5 bg-slate-200 rounded-full w-1/2" />
                              </div>
                           </div>
                         ))}
                      </div>

                      {/* AI Component Mockup */}
                      <div className="flex-1 bg-white rounded-[2rem] shadow-xl border border-indigo-100 p-8 flex flex-col animate-pulse">
                          <div className="flex items-center gap-3 mb-8">
                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                              <Sparkles size={20} />
                            </div>
                            <div className="h-4 bg-indigo-50 rounded-full w-32" />
                          </div>
                          <div className="space-y-4">
                              <div className="h-4 bg-slate-50 rounded-full w-full" />
                              <div className="h-4 bg-slate-50 rounded-full w-full" />
                              <div className="h-4 bg-slate-50 rounded-full w-3/4" />
                          </div>
                          <div className="mt-auto border-t border-slate-50 pt-6 flex gap-4">
                             <div className="h-12 bg-slate-50 rounded-2xl flex-1" />
                             <div className="w-12 h-12 bg-indigo-600 rounded-2xl" />
                          </div>
                      </div>
                   </div>
                </div>
             </div>

             {/* Overlays to make it look active */}
             <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-transparent pointer-events-none" />
          </div>

          {/* Floating Feature Accents */}
          <div className="absolute -top-10 -left-10 bg-white p-6 rounded-3xl shadow-2xl border border-slate-100 hidden lg:flex items-center gap-4 animate-bounce">
             <div className="w-12 h-12 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center">
                <CheckCircle2 size={24} />
             </div>
             <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Esboço Gerado</p>
                <p className="font-bold text-slate-900">Em 3.2 segundos</p>
             </div>
          </div>

          <div className="absolute top-[20%] -right-12 bg-white p-6 rounded-3xl shadow-2xl border border-slate-100 hidden lg:flex items-center gap-4 transform -rotate-3">
             <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
                <Mic2 size={24} />
             </div>
             <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Modo Púlpito</p>
                <p className="font-bold text-slate-900">Ativado</p>
             </div>
          </div>
        </motion.div>
      </header>


      {/* Platform Preview Section */}
      <section className="py-32 px-6 bg-slate-50 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-20 mb-32">
             <div className="flex-1 space-y-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-[0.2em]">
                   IA Teológica
                </div>
                <h2 className="text-4xl md:text-6xl font-serif italic text-slate-900 leading-tight">
                  Sua ferramenta para a Palavra
                </h2>
                <p className="text-xl text-slate-500 leading-relaxed">
                  Imagine um assistente que conhece profundamente as escrituras, capaz de ajudar você a estruturar mensagens impactantes em tempo recorde.
                </p>
                <ul className="space-y-4">
                   {['Análise exegética instantânea', 'Tradução de termos originais', 'Sugestão de ilustrações poderosas'].map(item => (
                     <li key={item} className="flex items-center gap-3 font-bold text-slate-700">
                        <CheckCircle2 className="text-green-500" size={20} /> {item}
                     </li>
                   ))}
                </ul>
             </div>
             <div className="flex-1 relative">
                <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 p-2 overflow-hidden aspect-[4/3] relative">
                   <div className="absolute inset-0 bg-slate-50 flex flex-col p-8 gap-4">
                      <div className="flex justify-end">
                         <div className="bg-indigo-600 text-white p-4 rounded-2xl rounded-tr-none text-sm max-w-[80%] font-medium">
                            Gere um esboço sobre a parábola do semeador focando em perseverança.
                         </div>
                      </div>
                      <div className="flex justify-start">
                         <div className="bg-white border border-slate-200 text-slate-700 p-6 rounded-2xl rounded-tl-none text-sm max-w-[90%] space-y-4 shadow-sm">
                            <div className="font-black text-indigo-600 uppercase text-[10px] tracking-widest">Esboço Estruturado</div>
                            <div className="h-4 bg-slate-100 rounded-full w-full" />
                            <div className="h-4 bg-slate-100 rounded-full w-3/4" />
                            <div className="pt-4 space-y-2">
                               <div className="flex gap-2">
                                  <div className="w-4 h-4 bg-indigo-50 rounded" />
                                  <div className="h-2 bg-slate-100 rounded-full w-1/2" />
                               </div>
                               <div className="flex gap-2">
                                  <div className="w-4 h-4 bg-indigo-50 rounded" />
                                  <div className="h-2 bg-slate-100 rounded-full w-1/3" />
                               </div>
                            </div>
                         </div>
                      </div>
                      <div className="flex justify-end mt-4">
                         <div className="h-10 bg-indigo-50 rounded-full w-32 border border-indigo-100 animate-pulse" />
                      </div>
                   </div>
                </div>
                {/* Visual Flair */}
                <div className="absolute -bottom-8 -left-8 w-48 h-48 bg-indigo-600/10 blur-3xl rounded-full" />
             </div>
          </div>

          <div className="flex flex-col md:flex-row-reverse items-center gap-20">
             <div className="flex-1 space-y-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-[0.2em]">
                   Modo Púlpito
                </div>
                <h2 className="text-4xl md:text-6xl font-serif italic text-slate-900 leading-tight">
                  Pregue com <span className="text-amber-600 font-sans font-black not-italic">Foco Total</span>
                </h2>
                <p className="text-xl text-slate-500 leading-relaxed">
                  Uma interface otimizada para o momento mais importante: a entrega da mensagem. Sem distrações, com tudo o que você precisa.
                </p>

             </div>
             <div className="flex-1 relative">
                <div className="bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-800 p-6 overflow-hidden aspect-[4/3] flex flex-col gap-6">
                   <div className="flex justify-between items-center text-slate-400 border-b border-slate-800 pb-4">
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500" /> Ao Vivo</div>
                      <div className="text-sm">Parábola do Semeador</div>
                   </div>
                   <div className="space-y-6 text-slate-200">
                      <h3 className="text-3xl font-serif italic">1. O Coração Duro</h3>
                      <p className="text-lg leading-relaxed text-slate-400">"Semear à beira do caminho é quando a Palavra não penetra..."</p>
                      <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-300 italic">
                         Referência: Lucas 8:5
                      </div>
                      <div className="h-4 bg-white/5 rounded-full w-full" />
                      <div className="h-4 bg-white/5 rounded-full w-3/4" />
                   </div>
                </div>
                <div className="absolute -top-8 -right-8 w-48 h-48 bg-amber-500/10 blur-3xl rounded-full" />
             </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="bg-white py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 mb-6 tracking-tight">O que você recebe no <span className="text-indigo-600">Premium</span></h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">Tudo o que você precisa para uma jornada ministerial produtiva, intuitiva e abençoada.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <motion.div
                key={idx}
                whileHover={{ y: -10 }}
                className="p-8 rounded-[2.5rem] bg-slate-50 border border-slate-100 hover:border-indigo-200 transition-all group"
              >
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-500">
                  <feature.icon size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-500 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing / Offer */}
      <section className="py-32 px-6 bg-slate-900 text-white relative overflow-hidden">
        {/* Animated Orbs */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-amber-500/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10 text-center">
          <h2 className="text-4xl md:text-6xl font-black mb-12 tracking-tighter">Oferta <span className="text-indigo-400">Irresistível</span></h2>
          
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[3rem] p-12 md:p-20 shadow-2xl inline-block w-full max-w-3xl">
            <p className="text-indigo-400 font-black uppercase tracking-[0.3em] mb-6">Plano Anual Premium</p>
            
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-10">
              <div className="relative">
                <span className="text-slate-500 text-2xl line-through decoration-red-500 font-bold">R$ 147,00</span>
                <div className="absolute -top-4 -left-4 bg-red-500 text-[10px] font-black px-2 py-1 rounded">PROMOÇÃO</div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-slate-400 text-2xl font-serif italic">por apenas</span>
                <span className="text-7xl md:text-9xl font-black tracking-tighter text-white">19,90</span>
                <span className="text-slate-400 font-bold uppercase text-xs tracking-widest">/ ano</span>
              </div>
            </div>

            <p className="text-slate-400 text-lg mb-12 font-medium max-w-md mx-auto">
              Garanta seu acesso premium e todas as futuras atualizações por menos do que o preço de um café.
            </p>

            <a 
              href={CHECKOUT_URL}
              className="w-full bg-indigo-500 text-white py-6 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-indigo-400 transition-all shadow-xl shadow-indigo-500/20 block text-lg mb-6"
            >
              Ativar Minha Conta Agora
            </a>

            <button 
              onClick={onLogin}
              className="w-full bg-white/10 hover:bg-white/20 text-white py-4 rounded-2xl font-bold border border-white/20 transition-all mb-8"
            >
              Ou comece com um teste de 3 dias
            </button>
            
            <div className="flex items-center justify-center gap-8 text-slate-500">
               <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest"><ShieldCheck size={16} /> Compra Segura</div>
               <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest"><CheckCircle2 size={16} /> 7 Dias de Garantia</div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial / Social Proof */}
      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-12 items-center">
          <div className="flex-1 space-y-8">
            <Quote className="text-indigo-200 fill-indigo-200" size={80} />
            <h3 className="text-3xl md:text-5xl font-serif italic text-slate-800 leading-tight">
              "Nunca foi tão fácil organizar meus sermões e encontrar inspiração bíblica para a igreja."
            </h3>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-200 rounded-full" />
              <div>
                <p className="font-bold text-slate-900">Pr. André Silveira</p>
                <p className="text-slate-500 text-sm">Ministério Caminho de Fé</p>
              </div>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-4">
             <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center text-center">
                <p className="text-4xl font-black text-indigo-600 mb-2">500+</p>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Usuários Ativos</p>
             </div>
             <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center text-center mt-8">
                <p className="text-4xl font-black text-amber-500 mb-2">98%</p>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Satisfação</p>
             </div>
             <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center text-center col-span-2">
                <div className="flex gap-1 mb-4">
                   {[1,2,3,4,5].map(i => <Star key={i} size={16} className="fill-indigo-500 text-indigo-500" />)}
                </div>
                <p className="text-slate-900 font-bold">A ferramenta número #1 para ministros brasileiros.</p>
             </div>
          </div>
        </div>
      </section>

      {/* FAQ Simple */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-12">Perguntas Frequentes</h2>
          <div className="space-y-6">
             <div className="p-6 bg-white rounded-2xl border border-slate-100">
                <h4 className="font-bold text-lg mb-2">Como recebo o acesso?</h4>
                <p className="text-slate-500">Imediatamente após a confirmação do pagamento, sua conta será migrada para o status Premium automaticamente.</p>
             </div>
             <div className="p-6 bg-white rounded-2xl border border-slate-100">
                <h4 className="font-bold text-lg mb-2">Posso usar em vários dispositivos?</h4>
                <p className="text-slate-500">Sim! O Ministrando a Palavra funciona no seu computador, tablet e celular.</p>
             </div>
             <div className="p-6 bg-white rounded-2xl border border-slate-100">
                <h4 className="font-bold text-lg mb-2">A renovação é automática?</h4>
                <p className="text-slate-500">A assinatura é anual. Você receberá um aviso antes da renovação para decidir se deseja continuar.</p>
             </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-50 py-12 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
              <BookOpen className="text-white" size={14} />
            </div>
            <span className="font-serif italic text-xl text-slate-900">Ministrando a Palavra</span>
          </div>
          
          <div className="flex gap-8 text-slate-400 text-xs font-bold uppercase tracking-widest">
             <a href="#" className="hover:text-indigo-600">Privacidade</a>
             <a href="#" className="hover:text-indigo-600">Termos</a>
             <a href="#" className="hover:text-indigo-600">Suporte</a>
          </div>

          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">
            © 2026 • Todos os direitos reservados
          </p>
        </div>
      </footer>

    </div>
  );
}
