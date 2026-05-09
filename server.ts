import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import * as admin from 'firebase-admin';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

// Firebase Admin Setup
let firestore: admin.firestore.Firestore | null = null;
let messaging: admin.messaging.Messaging | null = null;

try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  let firebaseConfig: any = {};
  
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  // Support environment variables as override (useful for production like Hostinger)
  const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId) {
    if (clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log(`Firebase Admin initialized with Service Account (Project: ${projectId})`);
    } else {
      admin.initializeApp({
        projectId: projectId,
      });
      console.log(`Firebase Admin initialized with Project ID fallback (Project: ${projectId})`);
    }
    
    // Use the specific databaseId if provided in config
    if (firebaseConfig.firestoreDatabaseId) {
      firestore = admin.firestore(firebaseConfig.firestoreDatabaseId);
    } else {
      firestore = admin.firestore();
    }
    
    messaging = admin.messaging();
  } else {
    console.warn('No Firebase Project ID found in environment or config file.');
  }
} catch (err) {
  console.error('Failed to initialize Firebase Admin:', err);
}

// Middleware to verify Firebase Auth Token
const authenticateAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Check if the user is an admin
    const isAdminEmail = decodedToken.email?.toLowerCase() === 'dmv.vasconcelos@gmail.com';
    let isFirestoreAdmin = false;

    if (!isAdminEmail && firestore) {
      const userDoc = await firestore.collection('users').doc(decodedToken.uid).get();
      isFirestoreAdmin = userDoc.data()?.role === 'admin';
    }

    if (isAdminEmail || isFirestoreAdmin) {
      (req as any).user = decodedToken;
      next();
    } else {
      res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Background check for notifications
async function checkNotifications() {
  if (!firestore) return;
  
  console.log('Checking notifications...');
  try {
    const now = new Date();
    const future24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const soon = new Date(now.getTime() + 30 * 60 * 1000); // 30 mins before

    const agendaRef = firestore.collection('ministerial_agenda');
    
    // Check 24h reminders
    try {
      const q24h = await agendaRef
        .where('notify24h', '==', true)
        .where('notified24h', '==', false)
        .where('date', '<=', admin.firestore.Timestamp.fromDate(future24h))
        .where('date', '>=', admin.firestore.Timestamp.fromDate(now))
        .get();

      for (const doc of q24h.docs) {
        const event = doc.data();
        await sendPushNotification(event.userId, {
          title: 'Lembrete: Evento em 24h',
          body: `${event.title} amanhã às ${event.time || ''}`,
        });
        await doc.ref.update({ notified24h: true });
      }
    } catch (e) {
      console.warn('Error checking 24h notifications (possibly missing index):', e);
    }

    // Check same day / soon reminders
    try {
      const qDay = await agendaRef
        .where('notifyDayOf', '==', true)
        .where('notifiedDayOf', '==', false)
        .where('date', '<=', admin.firestore.Timestamp.fromDate(soon))
        .where('date', '>=', admin.firestore.Timestamp.fromDate(now))
        .get();

      for (const doc of qDay.docs) {
        const event = doc.data();
        await sendPushNotification(event.userId, {
          title: 'Seu evento está começando!',
          body: `${event.title} em breve às ${event.time || ''}`,
        });
        await doc.ref.update({ notifiedDayOf: true });
      }
    } catch (e) {
      console.warn('Error checking day-of notifications (possibly missing index):', e);
    }
  } catch (err) {
    console.error('Error in notification background task:', err);
  }
}

async function sendPushNotification(userId: string, payload: { title: string; body: string }) {
  if (!firestore || !messaging) return;
  
  try {
    const userDoc = await firestore.collection('users').doc(userId).get();
    const userData = userDoc.data();
    if (userData?.fcmToken && userData?.notificationsEnabled) {
      await messaging.send({
        token: userData.fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        webpush: {
          fcmOptions: {
            link: '/',
          },
        },
      });
      console.log(`Notification sent to user ${userId}`);
    }
  } catch (err) {
    console.error(`Error sending notification to user ${userId}:`, err);
  }
}

// Start background task
if (process.env.NODE_ENV === 'production') {
  setInterval(checkNotifications, 10 * 60 * 1000); // Every 10 mins in prod
} else {
  // Run once in dev for demo, then every 5 mins
  setTimeout(checkNotifications, 5000);
  setInterval(checkNotifications, 5 * 60 * 1000);
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Webhook for Cakto Payments
  app.post('/api/webhooks/cakto', async (req, res) => {
    try {
      const payload = req.body;
      console.log('Cakto Webhook received:', JSON.stringify(payload, null, 2));

      // Optional: Store in Firestore for debugging (last 10 webhooks)
      if (firestore) {
        try {
          await firestore.collection('webhook_logs').add({
            receivedAt: admin.firestore.Timestamp.fromDate(new Date()),
            payload,
            headers: req.headers,
            source: 'cakto'
          });
        } catch (e) {
          console.error('Error saving webhook log:', e);
        }
      }

      // Helper to find key in nested objects
      const findValue = (obj: any, keys: string[]): any => {
        for (const key of keys) {
          if (obj[key] !== undefined) return obj[key];
        }
        for (const k in obj) {
          if (obj[k] && typeof obj[k] === 'object') {
            const found = findValue(obj[k], keys);
            if (found !== undefined) return found;
          }
        }
        return undefined;
      };

      const statusKeys = ['status', 'transaction_status', 'event', 'venda_status', 'status_venda', 'situacao', 'payment_status', 'state'];
      const emailKeys = ['customer_email', 'email', 'comprador_email', 'email_comprador', 'cliente_email', 'payer_email', 'user_email', 'email_contato'];
      const idKeys = ['external_id', 'ext_id', 'customer_id', 'metadata.external_id', 'reference', 'ref', 'custom_id', 'client_id', 'pedido_id', 'transacao_id'];

      const status = findValue(payload, statusKeys);
      const email = findValue(payload, emailKeys);
      let externalId = findValue(payload, idKeys);
      
      // Log for debugging
      console.log(`Extracted: Status=${status}, Email=${email}, ExtID=${externalId}`);

      // Special check for nested metadata or params
      if (!externalId) {
        externalId = payload.metadata?.external_id || payload.params?.external_id || payload.data?.external_id || payload.external_id;
      }

      // Statuses that represent a successful payment
      const successStatuses = ['approved', 'completed', 'paid', 'paid_success', 'venda_aprovada', 'pago', 'sucesso', 'aprovado', 'active', 'pago_sucesso', '1'];
      const isApproved = successStatuses.includes(String(status).toLowerCase());

      if (isApproved && (email || externalId) && firestore) {
        console.log(`Processing approved payment for ${email || externalId}`);
        
        let userDoc: admin.firestore.DocumentReference | null = null;
        
        if (externalId && String(externalId).length > 5) { // Ensure it's a real UID
          userDoc = firestore.collection('users').doc(String(externalId));
        }
        
        if (!userDoc && email) {
          const usersSnap = await firestore.collection('users')
            .where('email', '==', String(email).toLowerCase())
            .limit(1)
            .get();
          
          if (!usersSnap.empty) {
            userDoc = usersSnap.docs[0].ref;
          }
        }

        if (userDoc) {
          const now = new Date();
          const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
          
          await userDoc.update({
            subscriptionStatus: 'active',
            subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(oneYearFromNow),
            paidAt: admin.firestore.Timestamp.fromDate(now),
            updatedAt: admin.firestore.Timestamp.fromDate(now)
          });
          
          console.log(`User ${email || externalId} upgraded to Premium successfully`);
          return res.status(200).json({ success: true, message: 'Subscription updated' });
        } else {
          console.warn(`User not found for payment: Email=${email}, ExtID=${externalId}`);
          // Still return 200 to acknowledge receipt to Cakto
          return res.status(200).json({ success: false, message: 'User not found' });
        }
      }

      // If it's a refund or cancellation
      const cancelStatuses = ['refunded', 'canceled', 'chargeback', 'estornado', 'reembolsado', 'cancelado'];
      const isCanceled = cancelStatuses.includes(String(status).toLowerCase());

      if (isCanceled && (email || externalId) && firestore) {
        let userDoc: admin.firestore.DocumentReference | null = null;
        if (externalId && String(externalId).length > 5) {
          userDoc = firestore.collection('users').doc(String(externalId));
        }
        
        if (!userDoc && email) {
          const usersSnap = await firestore.collection('users').where('email', '==', String(email).toLowerCase()).limit(1).get();
          if (!usersSnap.empty) userDoc = usersSnap.docs[0].ref;
        }

        if (userDoc) {
          await userDoc.update({
            subscriptionStatus: 'expired',
            updatedAt: admin.firestore.Timestamp.fromDate(new Date())
          });
          console.log(`User ${email || externalId} subscription revoked due to ${status}`);
        }
      }

      res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (error) {
      console.error('Error in Cakto webhook:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Admin User Deletion Endpoint
  app.delete('/api/admin/delete-user/:uid', authenticateAdmin, async (req, res) => {
    try {
      const { uid } = req.params;
      console.log(`Admin ${((req as any).user as any).email} requested deletion of user ${uid}`);
      
      // Delete from Firebase Auth
      await admin.auth().deleteUser(uid);
      
      // Delete from Firestore (though rules should also allow client-side, we do it here for completeness)
      if (firestore) {
        await firestore.collection('users').doc(uid).delete();
        
        // Optionally delete other collection data
        // For now, deleting the profile is the most important part
      }
      
      res.json({ success: true, message: 'User deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: error.message || 'Failed to delete user' });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
