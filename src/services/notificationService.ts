import { getToken, onMessage } from 'firebase/messaging';
import { messaging, db, auth } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export const requestNotificationPermission = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { error: 'Este navegador não suporta notificações' };
  }

  if (!messaging) {
    return { error: 'O serviço de mensagens não foi inicializado corretamente' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      try {
        const swRegistration = await navigator.serviceWorker.getRegistration();
        if (!swRegistration) {
          return { error: 'Service Worker não encontrado' };
        }

        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_VAPID_KEY || 'BDb0V_A5B3P_I-X-I-4_I-X-I-4_I-X-I-4_I-X-I-4',
          serviceWorkerRegistration: swRegistration
        });
        
        if (token && auth.currentUser) {
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            fcmToken: token,
            notificationsEnabled: true,
            updatedAt: serverTimestamp()
          });
          return { token };
        }
        return { error: 'Token não gerado ou usuário não autenticado' };
      } catch (tokenErr: any) {
        console.error('Error getting FCM token:', tokenErr);
        if (tokenErr.code === 'messaging/unsupported-browser') {
          return { error: 'Navegador não compatível com notificações push por razões de segurança ou suporte' };
        }
        if (tokenErr.code === 'messaging/invalid-vapid-key') {
          return { error: 'Configuração do serviço inválida (VAPID Key)' };
        }
        return { error: tokenErr.message || 'Falha na geração do token' };
      }
    } else {
      console.warn('Notification permission not granted:', permission);
      if (permission === 'denied') {
        return { error: 'BLOQUEADO: As notificações foram bloqueadas no seu navegador. Para habilitar, clique no ícone do cadeado (🔒) ao lado da barra de endereço e altere "Notificações" para "Permitir". Após isso, recarregue a página.' };
      }
      return { error: `Permissão: ${permission}` };
    }
  } catch (error: any) {
    console.error('Error in requestNotificationPermission:', error);
    return { error: error.message || 'Falha na solicitação de permissão' };
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    if (!messaging) return;
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });
