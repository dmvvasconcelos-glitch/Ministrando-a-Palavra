import { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  Search, 
  MapPin, 
  Smartphone, 
  ShieldCheck, 
  ShieldAlert, 
  Sparkles,
  Shield,
  Crown,
  Eye,
  Mail,
  User as UserIcon,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpDown,
  MessageSquare,
  Send,
  CornerDownRight,
  ChevronDown,
  Archive,
  Trash2,
  UserPlus,
  Download,
  Calendar,
  CreditCard,
  Building2,
  X,
  Copy,
  Terminal,
  Settings,
  Activity,
  Unlock,
  Database,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, deleteDoc, setDoc, deleteField, limit, where, getDocs } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile, ContactMessage } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';

type AdminTab = 'users' | 'messages';

export default function AdminDashboard() {
  console.log('AdminDashboard: Mounting...');
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'trial' | 'active' | 'expired'>('all');
  const [msgStatusFilter, setMsgStatusFilter] = useState<'all' | 'pending' | 'replied'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [sortField, setSortField] = useState<keyof UserProfile>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [newMsgToast, setNewMsgToast] = useState<{ show: boolean, name: string } | null>(null);
  const isFirstLoad = useRef(true);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPlan, setNewUserPlan] = useState<'trial' | 'active'>('trial');
  const [trialDaysConfig, setTrialDaysConfig] = useState(3); // Default trial duration (changed from 7 to 3)
  
  // Reply State
  const [replyingMessage, setReplyingMessage] = useState<ContactMessage | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [showIntegrationInfo, setShowIntegrationInfo] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [manualUpgradeEmail, setManualUpgradeEmail] = useState('');
  const [isUpgrading, setIsUpgrading] = useState(false);

  const handleManualUpgrade = async () => {
    if (!manualUpgradeEmail || !manualUpgradeEmail.includes('@')) {
      alert('Por favor, insira um e-mail válido.');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja promover o e-mail ${manualUpgradeEmail} para PREMIUM manualmente?`)) return;

    setIsUpgrading(true);
    try {
      const emailLower = manualUpgradeEmail.trim().toLowerCase();
      // Search for user by email to avoid duplicates
      const q = query(collection(db, 'users'), where('email', '==', emailLower), limit(1));
      const snap = await getDocs(q);
      
      const now = serverTimestamp();
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      
      const updates = {
        role: 'premium' as const,
        isPremium: true,
        subscriptionStatus: 'active' as const,
        subscriptionExpiresAt: expiresAt,
        paidExpiresAt: expiresAt,
        paidAt: now,
        updatedAt: now
      };

      if (!snap.empty) {
        await updateDoc(doc(db, 'users', snap.docs[0].id), updates);
        alert(`Sucesso! O usuário ${emailLower} foi promovido para PREMIUM.`);
      } else {
        // Create a predictive placeholder that the app will merge on first login
        const placeholderId = `manual_${emailLower.replace(/[^a-z0-9]/g, '_')}`;
        await setDoc(doc(db, 'users', placeholderId), {
          uid: placeholderId,
          email: emailLower,
          displayName: emailLower.split('@')[0],
          ...updates,
          createdAt: now
        });
        alert(`O usuário ${emailLower} ainda não possui conta, mas já liberamos o acesso Premium preventivamente! Quando ele logar pela primeira vez com este e-mail, já terá acesso total.`);
      }
      setManualUpgradeEmail('');
    } catch (err) {
      console.error('Manual upgrade error:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'users/manual-upgrade');
      alert('Erro ao liberar acesso premium. Verifique os logs do console para mais detalhes.');
    } finally {
      setIsUpgrading(false);
    }
  };

  const [logsError, setLogsError] = useState<string | null>(null);

  const webhookUrl = `${window.location.origin}/api/webhooks/cakto`;

  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const testWebhookConnectivity = async () => {
    setIsTestingWebhook(true);
    console.log('AdminDashboard: Testing webhook connectivity...');
    try {
      const res = await fetch('/api/webhooks/cakto');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      console.log('AdminDashboard: Webhook test result:', data);
      alert('Conectividade (GET): ' + (data.status === 'ok' ? 'OK! Endpoint alcançável.' : 'Erro: ' + JSON.stringify(data)));
    } catch (e) {
      console.error('AdminDashboard: Webhook test failed:', e);
      alert('Falha ao conectar (GET) com o endpoint do servidor: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const sendTestWebhook = async () => {
    if (!window.confirm('Isso enviará um payload de teste POST para o servidor. Deseja prosseguir?')) return;
    
    setIsSendingTest(true);
    console.log('AdminDashboard: Sending test webhook POST...');
    try {
      const res = await fetch('/api/webhooks/cakto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event: 'venda_aprovada',
          status: 'paid',
          email: 'teste_webhook@example.com',
          external_id: 'test_user_id',
          is_test: true,
          venda: {
             status: 'pago',
             cliente: { email: 'teste_webhook@example.com' }
          }
        })
      });
      
      const data = await res.json();
      console.log('AdminDashboard: Webhook POST result:', data);
      alert('Resultado (POST): ' + JSON.stringify(data, null, 2));
      setShowLogs(true);
    } catch (e) {
      console.error('AdminDashboard: Webhook POST failed:', e);
      alert('Falha ao enviar POST para o servidor: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsSendingTest(false);
    }
  };

  const exportToCSV = () => {
    try {
      const headers = [
        'Nome',
        'Email',
        'Plano',
        'Status',
        'Expira Em',
        'Dias de Teste',
        'Ultimo Acesso',
        'Denominação',
        'Pastor Presidente',
        'Cidade',
        'Estado',
        'IP',
        'Dispositivo',
        'Navegador'
      ];

      const csvRows = users.map(user => {
        const status = user.role === 'admin' ? 'Administrador' : (user.isPremium ? 'PAGO' : (getUserStatus(user) === 'active' ? 'Ativo' : (getUserStatus(user) === 'expired' ? 'Expirado' : 'Teste')));
        const expiresAt = user.role === 'admin' ? 'Infinito' : (user.subscriptionExpiresAt || user.trialExpiresAt ? format(safeToDate(user.subscriptionExpiresAt || user.trialExpiresAt), 'dd/MM/yyyy') : '-');
        const lastLogin = user.lastLogin ? format(safeToDate(user.lastLogin), 'dd/MM/yyyy HH:mm') : '-';
        
        return [
          `"${user.displayName || user.fullName || ''}"`,
          `"${user.email || ''}"`,
          `"${user.role === 'admin' ? 'Admin' : (user.subscriptionStatus || 'trial')}"`,
          `"${status}"`,
          `"${expiresAt}"`,
          `"${getTrialDays(user)}"`,
          `"${lastLogin}"`,
          `"${user.denomination || ''}"`,
          `"${user.presidentPastor || ''}"`,
          `"${user.locationInfo?.city || ''}"`,
          `"${user.locationInfo?.state || ''}"`,
          `"${user.locationInfo?.ip || ''}"`,
          `"${user.deviceInfo?.os || ''}"`,
          `"${user.deviceInfo?.browser || ''}"`
        ].join(',');
      });

      const csvContent = [headers.join(','), ...csvRows].join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `usuarios_ministrando_a_palavra_${format(new Date(), 'dd_MM_yyyy')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error exporting CSV:', err);
      alert('Erro ao exportar CSV.');
    }
  };

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  
  const locale = language === 'pt' ? ptBR : language === 'es' ? es : enUS;
  const isRequestingPerm = useRef(false);

  useEffect(() => {
    if (Notification.permission === 'default' && !isRequestingPerm.current) {
      isRequestingPerm.current = true;
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    // Users Listener
    const qUsers = query(
      collection(db, 'users'),
      orderBy(sortField as string, sortOrder)
    );

    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      console.log('AdminDashboard: Users snapshot received, size:', snapshot.size);
      const uList = snapshot.docs.map(doc => ({ ...doc.data({ serverTimestamps: 'estimate' }), uid: doc.id } as UserProfile));
      setUsers(uList);
    }, (error) => {
      console.error('AdminDashboard: Users snapshot error:', error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    // Messages Listener
    const qMessages = query(
      collection(db, 'contactMessages'),
      orderBy('createdAt', 'desc')
    );

    const unsubMessages = onSnapshot(qMessages, (snapshot) => {
      console.log('AdminDashboard: Messages snapshot received, size:', snapshot.size);
      const mList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContactMessage));
      
      // Check for new pending messages to notify
      if (!isFirstLoad.current) {
        const hasNewPending = snapshot.docChanges().some(change => 
          change.type === 'added' && 
          (change.doc.data() as ContactMessage).status === 'pending'
        );
        
        if (hasNewPending) {
          const latestDoc = snapshot.docChanges().find(ch => ch.type === 'added')?.doc.data() as ContactMessage;
          setNewMsgToast({ show: true, name: latestDoc?.userName || 'Alguém' });
          
          // Browser Notification
          if (Notification.permission === 'granted') {
            new Notification('Nova Mensagem', {
              body: `${latestDoc?.userName || 'Usuário'} enviou uma nova mensagem de contato.`,
              icon: '/vite.svg'
            });
          }
          
          // Sound effect (optional, browser might block)
          try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play().catch(() => {});
          } catch (e) {}
 
          setTimeout(() => setNewMsgToast(null), 5000);
        }
      }
      
      setMessages(mList);
      setLoading(false);
      isFirstLoad.current = false;
    }, (error) => {
      console.error('AdminDashboard: Messages snapshot error:', error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'contactMessages');
    });

    return () => {
      unsubUsers();
      unsubMessages();
    };
  }, [sortField, sortOrder]);

  useEffect(() => {
    if (showLogs) {
      setLogsError(null);
      const q = query(collection(db, 'webhook_logs'), orderBy('receivedAt', 'desc'), limit(15));
      return onSnapshot(q, (snapshot) => {
        setWebhookLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (err) => {
        console.error('AdminDashboard: Webhook logs error:', err);
        setLogsError(err.message);
        handleFirestoreError(err, OperationType.LIST, 'webhook_logs');
      });
    }
  }, [showLogs]);

  const toggleSort = (field: keyof UserProfile) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const parseDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date(dateStr);
  };

  const safeToDate = (field: any) => {
    if (!field) return new Date();
    if (field.toDate) return field.toDate();
    if (field instanceof Date) return field;
    if (typeof field === 'number') return new Date(field);
    if (typeof field === 'string') return new Date(field);
    return new Date();
  };

  const getTimeRemaining = (user: UserProfile) => {
    if (user.role === 'admin') return '∞';
    // If it's a fixed admin by email like dmv.vasconcelos@gmail.com, show 'Infinito'
    if (user.email?.toLowerCase() === 'dmv.vasconcelos@gmail.com') return '∞';
    
    const expiryRef = user.subscriptionExpiresAt || user.trialExpiresAt;
    if (!expiryRef) return '-';
    try {
      const date = safeToDate(expiryRef);
      const now = new Date();
      const diff = date.getTime() - now.getTime();
      
      if (diff <= 0) return t('expired') || 'Expirado';

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) return `${days}${t('daysShort')} ${hours}${t('hoursShort')}`;
      if (hours > 0) return `${hours}${t('hoursShort')} ${minutes}${t('minutesShort')}`;
      return `${minutes}${t('minutesShort')}`;
    } catch (e) {
      return '-';
    }
  };

  const getTrialDays = (user: UserProfile) => {
    if (user.role === 'admin') return 0;
    return user.trialDuration || 3;
  };

  const isUserOnline = (user: UserProfile) => {
    const lastActive = user.lastActiveAt || user.updatedAt || user.lastLogin;
    if (!lastActive) return false;
    
    try {
      const activeDate = lastActive.toDate ? lastActive.toDate() : new Date(lastActive);
      const now = new Date();
      // Consider online if active in the last 8 minutes (heartbeat is 5min)
      return (now.getTime() - activeDate.getTime()) < 8 * 60 * 1000;
    } catch (e) {
      return false;
    }
  };

  const handleUpdateRole = async (uid: string, role: 'admin' | 'user') => {
    if (!uid) {
      alert('ID do usuário não encontrado.');
      return;
    }
    
    setIsProcessing(uid);
    try {
      console.log(`Updating role: user=${uid}, role=${role}`);
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        role: role,
        updatedAt: serverTimestamp()
      });
      alert('Nível de acesso atualizado com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
      alert('Erro ao atualizar nível de acesso. Verifique suas permissões.');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleUpdateUserPlan = async (uid: string, plan: 'trial' | 'active', days?: number) => {
    if (!uid) {
      alert('ID do usuário não encontrado.');
      return;
    }

    setIsProcessing(uid);
    try {
      console.log(`Updating plan: user=${uid}, plan=${plan}, days=${days}`);
      const userRef = doc(db, 'users', uid);
      const now = new Date();
      const expiresAt = new Date();
      
      const trialDays = days || trialDaysConfig || 3;
      
      if (plan === 'trial') {
        expiresAt.setDate(now.getDate() + trialDays); 
      } else {
        expiresAt.setFullYear(now.getFullYear() + 1); // 1 year
      }

      const updates: any = {
        subscriptionStatus: plan,
        subscriptionExpiresAt: expiresAt,
        updatedAt: serverTimestamp()
      };

      if (plan === 'trial') {
        updates.trialExpiresAt = expiresAt;
        updates.trialDuration = trialDays;
        updates.role = 'user';
        updates.isPremium = false;
        updates.subscriptionStatus = 'trial';
      } else {
        updates.paidExpiresAt = expiresAt;
        updates.role = 'premium';
        updates.isPremium = true;
        updates.trialExpiresAt = null;
        updates.subscriptionStatus = 'active';
      }

      await updateDoc(userRef, updates);
      alert('Plano do usuário atualizado com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
      alert('Erro ao atualizar plano. Verifique suas permissões.');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleAddUser = async () => {
    if (!newUserEmail.trim()) return;
    try {
      const emailLower = newUserEmail.trim().toLowerCase();
      
      // Check if user already exists
      const q = query(collection(db, 'users'), where('email', '==', emailLower), limit(1));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        alert('Este e-mail já está cadastrado no sistema.');
        return;
      }

      const placeholderId = `manual_${emailLower.replace(/[^a-z0-9]/g, '_')}`;
      const userRef = doc(db, 'users', placeholderId);
      const now = serverTimestamp();
      const expiresAt = new Date();
      
      if (newUserPlan === 'trial') {
        expiresAt.setDate(new Date().getDate() + trialDaysConfig);
      } else {
        expiresAt.setFullYear(new Date().getFullYear() + 1);
      }

      const saveContent: any = {
        uid: placeholderId,
        email: emailLower,
        displayName: emailLower.split('@')[0],
        subscriptionStatus: newUserPlan,
        subscriptionExpiresAt: expiresAt,
        role: newUserPlan === 'active' ? 'premium' : 'user',
        isPremium: newUserPlan === 'active',
        updatedAt: now,
        createdAt: now
      };

      if (newUserPlan === 'trial') {
        saveContent.trialExpiresAt = expiresAt;
        saveContent.trialDuration = trialDaysConfig;
      } else {
        saveContent.paidExpiresAt = expiresAt;
      }

      await setDoc(userRef, saveContent);
      alert('Usuário adicionado com sucesso!');
      setShowAddUserModal(false);
      setNewUserEmail('');
    } catch (err) {
      console.error('Error adding user:', err);
      handleFirestoreError(err, OperationType.WRITE, 'users');
      alert('Ocorreu um erro ao adicionar o usuário.');
    }
  };

  const handleUpdateMessage = async (msgId: string, updates: Partial<ContactMessage>) => {
    try {
      const finalUpdates = { ...updates };
      if (updates.archived === true) {
        finalUpdates.archivedBy = 'admin';
      } else if (updates.archived === false) {
        finalUpdates.archivedBy = deleteField() as any;
      }
      await updateDoc(doc(db, 'contactMessages', msgId), finalUpdates);
      alert('Mensagem atualizada com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `contactMessages/${msgId}`);
      alert('Erro ao atualizar mensagem.');
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!window.confirm(t('confirmDeleteMessage') || 'Deseja excluir permanentemente?')) return;
    try {
      await deleteDoc(doc(db, 'contactMessages', msgId));
      alert('Mensagem removida com sucesso.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `contactMessages/${msgId}`);
      alert('Erro ao remover mensagem.');
    }
  };

  const handleSendReply = async () => {
    if (!replyingMessage || !replyText.trim()) return;
    setIsSendingReply(true);
    try {
      const msgRef = doc(db, 'contactMessages', replyingMessage.id);
      await updateDoc(msgRef, {
        replyMessage: replyText,
        repliedAt: serverTimestamp(),
        status: 'replied'
      });
      setReplyingMessage(null);
      setReplyText('');
      alert('Resposta enviada com sucesso!');
    } catch (err) {
      console.error('Error replying message:', err);
      handleFirestoreError(err, OperationType.UPDATE, `contactMessages/${replyingMessage.id}`);
      alert('Erro ao enviar resposta.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleDeleteUser = async (uid: string, email: string) => {
    if (!uid) {
      alert('ID do usuário não encontrado.');
      return;
    }
    
    if (!window.confirm(`AVISO CRÍTICO: Você está prestes a excluir permanentemente o usuário ${email}. Esta ação não pode ser desfeita.`)) return;
    if (!window.confirm('TEM CERTEZA ABSOLUTA? Todos os dados, sermões e configurações deste usuário serão perdidos.')) return;
    
    setIsProcessing(uid);
    try {
      console.log(`Deleting user: ${uid} (${email})`);
      
      // Get the ID token for authentication
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Not authenticated properly');
      }

      const response = await fetch(`/api/admin/delete-user/${uid}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Server deletion failed');
      }

      alert('Usuário excluído com sucesso do sistema e da autenticação.');
    } catch (err: any) {
      console.error('Error deleting user:', err);
      // Fallback: if server deletion failed but document still exists, try client-side doc deletion
      try {
        await deleteDoc(doc(db, 'users', uid));
        alert('Documento do usuário removido, mas a exclusão da autenticação na Firebase Auth falhou. O usuário ainda pode conseguir logar se não for bloqueado.');
      } catch (clientErr) {
        handleFirestoreError(clientErr, OperationType.DELETE, `users/${uid}`);
        alert('Erro ao excluir usuário: ' + err.message);
      }
    } finally {
      setIsProcessing(null);
    }
  };

  const handleToggleBlock = async (uid: string, currentStatus: boolean) => {
    if (!uid) {
      alert('ID do usuário não encontrado.');
      return;
    }
    
    setIsProcessing(uid);
    try {
      console.log(`Toggling block: user=${uid}, current=${currentStatus}`);
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        isBlocked: !currentStatus,
        updatedAt: serverTimestamp()
      });
      alert(`Usuário ${!currentStatus ? 'BLOQUEADO' : 'DESBLOQUEADO'} com sucesso!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
      alert('Erro ao alterar status de bloqueio. Verifique suas permissões.');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleExportUsers = () => {
    try {
      const headers = [
        'UID',
        'Nome',
        'Email',
        'Plano',
        'Status',
        'Expiração',
        'Nascimento',
        'Novo Nascimento',
        'Denominação',
        'Pastor Presidente',
        'Cidade',
        'Estado',
        'IP',
        'Dispositivo',
        'Navegador',
        'Última Atividade',
        'Data de Registro'
      ];

      const rows = users.map(user => [
        user.uid || '',
        user.displayName || user.fullName || '',
        user.email || '',
        user.role === 'admin' ? 'Administrador' : (user.subscriptionStatus || 'trial'),
        user.role === 'admin' ? 'Ativo' : (user.isPremium ? 'PAGO' : (getUserStatus(user) === 'active' ? 'Ativo' : (getUserStatus(user) === 'expired' ? 'Expirado' : 'Teste'))),
        user.role === 'admin' ? 'Infinito' : (user.subscriptionExpiresAt || user.trialExpiresAt ? format(safeToDate(user.subscriptionExpiresAt || user.trialExpiresAt), 'dd/MM/yyyy') : '-'),
        user.birthDate || '',
        user.newBirthDate || '',
        user.denomination || '',
        user.presidentPastor || '',
        user.locationInfo?.city || '',
        user.locationInfo?.state || '',
        user.locationInfo?.ip || '',
        user.deviceInfo?.os || '',
        user.deviceInfo?.browser || '',
        user.updatedAt ? format(safeToDate(user.updatedAt), 'dd/MM/yyyy HH:mm') : '',
        user.createdAt ? format(safeToDate(user.createdAt), 'dd/MM/yyyy HH:mm') : ''
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => {
          const str = String(cell || '');
          return `"${str.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        }).join(','))
      ].join('\n');

      const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `usuarios_ministrando_a_palavra_${format(new Date(), 'dd_MM_yyyy')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error exporting users:', err);
      alert('Erro ao exportar usuários.');
    }
  };

  const getUserStatus = (user: UserProfile) => {
    if (user.role === 'admin') return 'active';
    const now = new Date();
    
    // If user is premium, check if it's already expired
    if (user.isPremium) {
      const expiryRef = user.subscriptionExpiresAt || user.paidExpiresAt;
      if (expiryRef) {
        const expiryDate = expiryRef.toDate ? expiryRef.toDate() : new Date(expiryRef);
        if (now > expiryDate) return 'expired';
      }
      return 'active';
    }

    const status = user.subscriptionStatus || 'trial';
    
    // Explicit expired status
    if (status === 'expired') return 'expired';
    
    if (status === 'trial') {
      const expiryRef = user.trialExpiresAt;
      if (expiryRef) {
        const expiryDate = expiryRef.toDate ? expiryRef.toDate() : new Date(expiryRef);
        if (now > expiryDate) return 'expired';
      } else {
        // Fallback for very old users
        const created = user.createdAt?.toDate ? user.createdAt.toDate() : (user.createdAt ? new Date(user.createdAt) : new Date());
        const expiry = new Date(created.getTime() + 3 * 24 * 60 * 60 * 1000);
        if (now > expiry) return 'expired';
      }
      return 'trial';
    }

    // Double check active statuses that might be expired
    if (status === 'active') {
      const expiryRef = user.subscriptionExpiresAt || user.paidExpiresAt;
      if (expiryRef) {
        const expiryDate = expiryRef.toDate ? expiryRef.toDate() : new Date(expiryRef);
        if (now > expiryDate) return 'expired';
      }
      return 'active';
    }

    return status;
  };

  const filteredUsers = users.filter(user => {
    const search = searchQuery.toLowerCase();
    const matchesSearch = 
      (user.displayName?.toLowerCase() || '').includes(search) ||
      (user.email?.toLowerCase() || '').includes(search) ||
      (user.fullName?.toLowerCase() || '').includes(search) ||
      (user.denomination?.toLowerCase() || '').includes(search) ||
      (user.locationInfo?.city?.toLowerCase() || '').includes(search);
    
    const status = getUserStatus(user);
    const matchesStatus = statusFilter === 'all' || status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const filteredMessages = messages.filter(msg => {
    const matchesStatus = msgStatusFilter === 'all' || msg.status === msgStatusFilter;
    const matchesArchived = showArchived ? msg.archived === true : !msg.archived;
    const search = searchQuery.toLowerCase();
    const matchesSearch = 
      (msg.userName?.toLowerCase() || '').includes(search) ||
      (msg.userEmail?.toLowerCase() || '').includes(search) ||
      (msg.message?.toLowerCase() || '').includes(search);
    return matchesStatus && matchesSearch && matchesArchived;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Webhook Configuration Modal */}
      <AnimatePresence>
        {showIntegrationInfo && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowIntegrationInfo(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-app-card w-full max-w-lg rounded-[32px] p-8 border border-app-border shadow-2xl relative z-10"
            >
              <button 
                onClick={() => setShowIntegrationInfo(false)}
                className="absolute top-6 right-6 p-2 hover:bg-app-bg rounded-xl transition-colors text-app-secondary"
              >
                <X size={20} />
              </button>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                  <Terminal size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-app-text tracking-tight uppercase">Integração Cakto</h3>
                  <p className="text-xs text-app-secondary font-bold uppercase tracking-widest opacity-60">Configuração de Webhooks</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="p-6 bg-app-bg rounded-3xl border border-app-border space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">URL de Postback / Webhook</p>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 text-[11px] bg-black/40 p-4 rounded-2xl break-all font-mono text-emerald-400 border border-white/5">
                      {webhookUrl}
                    </code>
                    <div className="flex gap-2">
                      <button 
                        onClick={testWebhookConnectivity}
                        disabled={isTestingWebhook}
                        className="p-4 bg-amber-500 text-white rounded-2xl hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50"
                        title="Testar Conectividade (GET)"
                      >
                        <Activity size={20} className={isTestingWebhook ? 'animate-spin' : ''} />
                      </button>
                      <button 
                        onClick={sendTestWebhook}
                        disabled={isSendingTest}
                        className="p-4 bg-rose-500 text-white rounded-2xl hover:bg-rose-400 transition-all shadow-lg shadow-rose-500/20 active:scale-95 disabled:opacity-50"
                        title="Enviar Payload Teste (POST)"
                      >
                        <Send size={20} className={isSendingTest ? 'animate-bounce' : ''} />
                      </button>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(webhookUrl);
                          alert('URL de Webhook copiada com sucesso!');
                        }}
                        className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                        title="Copiar URL"
                      >
                        <Copy size={20} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-xs font-black uppercase tracking-widest text-app-text flex items-center gap-2">
                     Instruções de Configuração
                  </p>
                  <div className="bg-app-bg/50 p-5 rounded-2xl border border-app-border/40">
                    <ul className="text-[11px] text-app-secondary space-y-3">
                      <li className="flex gap-3">
                        <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">1</span>
                        <span>Acesse seu produto no painel da <b>Cakto</b>.</span>
                      </li>
                      <li className="flex gap-3">
                        <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">2</span>
                        <span>Vá em <b>Postbacks</b> ou <b>Webhooks</b>.</span>
                      </li>
                      <li className="flex gap-3">
                        <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">3</span>
                        <span>Adicione a URL acima e selecione o evento <b>"Venda Aprovada"</b>.</span>
                      </li>
                      <li className="flex gap-3">
                        <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">4</span>
                        <span>Salve as alterações. O sistema agora processará pagamentos automaticamente.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowIntegrationInfo(false)}
                className="w-full mt-8 bg-indigo-600 text-white h-16 rounded-[20px] font-black uppercase text-xs tracking-[0.2em] hover:bg-indigo-500 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-indigo-600/20"
              >
                Entendi, Concluir
              </button>

              <button 
                onClick={() => setShowLogs(!showLogs)}
                className="w-full mt-3 text-app-secondary text-[10px] font-black uppercase tracking-widest hover:text-indigo-500 transition-colors"
              >
                {showLogs ? 'Ocultar Logs de Depuração' : 'Ver Logs de Webhook (Avançado)'}
              </button>

              <AnimatePresence>
                {showLogs && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-4 overflow-hidden"
                  >
                    <div className="bg-black/20 rounded-2xl p-4 max-h-[300px] overflow-y-auto space-y-3 font-mono text-[9px]">
                      {webhookLogs.length === 0 ? (
                        <p className="text-center py-4 opacity-50 italic">Nenhum log recebido ainda. Tente realizar uma transação de teste.</p>
                      ) : (
                        webhookLogs.map(log => (
                          <div key={log.id} className="p-3 border border-white/5 rounded-xl bg-black/20">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-indigo-400">{log.receivedAt?.toDate ? format(log.receivedAt.toDate(), 'HH:mm:ss') : '-'}</span>
                              <span className="text-emerald-500 font-bold uppercase">{log.payload?.status || log.payload?.event || 'N/A'}</span>
                            </div>
                            <pre className="text-app-secondary leading-tight whitespace-pre-wrap break-all">
                              {JSON.stringify(log.payload, null, 2)}
                            </pre>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-app-text flex items-center gap-3">
            <ShieldCheck className="text-indigo-500" size={32} />
            {t('adminDashboard')}
          </h1>
          <p className="text-app-secondary font-serif italic text-lg opacity-80">
            {activeTab === 'users' ? t('manageUsersDesc') : t('contactMessages')}
          </p>
        </div>
        
        <button 
          onClick={() => setShowIntegrationInfo(true)}
          className="flex items-center gap-3 px-6 py-4 bg-app-card border border-app-border text-app-text rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:border-indigo-500/50 transition-all shadow-sm group"
        >
          <Settings size={16} className="text-indigo-500 group-hover:rotate-90 transition-transform duration-500" />
          Configurar Webhook
        </button>
      </div>

      {/* Overview Stats */}
      <AnimatePresence mode="wait">
        {activeTab === 'users' ? (
          <motion.div 
            key="users-stats"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4"
          >
            <motion.div 
              whileHover={{ y: -4 }}
              className="bg-app-card border border-app-border rounded-3xl p-5 shadow-sm transition-all group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="p-2.5 bg-indigo-500/10 rounded-2xl text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                  <Users size={18} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-500/5 px-2 py-1 rounded-full">{t('all')}</span>
              </div>
              <div className="relative z-10">
                <h3 className="text-3xl font-black text-app-text tracking-tighter">{users.length}</h3>
                <p className="text-[10px] text-app-secondary font-black uppercase tracking-[0.15em] opacity-60">{t('totalUsers')}</p>
                <div className="mt-3 flex items-center gap-1.5">
                  <div className="w-full h-1 bg-indigo-500/10 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} className="h-full bg-indigo-500" />
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div 
              whileHover={{ y: -4 }}
              className="bg-app-card border border-app-border rounded-3xl p-5 shadow-sm transition-all group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="p-2.5 bg-green-500/10 rounded-2xl text-green-500 group-hover:bg-green-500 group-hover:text-white transition-all">
                  <ShieldCheck size={18} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-green-500 bg-green-500/5 px-2 py-1 rounded-full">{t('statusActive')}</span>
              </div>
              <div className="relative z-10">
                <h3 className="text-3xl font-black text-app-text tracking-tighter">{users.filter(u => getUserStatus(u) === 'active').length}</h3>
                <p className="text-[10px] text-app-secondary font-black uppercase tracking-[0.15em] opacity-60">Assinantes</p>
                <div className="mt-3 flex items-center gap-1.5 text-[9px] font-bold text-green-500">
                  <Sparkles size={10} />
                  <span>{Math.round((users.filter(u => getUserStatus(u) === 'active').length / (users.length || 1)) * 100)}% de conversão</span>
                </div>
              </div>
            </motion.div>

            <motion.div 
              whileHover={{ y: -4 }}
              className="bg-app-card border border-app-border rounded-3xl p-5 shadow-sm transition-all group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="p-2.5 bg-amber-500/10 rounded-2xl text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all">
                  <Clock size={18} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/5 px-2 py-1 rounded-full">Trial</span>
              </div>
              <div className="relative z-10">
                <h3 className="text-3xl font-black text-app-text tracking-tighter">{users.filter(u => getUserStatus(u) === 'trial').length}</h3>
                <p className="text-[10px] text-app-secondary font-black uppercase tracking-[0.15em] opacity-60">Em Teste</p>
                <div className="mt-3 flex items-center gap-1.5 text-[9px] font-bold text-amber-600">
                  <span>Vencimento em {trialDaysConfig} dias</span>
                </div>
              </div>
            </motion.div>

            <motion.div 
              whileHover={{ y: -4 }}
              className="bg-app-card border border-app-border rounded-3xl p-5 shadow-sm transition-all group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="p-2.5 bg-red-500/10 rounded-2xl text-red-500 group-hover:bg-red-500 group-hover:text-white transition-all">
                  <ShieldAlert size={18} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-red-500 bg-red-500/5 px-2 py-1 rounded-full">{t('statusExpired')}</span>
              </div>
              <div className="relative z-10">
                <h3 className="text-3xl font-black text-app-text tracking-tighter">{users.filter(u => getUserStatus(u) === 'expired').length}</h3>
                <p className="text-[10px] text-app-secondary font-black uppercase tracking-[0.15em] opacity-60">Inativos</p>
                <div className="mt-3 flex items-center gap-1.5">
                  <div className="w-full h-1 bg-red-500/5 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 opacity-20" style={{ width: `${(users.filter(u => getUserStatus(u) === 'expired').length / (users.length || 1)) * 100}%` }} />
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div 
              whileHover={{ y: -4 }}
              className="bg-app-card border border-app-border rounded-3xl p-5 shadow-sm transition-all group relative overflow-hidden hidden lg:block"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-600/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="p-2.5 bg-indigo-600/10 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <ArrowUpDown size={18} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-600/5 px-2 py-1 rounded-full">Atividade</span>
              </div>
              <div className="relative z-10">
                <h3 className="text-3xl font-black text-app-text tracking-tighter">{users.filter(u => {
                  if (!u.updatedAt) return false;
                  const date = u.updatedAt.toDate ? u.updatedAt.toDate() : new Date(u.updatedAt);
                  return (new Date().getTime() - date.getTime()) < 24 * 60 * 60 * 1000;
                }).length}</h3>
                <p className="text-[10px] text-app-secondary font-black uppercase tracking-[0.15em] opacity-60">{t('activeNow')}</p>
                <div className="mt-3 flex items-center gap-1.5 text-[9px] font-bold text-indigo-500 animate-pulse">
                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                  <span>Sincronizado</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div 
            key="messages-stats"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-app-card border border-app-border rounded-[32px] p-4 lg:p-5 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-red-500/10 rounded-2xl text-red-500 transition-colors group-hover:bg-red-500 group-hover:text-white">
                  <MessageSquare size={18} />
                </div>
                <span className="text-[8px] lg:text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/5 px-2 lg:px-3 py-1 rounded-full whitespace-nowrap">Pendentes</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-xl lg:text-2xl font-black text-app-text mb-1 truncate">{messages.filter(m => m.status === 'pending').length}</h3>
                <p className="text-[8px] lg:text-[9px] text-app-secondary font-bold uppercase tracking-widest opacity-60 truncate">Aguardando Resposta</p>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 }}
              className="bg-app-card border border-app-border rounded-[32px] p-4 lg:p-5 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-indigo-500/10 rounded-2xl text-indigo-500 transition-colors group-hover:bg-indigo-500 group-hover:text-white">
                  <Mail size={18} />
                </div>
                <span className="text-[8px] lg:text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-500/5 px-2 lg:px-3 py-1 rounded-full whitespace-nowrap">Total</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-xl lg:text-2xl font-black text-app-text mb-1 truncate">{messages.length}</h3>
                <p className="text-[8px] lg:text-[9px] text-app-secondary font-bold uppercase tracking-widest opacity-60 truncate">Total de Mensagens</p>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-app-card border border-app-border rounded-[32px] p-4 lg:p-5 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-green-500/10 rounded-2xl text-green-500 transition-colors group-hover:bg-green-500 group-hover:text-white">
                  <ShieldCheck size={18} />
                </div>
                <span className="text-[8px] lg:text-[10px] font-black uppercase tracking-widest text-green-500 bg-green-500/5 px-2 lg:px-3 py-1 rounded-full whitespace-nowrap">Respondidas</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-xl lg:text-2xl font-black text-app-text mb-1 truncate">{messages.filter(m => m.status === 'replied').length}</h3>
                <p className="text-[8px] lg:text-[9px] text-app-secondary font-bold uppercase tracking-widest opacity-60 truncate">Mensagens Respondidas</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Switcher & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex p-1.5 bg-app-card/40 border border-app-border rounded-[24px] w-fit shadow-inner">
          <button
            onClick={() => setActiveTab('users')}
            className={`
              flex items-center gap-2 px-8 py-3.5 rounded-[18px] text-[11px] font-black uppercase tracking-[0.15em] transition-all
              ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-app-secondary hover:text-indigo-500'}
            `}
          >
            <Users size={16} />
            {t('users')}
          </button>
          <button
            onClick={() => setActiveTab('messages')}
            className={`
              flex items-center gap-2 px-8 py-3.5 rounded-[18px] text-[11px] font-black uppercase tracking-[0.15em] transition-all relative
              ${activeTab === 'messages' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-app-secondary hover:text-indigo-500'}
            `}
          >
            <MessageSquare size={16} />
            {t('messages')}
            {messages.filter(m => m.status === 'pending').length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-app-bg shadow-md">
                {messages.filter(m => m.status === 'pending').length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportUsers}
            className="flex items-center gap-2 px-6 py-4 bg-app-card border border-app-border text-app-secondary rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-app-card/60 transition-all shadow-sm active:scale-95"
          >
            <Download size={16} />
            Exportar CSV
          </button>
          <button
            onClick={() => setShowAddUserModal(true)}
            className="flex items-center gap-2 px-6 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20 active:scale-95"
          >
            <UserPlus size={16} />
            Adicionar Usuário
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        {activeTab === 'users' ? (
          <motion.div
            key="users-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 items-end bg-app-card/30 p-6 rounded-[32px] border border-app-border/40 shadow-sm">
              <div className="flex-1 relative group w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-app-secondary group-focus-within:text-indigo-500 transition-colors" size={18} />
                <input 
                  type="text"
                  placeholder={t('searchUsersPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-app-bg border border-app-border rounded-[20px] pl-12 pr-4 py-4 text-app-text text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium"
                />
                {searchQuery && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-indigo-500 bg-indigo-500/5 px-2 py-1 rounded-lg">
                    {filteredUsers.length} encontrados
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 p-1.5 bg-app-bg border border-app-border rounded-[24px] overflow-x-auto no-scrollbar shadow-inner">
                {(['all', 'trial', 'active', 'expired'] as const).map((filter) => {
                  const count = users.filter(u => {
                    if (filter === 'all') return true;
                    if (filter === 'trial') return (u.subscriptionStatus || 'trial') === 'trial';
                    return u.subscriptionStatus === filter;
                  }).length;

                  return (
                    <button
                      key={filter}
                      onClick={() => setStatusFilter(filter)}
                      className={`
                        px-5 py-2.5 rounded-[18px] text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2
                        ${statusFilter === filter 
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                          : 'text-app-secondary hover:bg-indigo-500/10 hover:text-indigo-500'}
                      `}
                    >
                      {t((filter === 'all' ? 'statusAll' : `status${filter.charAt(0).toUpperCase() + filter.slice(1)}`) as any)}
                      <span className={`px-1.5 py-0.5 rounded-md text-[8px] ${statusFilter === filter ? 'bg-white/20 text-white' : 'bg-app-card/60 text-app-secondary'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Users Table / Mobile Cards */}
            <div className="frosted-glass rounded-[40px] border border-app-border overflow-hidden">
              {/* Desktop Table View */}
              <div className="hidden xl:block overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-app-secondary opacity-50">
                      <th className="px-6 py-4">Usuário</th>
                      <th className="px-6 py-4">Status & Plano</th>
                      <th className="px-6 py-4">Expiração</th>
                      <th className="px-6 py-4">Atividade</th>
                      <th className="px-6 py-4 text-right">Ações Rápidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-20 text-center">
                          <div className="flex flex-col items-center gap-3 opacity-40">
                            <Users size={40} className="text-app-secondary" />
                            <p className="text-sm font-bold text-app-text">Nenhum usuário encontrado</p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredUsers.map((user) => (
                      <tr 
                        key={user.uid || user.email} 
                        className="group bg-app-card/10 hover:bg-app-card/25 transition-all duration-300"
                      >
                        <td className="px-6 py-4 first:rounded-l-[24px]">
                          <div className="flex items-center gap-4">
                            <div className="relative shrink-0">
                              <div className={`
                                w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-md transition-transform group-hover:scale-105
                                ${user.role === 'admin' 
                                  ? 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/20' 
                                  : 'bg-app-bg border border-app-border/40'}
                              `}>
                                {user.role === 'admin' ? <Crown size={18} /> : (user.displayName || user.fullName || 'U').charAt(0).toUpperCase()}
                              </div>
                              {isUserOnline(user) && (
                                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-app-bg rounded-full shadow-sm animate-pulse" />
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-app-text truncate max-w-[150px]">{user.displayName || user.fullName || 'Usuário'}</span>
                                {user.role === 'admin' && (
                                  <span className="bg-indigo-500/10 text-indigo-500 text-[8px] font-black uppercase px-2 py-0.5 rounded-md border border-indigo-500/10 tracking-widest leading-none">Admin</span>
                                )}
                              </div>
                              <span className="text-[10px] text-app-secondary/60 truncate max-w-[150px] font-medium">{user.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`
                            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tighter shadow-sm border
                            ${user.role === 'admin'
                              ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20'
                              : getUserStatus(user) === 'active' 
                                ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                                : getUserStatus(user) === 'expired'
                                  ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                  : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}
                          `}>
                            {user.role === 'admin' ? <ShieldCheck size={12} /> : getUserStatus(user) === 'active' ? <CheckCircle2 size={12} /> : getUserStatus(user) === 'expired' ? <XCircle size={12} /> : <Clock size={12} />}
                            {user.role === 'admin' ? 'Administrador' : user.isPremium ? 'PAGO' : getUserStatus(user) === 'active' ? (t('statusActive')) : getUserStatus(user) === 'expired' ? (t('statusExpired')) : `TESTE (${getTrialDays(user)}D)`}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-app-text whitespace-nowrap">
                              {user.role === 'admin' ? 'Infinito' : (user.subscriptionExpiresAt || user.trialExpiresAt ? format(safeToDate(user.subscriptionExpiresAt || user.trialExpiresAt), 'dd/MM/yyyy', { locale }) : '-')}
                            </span>
                            {user.role !== 'admin' && !user.isPremium && (user.subscriptionStatus || 'trial') === 'trial' && (
                              <span className="text-[9px] font-black uppercase text-amber-600/70">
                                Restam: {getTimeRemaining(user)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-medium text-app-secondary whitespace-nowrap">
                            {user.updatedAt ? formatDistanceToNow(safeToDate(user.updatedAt), { addSuffix: true, locale }) : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right last:rounded-r-[24px] w-[220px]">
                          <div className="flex items-center justify-end gap-1.5 relative">
                            {/* Visualização Rápida */}
                            <button
                              onClick={() => setSelectedUser(user)}
                              className="w-9 h-9 rounded-xl bg-app-bg hover:bg-indigo-500 text-app-secondary hover:text-white flex items-center justify-center transition-all border border-app-border/40 hover:border-transparent shadow-sm group/btn"
                              title={t('viewDetails')}
                            >
                              <Eye size={16} />
                            </button>

                            {user.role !== 'admin' && (
                              <>
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Dar ${trialDaysConfig} dias de teste para este usuário?`)) {
                                      handleUpdateUserPlan(user.uid, 'trial', trialDaysConfig);
                                    }
                                  }}
                                  disabled={isProcessing === user.uid}
                                  className="w-9 h-9 rounded-xl bg-amber-500/10 hover:bg-amber-500 text-amber-600 hover:text-white flex items-center justify-center transition-all border border-amber-500/20 hover:border-transparent disabled:opacity-30 shadow-sm group/btn"
                                  title={t('giveTrial')}
                                >
                                  <Sparkles size={16} />
                                </button>

                                <button
                                  onClick={() => {
                                    if (window.confirm(`Ativar plano pago de 1 ano para ${user.email}?`)) {
                                      handleUpdateUserPlan(user.uid, 'active');
                                    }
                                  }}
                                  disabled={isProcessing === user.uid}
                                  className="w-9 h-9 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white flex items-center justify-center transition-all border border-emerald-500/20 hover:border-transparent disabled:opacity-30 shadow-sm group/btn"
                                  title="Liberar 1 Ano Premium"
                                >
                                  <CreditCard size={16} />
                                </button>

                                <button
                                  onClick={() => handleToggleBlock(user.uid, !!user.isBlocked)}
                                  disabled={isProcessing === user.uid || (user.role as string) === 'admin'}
                                  className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all shadow-sm ${user.isBlocked ? 'bg-red-500 text-white border-transparent' : 'bg-app-bg hover:bg-red-500 text-app-secondary hover:text-white border-app-border/40'}`}
                                  title={user.isBlocked ? 'Desbloquear Usuário' : 'Bloquear Usuário'}
                                >
                                  <ShieldAlert size={16} />
                                </button>
                              </>
                            )}

                            <button
                              onClick={() => {
                                console.log('Delete button clicked for:', user.uid);
                                handleDeleteUser(user.uid, user.email);
                              }}
                              disabled={isProcessing === user.uid || user.role === 'admin' || user.uid === auth.currentUser?.uid}
                              className="w-9 h-9 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white flex items-center justify-center transition-all border border-red-500/20 hover:border-transparent disabled:opacity-30 shadow-sm group/btn"
                              title={t('deleteUser')}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="xl:hidden divide-y divide-app-border/40">
                {filteredUsers.map((user) => (
                  <div key={user.uid || user.email} className="p-4 sm:p-6 hover:bg-indigo-500/5 transition-colors">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <img 
                            src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || user.email}`} 
                            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl border border-app-border shadow-sm object-cover"
                            alt="User"
                          />
                          {user.role === 'admin' ? (
                            <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-indigo-500 rounded-full border-2 border-app-bg flex items-center justify-center">
                              <ShieldCheck size={8} className="sm:w-2.5 sm:h-2.5 text-white" />
                            </div>
                          ) : isUserOnline(user) && (
                            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-app-bg rounded-full shadow-sm animate-pulse" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm sm:text-base font-bold text-app-text truncate max-w-[120px] sm:max-w-[200px] md:max-w-[300px]">
                            {user.displayName || user.fullName || 'Usuário'}
                          </h4>
                          <p className="text-[9px] sm:text-[11px] text-app-secondary font-medium truncate max-w-[150px] sm:max-w-[250px] md:max-w-[350px]">{user.email}</p>
                        </div>
                      </div>
                      <div className={`
                        shrink-0 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-tighter
                        ${getUserStatus(user) === 'active' || user.role === 'admin'
                          ? 'bg-green-500/10 text-green-500' 
                          : getUserStatus(user) === 'expired'
                          ? 'bg-red-500/10 text-red-500'
                          : 'bg-amber-500/10 text-amber-500'}
                      `}>
                        {user.role === 'admin' ? 'Administrador' : user.isPremium ? 'PAGO' : getUserStatus(user) === 'active' ? (t('statusActive')) : getUserStatus(user) === 'expired' ? (t('statusExpired')) : `TESTE (${getTrialDays(user)}D)`}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4 text-[10px] sm:text-xs">
                      <div>
                        <p className="font-black uppercase tracking-widest text-app-secondary opacity-60 mb-1">Nascimento</p>
                        <p className="font-bold text-app-text truncate">
                          {user.birthDate ? format(parseDate(user.birthDate), 'dd/MM/yyyy') : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="font-black uppercase tracking-widest text-app-secondary opacity-60 mb-1">Denominação</p>
                        <p className="font-bold text-app-text truncate">{user.denomination || 'Não informada'}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="font-black uppercase tracking-widest text-app-secondary opacity-60 mb-1">Localização</p>
                        <p className="font-bold text-app-text truncate">
                          {user.locationInfo?.city ? `${user.locationInfo.city}, ${user.locationInfo.state || ''} (${user.locationInfo.ip || ''})` : 'Desconhecido'}
                        </p>
                      </div>
                        <div>
                          <p className="font-black uppercase tracking-widest text-app-secondary opacity-60 mb-1">Expiração</p>
                          <div className="flex flex-col gap-1">
                            <p className="font-bold text-app-text truncate">
                              {user.role === 'admin' ? 'Infinito' : (user.subscriptionExpiresAt || user.trialExpiresAt ? format(safeToDate(user.subscriptionExpiresAt || user.trialExpiresAt), 'dd/MM/yyyy') : '-')}
                            </p>
                            {user.role !== 'admin' && !user.isPremium && (user.subscriptionStatus || 'trial') === 'trial' && (
                            <p className="text-[10px] font-black text-amber-600 bg-amber-500/5 px-2 py-0.5 rounded-md w-fit">
                              Restam: {getTimeRemaining(user)}
                            </p>
                          )}
                          {user.role === 'admin' && (
                            <p className="text-[10px] font-black text-indigo-500 bg-indigo-500/5 px-2 py-0.5 rounded-md w-fit">
                              Vitalício
                            </p>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="font-black uppercase tracking-widest text-app-secondary opacity-60 mb-1">Atividade</p>
                        <p className="font-bold text-app-text truncate">
                          {user.updatedAt ? formatDistanceToNow(safeToDate(user.updatedAt), { addSuffix: true, locale }) : '-'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full pt-4 border-t border-app-border/20 relative">
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="flex-1 min-w-[120px] flex items-center justify-center gap-3 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
                      >
                        <UserIcon size={14} />
                        Detalhes
                      </button>

                      {user.role !== 'admin' && (
                        <>
                          <button
                            onClick={() => {
                              if (window.confirm(`Dar ${trialDaysConfig} dias de teste para este usuário?`)) {
                                handleUpdateUserPlan(user.uid, 'trial', trialDaysConfig);
                              }
                            }}
                            disabled={isProcessing === user.uid}
                            className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/20 transition-all disabled:opacity-30 flex items-center justify-center"
                            title={t('giveTrial')}
                          >
                            <Sparkles size={20} />
                          </button>

                          <button
                            onClick={() => {
                              if (window.confirm(`Ativar plano pago de 1 ano para ${user.email}?`)) {
                                handleUpdateUserPlan(user.uid, 'active');
                              }
                            }}
                            disabled={isProcessing === user.uid}
                            className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 transition-all disabled:opacity-30 flex items-center justify-center"
                            title="Liberar 1 Ano"
                          >
                            <CreditCard size={20} />
                          </button>

                          <button
                            onClick={() => handleToggleBlock(user.uid, !!user.isBlocked)}
                            disabled={isProcessing === user.uid || (user.role as string) === 'admin'}
                            className={`w-12 h-12 rounded-2xl border transition-all flex items-center justify-center ${user.isBlocked ? 'bg-red-500 text-white border-transparent' : 'bg-app-card border-app-border text-red-500 hover:bg-red-500 hover:text-white'}`}
                            title={user.isBlocked ? 'Desbloquear Usuário' : 'Bloquear Usuário'}
                          >
                            <ShieldAlert size={20} />
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => {
                          console.log('Mobile Delete clicked for:', user.uid);
                          handleDeleteUser(user.uid, user.email);
                        }}
                        disabled={isProcessing === user.uid || user.role === 'admin' || user.uid === auth.currentUser?.uid}
                        className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20 transition-all disabled:opacity-30 flex items-center justify-center"
                        title={t('deleteUser')}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}
                {filteredUsers.length === 0 && (
                  <div className="p-10 text-center opacity-40">
                    <p className="text-sm font-bold text-app-text">Nenhum usuário encontrado</p>
                  </div>
                )}
              </div>
            </div>

          </motion.div>
        ) : (
          <motion.div
            key="messages-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Messages Filters */}
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 relative group w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-app-secondary group-focus-within:text-indigo-500 transition-colors" size={18} />
                <input 
                  type="text"
                  placeholder={t('searchUsersPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-app-card/40 border border-app-border rounded-2xl pl-12 pr-4 py-4 text-app-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium"
                />
                {searchQuery && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-indigo-500 bg-indigo-500/5 px-2 py-1 rounded-lg">
                    {filteredMessages.length} encontrados
                  </span>
                )}
              </div>

              <div className="flex gap-2 p-1 bg-app-card/40 border border-app-border rounded-2xl overflow-x-auto no-scrollbar">
                {(['all', 'pending', 'replied'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setMsgStatusFilter(filter)}
                    className={`
                      px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap
                      ${msgStatusFilter === filter ? 'bg-indigo-500 text-white shadow-lg' : 'text-app-secondary hover:text-app-text'}
                    `}
                  >
                    {t(filter)}
                  </button>
                ))}
                <div className="w-px h-6 bg-app-border my-auto mx-1" />
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className={`
                    px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2
                    ${showArchived ? 'bg-indigo-500 text-white shadow-lg' : 'text-app-secondary hover:text-app-text'}
                  `}
                >
                  <Archive size={14} />
                  {showArchived ? 'Ocultar Arquivados' : 'Ver Arquivados'}
                </button>
              </div>
            </div>

            {/* Messages List */}
            <div className="space-y-4">
                {filteredMessages.map((msg) => (
                  <motion.div 
                    layout
                    key={msg.id} 
                    className={`
                      bg-app-card border rounded-[32px] p-6 flex flex-col gap-6 transition-all hover:shadow-xl hover:shadow-indigo-500/5 group/card
                      ${msg.status === 'pending' ? 'border-amber-500/20 ring-1 ring-amber-500/5' : 'border-app-border opacity-90'}
                    `}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0 overflow-hidden shadow-inner group-hover/card:scale-110 transition-transform duration-500">
                            {msg.userId ? (
                                <img 
                                  src={`https://api.dicebear.com/7.x/initials/svg?seed=${msg.userName}`} 
                                  className="w-full h-full object-cover"
                                  alt="User"
                                />
                            ) : (
                                <UserIcon size={28} />
                            )}
                          </div>
                          {msg.status === 'pending' && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-app-bg shadow-sm" />
                          )}
                        </div>
                        <div>
                          <h4 className="text-lg font-black text-app-text tracking-tight flex items-center gap-2">
                            {msg.userName}
                            {msg.archived && <Archive size={14} className="text-amber-500" />}
                          </h4>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-app-secondary font-medium mt-0.5">
                            <span className="flex items-center gap-1"><Mail size={12} className="opacity-40" /> {msg.userEmail}</span>
                            <span className="opacity-40">•</span>
                            <span className="flex items-center gap-1"><Clock size={12} className="opacity-40" /> {msg.createdAt ? formatDistanceToNow(safeToDate(msg.createdAt), { addSuffix: true, locale }) : '...'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${msg.status === 'pending' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 border-amber-600' : 'bg-green-500/10 text-green-500 border-green-500/20'}`}>
                          {t(msg.status)}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              const action = !msg.archived ? 'arquivar' : 'desarquivar';
                              if (window.confirm(`Deseja ${action} esta mensagem?`)) {
                                handleUpdateMessage(msg.id, { archived: !msg.archived });
                              }
                            }}
                            className={`p-2.5 rounded-xl border border-app-border text-app-secondary transition-all hover:bg-app-card ${msg.archived ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' : 'hover:text-indigo-500'}`}
                            title={msg.archived ? 'Desarquivar' : 'Arquivar'}
                          >
                            <Archive size={18} />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('Tem certeza que deseja EXCLUIR PERMANENTEMENTE esta mensagem?')) {
                                handleDeleteMessage(msg.id);
                              }
                            }}
                            className="p-2.5 rounded-xl border border-app-border text-app-secondary hover:text-red-500 transition-all hover:bg-app-card"
                            title="Excluir Permanentemente"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="bg-app-bg/40 rounded-[28px] p-8 text-base text-app-text leading-relaxed border border-app-border/40 whitespace-pre-wrap font-medium relative group-hover/card:bg-app-bg/60 transition-colors">
                        <div className="absolute left-0 top-8 bottom-8 w-1.5 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(79,70,229,0.3)]" />
                        "{msg.message}"
                      </div>
                    </div>

                    {msg.status === 'replied' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="ml-0 sm:ml-8 flex flex-col gap-3"
                      >
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-500 ml-2">
                          <CornerDownRight size={14} className="animate-bounce" />
                          Sua Resposta
                        </div>
                        <div className="bg-indigo-500/5 rounded-[24px] p-6 text-sm text-app-secondary border border-indigo-500/10 italic whitespace-pre-wrap relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500/40" />
                          {msg.replyMessage}
                        </div>
                        <div className="flex items-center gap-2 text-[9px] text-app-secondary/60 font-bold ml-6 uppercase tracking-widest">
                          <Calendar size={10} />
                          Respondida {msg.repliedAt ? format(safeToDate(msg.repliedAt), 'PPP HH:mm', { locale }) : '...'}
                        </div>
                      </motion.div>
                    )}

                    {msg.status === 'pending' && (
                      <div className="flex justify-end pt-2">
                         <button 
                          onClick={() => setReplyingMessage(msg)}
                          className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 transition-all flex items-center gap-3 active:scale-95 group/btn"
                        >
                          <Send size={16} className="group-hover:translate-x-1 transition-transform" />
                          {t('reply')}
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}

              {filteredMessages.length === 0 && (
                <div className="p-20 text-center space-y-4">
                  <MessageSquare size={48} className="mx-auto text-app-secondary opacity-20" />
                  <p className="text-app-text font-bold">{t('noMessagesFound')}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reply Modal */}
      <AnimatePresence>
        {replyingMessage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setReplyingMessage(null)}
              className="absolute inset-0 bg-app-bg/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-app-card border border-app-border rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-app-text">{t('replyTo')} {replyingMessage.userName}</h3>
                  <p className="text-xs text-app-secondary">{replyingMessage.userEmail}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-app-secondary opacity-60">Mensagem Original</label>
                  <div className="p-4 bg-app-bg rounded-2xl text-xs text-app-secondary border border-app-border italic">
                    "{replyingMessage.message}"
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-app-secondary opacity-60">Sua Resposta</label>
                  <textarea 
                    autoFocus
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={t('messagePlaceholder')}
                    className="w-full bg-app-bg border border-app-border rounded-2xl p-4 text-app-text text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[150px] resize-none"
                  />
                  <p className="text-[10px] text-app-secondary italic opacity-60">* Ao clicar em enviar, a resposta será salva e seu cliente de e-mail será aberto para envio direto.</p>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setReplyingMessage(null)}
                    className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-app-secondary hover:text-app-text transition-all"
                  >
                    {t('cancel') || 'Cancelar'}
                  </button>
                  <button 
                    disabled={isSendingReply || !replyText.trim()}
                    onClick={() => {
                      if (window.confirm('Deseja enviar esta resposta e marcar como respondido?')) {
                        handleSendReply();
                      }
                    }}
                    className="flex-[2] py-4 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    {isSendingReply ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={16} />}
                    {t('sendReply')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Message Notification Toast */}
      <AnimatePresence>
        {newMsgToast?.show && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[110] bg-indigo-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 min-w-[300px]"
          >
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <MessageSquare size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Nova Mensagem!</p>
              <p className="text-sm font-bold">{newMsgToast.name} enviou um contato.</p>
            </div>
            <button 
              onClick={() => {
                setNewMsgToast(null);
                setActiveTab('messages');
                setMsgStatusFilter('pending');
              }}
              className="ml-auto bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors"
            >
              <ChevronDown size={16} className="-rotate-90" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTrialModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTrialModal(false)}
              className="absolute inset-0 bg-app-bg/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md frosted-glass rounded-[40px] border border-app-border overflow-hidden shadow-2xl p-8"
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-black text-app-text tracking-tight mb-1">Período de Teste</h3>
                  <p className="text-app-secondary text-xs font-bold uppercase tracking-widest">Configuração de quantidade de dias</p>
                </div>
                <button 
                  onClick={() => setShowTrialModal(false)}
                  className="p-2 hover:bg-app-card rounded-xl transition-colors text-app-secondary"
                >
                  <XCircle size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-app-card/30 border border-app-border rounded-2xl p-6 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-app-secondary mb-2 opacity-60">Usuários Atuais em Teste</p>
                  <p className="text-4xl font-black text-app-text">{users.filter(u => (u.subscriptionStatus || 'trial') === 'trial').length}</p>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-app-secondary ml-4">Quantidade de Dias (Padrão)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 3, 7, 30].map(days => (
                      <button
                        key={days}
                        onClick={() => setTrialDaysConfig(days)}
                        className={`
                          py-3 rounded-xl border text-xs font-bold transition-all
                          ${trialDaysConfig === days ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-app-card/30 border-app-border text-app-secondary hover:bg-app-card'}
                        `}
                      >
                        {days} {days === 1 ? 'dia' : 'dias'}
                      </button>
                    ))}
                  </div>
                  
                  <div className="flex items-center gap-4 mt-4">
                    <input 
                      type="range"
                      min="1"
                      max="30"
                      value={trialDaysConfig}
                      onChange={(e) => setTrialDaysConfig(parseInt(e.target.value))}
                      className="flex-1 accent-indigo-500"
                    />
                    <span className="text-sm font-black text-indigo-500 min-w-8">{trialDaysConfig}d</span>
                  </div>
                </div>

                <p className="text-[10px] text-app-secondary italic opacity-60 text-center px-4">
                  * Esta configuração define a quantidade de dias que um novo usuário em teste recebe.
                </p>

                <button
                  onClick={() => setShowTrialModal(false)}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98] mt-4"
                >
                  Salvar Configuração
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddUserModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddUserModal(false)}
              className="absolute inset-0 bg-app-bg/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md frosted-glass rounded-[40px] border border-app-border overflow-hidden shadow-2xl p-8"
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-black text-app-text tracking-tight mb-1">Novo Usuário</h3>
                  <p className="text-app-secondary text-xs font-bold uppercase tracking-widest">Configuração de Acesso Manual</p>
                </div>
                <button 
                  onClick={() => setShowAddUserModal(false)}
                  className="p-2 hover:bg-app-card rounded-xl transition-colors text-app-secondary"
                >
                  <XCircle size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-app-secondary ml-4">Email do Usuário</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-app-secondary group-focus-within:text-indigo-500 transition-colors" size={18} />
                    <input 
                      type="email"
                      placeholder="exemplo@email.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="w-full bg-app-card/40 border border-app-border rounded-2xl pl-12 pr-4 py-4 text-app-text focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-app-secondary ml-4">Plano Inicial</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setNewUserPlan('trial')}
                      className={`
                        flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all
                        ${newUserPlan === 'trial' ? 'bg-indigo-600/10 border-indigo-500 text-indigo-500 shadow-lg' : 'bg-app-card/30 border-app-border text-app-secondary hover:bg-app-card'}
                      `}
                    >
                      <Calendar size={24} />
                      <div className="text-center">
                        <p className="text-xs font-black uppercase tracking-widest">Teste</p>
                        <p className="text-[8px] font-bold opacity-60">{trialDaysConfig} {trialDaysConfig === 1 ? 'Dia' : 'Dias'} de Validade</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setNewUserPlan('active')}
                      className={`
                        flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all
                        ${newUserPlan === 'active' ? 'bg-green-600/10 border-green-500 text-green-500 shadow-lg' : 'bg-app-card/30 border-app-border text-app-secondary hover:bg-app-card'}
                      `}
                    >
                      <CreditCard size={24} />
                      <div className="text-center">
                        <p className="text-xs font-black uppercase tracking-widest">Pago</p>
                        <p className="text-[8px] font-bold opacity-60">1 Ano de Validade</p>
                      </div>
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (window.confirm(`Deseja adicionar o usuário ${newUserEmail} com o plano ${newUserPlan === 'trial' ? 'Teste' : 'Pago'}?`)) {
                      handleAddUser();
                    }
                  }}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98] mt-4"
                >
                  Confirmar Acesso
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Detail Side Drawer */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-[130] flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUser(null)}
              className="absolute inset-0 bg-app-bg/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg h-full bg-app-card border-l border-app-border shadow-2xl flex flex-col"
            >
              {/* Drawer Header */}
              <div className="p-8 border-b border-app-border flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-app-text tracking-tight uppercase">Métrica do Ministro</h3>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-app-secondary opacity-60">ID: {selectedUser.uid}</p>
                </div>
                <button 
                  onClick={() => setSelectedUser(null)}
                  className="p-3 bg-app-card border border-app-border rounded-2xl text-app-secondary hover:text-indigo-500 hover:border-indigo-500/30 transition-all active:scale-95 shadow-sm"
                >
                  <XCircle size={24} />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto no-scrollbar p-8 space-y-10">
                {/* High Impact Profile Header */}
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 scale-150 rounded-full" />
                    <img 
                      src={selectedUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${selectedUser.displayName}`} 
                      className="w-32 h-32 rounded-[40px] border-4 border-app-card shadow-2xl object-cover relative z-10"
                      alt="Profile"
                    />
                    <div className={`
                      absolute -bottom-2 -right-2 z-20 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-xl
                      ${selectedUser.role === 'admin' ? 'bg-indigo-600 text-white shadow-indigo-600/30' : selectedUser.subscriptionStatus === 'active' ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'}
                    `}>
                      {selectedUser.role === 'admin' ? 'Administrador' : selectedUser.subscriptionStatus || 'trial'}
                    </div>
                  </div>
                  <h4 className="text-3xl font-serif italic text-app-text mb-1">{selectedUser.displayName}</h4>
                  <p className="text-sm font-medium text-app-secondary flex items-center gap-1.5 opacity-80">
                    <Mail size={14} className="opacity-40" /> {selectedUser.email}
                  </p>
                </div>

                {/* Info Blocks - Bento Style */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-6 bg-app-bg/40 rounded-[32px] border border-app-border/40 hover:border-indigo-500/20 transition-colors">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-3">Denominação</p>
                    <p className="text-base font-bold text-app-text">{selectedUser.denomination || 'Não informada'}</p>
                    <Building2 size={16} className="mt-4 text-app-secondary opacity-20" />
                  </div>
                  <div className="p-6 bg-app-bg/40 rounded-[32px] border border-app-border/40 hover:border-indigo-500/20 transition-colors">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-3">Pastor Pres.</p>
                    <p className="text-base font-bold text-app-text">{selectedUser.presidentPastor || '-'}</p>
                    <UserIcon size={16} className="mt-4 text-app-secondary opacity-20" />
                  </div>
                  <div className="p-6 bg-app-bg/40 rounded-[32px] border border-app-border/40 hover:border-indigo-500/20 transition-colors col-span-2">
                     <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-4">Métricas de Acesso</p>
                     <div className="space-y-4">
                       <div className="flex items-center justify-between text-xs">
                         <span className="font-bold text-app-secondary flex items-center gap-2"><Clock size={12} /> Último Login</span>
                         <span className="font-mono text-app-text">{selectedUser.lastLogin ? format(safeToDate(selectedUser.lastLogin), 'PPP HH:mm', { locale }) : '-'}</span>
                       </div>
                       <div className="flex items-center justify-between text-xs">
                         <span className="font-bold text-app-secondary flex items-center gap-2"><Calendar size={12} /> Expira em</span>
                         <span className="font-mono text-indigo-500 font-bold">
                           {selectedUser.role === 'admin' 
                             ? 'Infinito' 
                             : (selectedUser.subscriptionExpiresAt 
                               ? format(safeToDate(selectedUser.subscriptionExpiresAt), 'PPP', { locale }) 
                               : (selectedUser.trialExpiresAt ? format(safeToDate(selectedUser.trialExpiresAt), 'PPP', { locale }) : '-'))}
                         </span>
                       </div>
                     </div>
                  </div>
                </div>

                {/* Device & Location Accordion Pattern */}
                <div className="space-y-4">
                  <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-app-secondary border-b border-app-border pb-2 ml-2">Dados de Infraestrutura</h5>
                  
                  <div className="space-y-6 px-2">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0">
                        <Smartphone size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-1">Dispositivo e Navegador</p>
                        <p className="text-sm font-bold text-app-text truncate">{selectedUser.deviceInfo?.browser} no {selectedUser.deviceInfo?.os}</p>
                        <p className="text-[10px] text-app-secondary font-mono mt-1 opacity-60 truncate">{selectedUser.deviceInfo?.platform}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0">
                        <MapPin size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-1">Localização e IP</p>
                        <p className="text-sm font-bold text-app-text">{selectedUser.locationInfo?.city} - {selectedUser.locationInfo?.neighborhood || 'Bairro N/D'}</p>
                        <p className="text-[10px] text-app-secondary font-mono mt-1 opacity-60">{selectedUser.locationInfo?.ip}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drawer Footer Actions */}
              <div className="p-8 border-t border-app-border bg-app-bg/20 backdrop-blur-sm space-y-3">
                 <div className="grid grid-cols-2 gap-3">
                   <button
                      onClick={() => {
                        if (window.confirm(`Dar ${trialDaysConfig} dias de teste para ${selectedUser.displayName}?`)) {
                          handleUpdateUserPlan(selectedUser.uid, 'trial', trialDaysConfig);
                        }
                      }}
                      className="flex items-center justify-center gap-2 py-4 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-white border border-amber-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                    >
                      <Sparkles size={14} /> Dar Teste
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Atualizar ${selectedUser.displayName} para plano pago?`)) {
                          handleUpdateUserPlan(selectedUser.uid, 'active');
                        }
                      }}
                      className="flex items-center justify-center gap-2 py-4 bg-green-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-green-500/20 active:scale-95 transition-all"
                    >
                      <ShieldCheck size={14} /> Ativar Anual
                    </button>
                 </div>
                 <button
                  onClick={() => {
                    const newRole = selectedUser.role === 'admin' ? 'user' : 'admin';
                    if (window.confirm(`Alterar cargo para ${newRole}?`)) {
                      handleUpdateRole(selectedUser.uid, newRole);
                    }
                  }}
                  className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 flex items-center justify-center gap-2 ${selectedUser.role === 'admin' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-app-card border-app-border text-app-secondary hover:text-indigo-500'}`}
                >
                  <Shield size={14} /> {selectedUser.role === 'admin' ? 'Remover Admin' : 'Tornar Admin'}
                </button>

                <button
                  onClick={() => handleToggleBlock(selectedUser.uid, !!selectedUser.isBlocked)}
                  className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 flex items-center justify-center gap-2 ${selectedUser.isBlocked ? 'bg-red-500 text-white border-transparent shadow-lg shadow-red-500/20' : 'bg-app-card border-app-border text-app-secondary hover:text-red-500 hover:border-red-500/20'}`}
                >
                  <ShieldAlert size={14} /> {selectedUser.isBlocked ? 'Desbloquear Usuário' : 'Bloquear Usuário'}
                </button>
                 <button
                  onClick={() => handleDeleteUser(selectedUser.uid, selectedUser.email || 'usuário')}
                  className="w-full py-4 text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 rounded-2xl transition-all"
                >
                  Excluir Usuário permanentemente
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Quick Actions Footer */}
      <div className="sticky bottom-0 z-[50] mt-auto -mx-8 -mb-8">
        <div className="bg-app-card/80 backdrop-blur-xl border-t border-app-border p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.2)]">
          <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
              <div className="relative group w-full sm:w-80">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="w-4 h-4 text-app-secondary group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input
                  type="email"
                  placeholder="Liberar Premium por E-mail"
                  className="w-full pl-11 pr-4 py-3.5 bg-app-bg/50 border border-app-border rounded-2xl text-sm text-app-text placeholder:text-app-secondary/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all shadow-inner"
                  value={manualUpgradeEmail}
                  onChange={(e) => setManualUpgradeEmail(e.target.value)}
                />
              </div>
              <button
                onClick={handleManualUpgrade}
                disabled={isUpgrading}
                className="w-full sm:w-auto h-12 px-10 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/20 active:scale-95"
              >
                <Unlock className="w-4 h-4" />
                {isUpgrading ? 'Liberando...' : 'Liberar Premium'}
              </button>
            </div>

            <div className="flex items-center gap-4 w-full lg:w-auto">
               <button
                  onClick={() => setShowLogs(!showLogs)}
                  className={`flex-1 lg:flex-none h-12 flex items-center justify-center gap-3 px-12 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border
                    ${showLogs ? 'bg-amber-600 border-amber-500 text-white shadow-xl shadow-amber-600/20' : 'bg-app-bg border-app-border text-app-secondary hover:text-app-text hover:border-indigo-500/30'}
                  `}
               >
                  <History className="w-4 h-4" />
                  {showLogs ? 'Ocultar Logs de Vendas' : 'Ver Logs de Vendas'}
               </button>
               
               <div className="hidden sm:flex items-center gap-2 px-6 py-3 bg-app-bg/50 border border-app-border rounded-2xl">
                 <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                 <span className="text-[10px] font-black text-app-secondary uppercase tracking-[0.2em]">Painel de Controle Ativo</span>
               </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showLogs && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogs(false)}
              className="absolute inset-0 bg-app-bg/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl max-h-[80vh] bg-app-card border border-app-border rounded-[40px] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-app-border flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-app-text">Logs de Webhooks Recentes</h3>
                  <p className="text-xs text-app-secondary">Últimos 10 eventos recebidos do Cakto (Ou outros gateways)</p>
                </div>
                <button onClick={() => setShowLogs(false)} className="p-2 hover:bg-app-bg rounded-xl text-app-secondary"><X size={24}/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-4 font-mono text-[10px]">
                {logsError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-center">
                    <ShieldAlert className="w-6 h-6 mx-auto mb-2" />
                    <p className="font-bold">Erro de Permissão ou Índice</p>
                    <p className="opacity-60">{logsError}</p>
                    <p className="mt-2 text-[8px]">Certifique-se de que você está logado como administrador e que o índice foi criado.</p>
                  </div>
                )}
                {!logsError && webhookLogs.length === 0 ? (
                  <div className="py-20 text-center opacity-30 italic">Nenhum log disponível</div>
                ) : (
                  webhookLogs.map((log) => (
                    <div key={log.id} className="p-4 bg-app-bg/50 border border-app-border rounded-2xl space-y-2">
                       <div className="flex justify-between items-center text-indigo-500 font-bold border-b border-app-border/20 pb-2">
                          <span>Event: {log.payload?.event || 'N/A'} - Status: {log.payload?.status || log.payload?.venda_status || 'N/A'}</span>
                          <span>{log.receivedAt ? format(safeToDate(log.receivedAt), 'dd/MM HH:mm:ss', { locale: language === 'pt' ? ptBR : enUS }) : '...'}</span>
                       </div>
                       <pre className="overflow-x-auto whitespace-pre-wrap text-app-secondary">
                          {JSON.stringify(log.payload, null, 2)}
                       </pre>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
