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

  app.get('/api/webhooks/cakto', (req, res) => {
    res.json({ status: 'ok', message: 'Webhook endpoint is active. Use POST for actual data.' });
  });

  // Webhook for Cakto Payments
  app.post('/api/webhooks/cakto', async (req, res) => {
    try {
      const payload = req.body;
      console.log('[Webhook] Cakto/Payment payload received:', JSON.stringify(payload, null, 2));

      // ALWAYS store in Firestore for debugging (last 10 webhooks)
      if (firestore) {
        try {
          // Log even if we can't process it
          await firestore.collection('webhook_logs').add({
            receivedAt: admin.firestore.Timestamp.fromDate(new Date()),
            payload: payload || { empty: true },
            headers: req.headers,
            source: 'external_gateway'
          });
          console.log('[Webhook] Log saved to bucket successfully');
        } catch (e) {
          console.error('[Webhook] CRITICAL Error saving webhook log to Firestore:', e);
        }
      } else {
        console.warn('[Webhook] Firestore not initialized, cannot save logs');
      }

      if (!payload || Object.keys(payload).length === 0) {
        console.warn('[Webhook] Empty payload received');
        return res.status(200).json({ success: false, error: 'Empty payload' });
      }

      // Helper to find key in nested objects (supports dot notation like 'data.customer.email')
      const findValue = (obj: any, keys: string[]): any => {
        for (const key of keys) {
          if (key.includes('.')) {
            const parts = key.split('.');
            let current = obj;
            for (const part of parts) {
              current = current ? current[part] : undefined;
            }
            if (current !== undefined) return current;
          } else if (obj[key] !== undefined) {
            return obj[key];
          }
        }
        
        // Recursive fallback for simple keys (non-dotted)
        for (const k in obj) {
          if (obj[k] && typeof obj[k] === 'object') {
            const found = findValue(obj[k], keys.filter(k => !k.includes('.')));
            if (found !== undefined) return found;
          }
        }
        return undefined;
      };

      const statusKeys = [
        'status', 'transaction_status', 'event', 'venda_status', 'status_venda', 'situacao', 
        'payment_status', 'state', 'situacao_pagamento', 'venda.status', 'data.status',
        'venda.situacao', 'data.situacao', 'venda.workflow_status', 'data.workflow_status'
      ];
      const emailKeys = [
        'customer_email', 'email', 'comprador_email', 'email_comprador', 'cliente_email', 
        'payer_email', 'user_email', 'email_contato', 'contato_email', 
        'venda.cliente.email', 'data.customer.email', 'venda.customer.email', 'data.email',
        'customer.email', 'cliente.email', 'metadata.email'
      ];
      const idKeys = [
        'external_id', 'ext_id', 'customer_id', 'metadata.external_id', 'reference', 'ref', 
        'custom_id', 'client_id', 'pedido_id', 'transacao_id', 'id_externo', 'venda.external_id', 
        'data.external_id', 'venda_id', 'data.id'
      ];

      const status = findValue(payload, statusKeys);
      let email = findValue(payload, emailKeys);
      let externalId = findValue(payload, idKeys);
      
      // Extraction fallback from checkoutUrl if present in payload
      if (!externalId && payload.data?.checkoutUrl) {
        try {
          const url = new URL(payload.data.checkoutUrl);
          externalId = url.searchParams.get('external_id') || url.searchParams.get('ext_id');
          console.log(`[Webhook] Extracted ExtID from checkoutUrl: ${externalId}`);
        } catch (e) {
          console.warn('[Webhook] Failed to parse checkoutUrl for externalId');
        }
      }
      
      // Log for debugging
      console.log(`[Webhook] Extraction: Status=${status}, Event=${payload.event}, Email=${email}, ExtID=${externalId}`);

      // Special check for nested metadata or params
      if (!externalId) {
        externalId = payload.metadata?.external_id || payload.params?.external_id || payload.data?.external_id || payload.external_id || payload.venda?.customer?.external_id;
      }
      
      if (!email) {
        const nestedEmail = payload.venda?.customer?.email || payload.data?.customer?.email || payload.data?.email;
        if (nestedEmail) email = nestedEmail;
      }

      // Statuses that represent a successful payment
      const successStatuses = [
        'paid', 'approved', 'completed', 'verified', 'confirmed',
        'pago', 'sucesso', 'aprovado', 'active', 'pago_sucesso', '1',
        'finalized', 'concluded', 'success', 'paga', 'pagamento_confirmado',
        'purchase_approved', 'venda_aprovada'
      ];
      
      const statusStr = String(status || '').toLowerCase();
      const eventStr = String(payload.event || '').toLowerCase();
      const isApproved = successStatuses.includes(statusStr) || successStatuses.includes(eventStr);

      console.log(`[Webhook] Verdict: isApproved=${isApproved} (Status: ${statusStr}, Event: ${eventStr})`);

      if (isApproved && (email || externalId) && firestore) {
        console.log(`[Webhook] Processing approved payment for Email: ${email}, ExtID: ${externalId}`);
        try {
          let userDoc: admin.firestore.DocumentReference | null = null;
          
          if (externalId && String(externalId).length > 5) {
            const ref = firestore.collection('users').doc(String(externalId));
            const snap = await ref.get();
            if (snap.exists) {
              console.log(`[Webhook] Found user by ExtID: ${externalId}`);
              userDoc = ref;
            } else {
              console.log(`[Webhook] No user found with ID ${externalId}, will create/search by email`);
            }
          }
          
          if (!userDoc && email) {
            console.log(`[Webhook] Searching user by email: ${email}`);
            const snap = await firestore.collection('users')
              .where('email', '==', String(email).trim().toLowerCase())
              .limit(1)
              .get();
            if (!snap.empty) {
              console.log(`[Webhook] Found user by email: ${email}`);
              userDoc = snap.docs[0].ref;
            }
          }
          
          const now = new Date();
          const oneYearFromNow = new Date();
          oneYearFromNow.setFullYear(now.getFullYear() + 1);

          if (userDoc) {
            await userDoc.update({
              role: 'premium',
              subscriptionStatus: 'active',
              isPremium: true,
              subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(oneYearFromNow),
              paidExpiresAt: admin.firestore.Timestamp.fromDate(oneYearFromNow),
              trialExpiresAt: null,
              trialStartedAt: null,
              paidAt: admin.firestore.Timestamp.fromDate(now),
              updatedAt: admin.firestore.Timestamp.fromDate(now)
            });
            console.log(`[Webhook] Successfully upgraded user ${email || externalId} to Premium`);
            return res.status(200).json({ success: true, message: 'User upgraded' });
          } else {
            console.log(`[Webhook] User ${email || externalId} not found, creating placeholder...`);
            const placeholderId = externalId ? String(externalId) : (String(email).toLowerCase().replace(/[^a-z0-9]/g, '_') + '_p');
            await firestore.collection('users').doc(placeholderId).set({
              email: String(email || '').toLowerCase(),
              role: 'premium',
              subscriptionStatus: 'active',
              isPremium: true,
              subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(oneYearFromNow),
              paidExpiresAt: admin.firestore.Timestamp.fromDate(oneYearFromNow),
              paidAt: admin.firestore.Timestamp.fromDate(now),
              updatedAt: admin.firestore.Timestamp.fromDate(now),
              createdAt: admin.firestore.Timestamp.fromDate(now)
            }, { merge: true });
            console.log(`[Webhook] Created placeholder with ID: ${placeholderId}`);
            return res.status(200).json({ success: true, message: 'Placeholder created' });
          }
        } catch (error) {
          console.error('[Webhook] Internal processing error:', error);
          return res.status(500).json({ error: 'Processing error' });
        }
      } else {
        console.warn(`[Webhook] Payment not approved or data missing: Status=${status}, Event=${payload.event}, Email=${email}, ExtID=${externalId}`);
        return res.status(200).json({ success: false, message: 'Not approved or missing info' });
      }
    } catch (error) {
      console.error('[Webhook] Endpoint error:', error);
      res.status(500).json({ error: 'Internal server error' });
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
