import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { initializeApp as initializeClientApp } from 'firebase/app';
import { 
  getFirestore as getClientFirestore, 
  collection, 
  getDocs, 
  limit, 
  query, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc, 
  where, 
  setDoc,
  deleteDoc,
  Timestamp as ClientTimestamp,
  type Firestore as ClientFirestore
} from 'firebase/firestore';
import admin from 'firebase-admin';
import { initializeApp as initializeAdminApp, getApps, App } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { getAuth, Auth } from 'firebase-admin/auth';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

// Early environment setup
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig: any = {};
if (fs.existsSync(configPath)) {
  try { firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (e) {}
}

const TARGET_PROJECT = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
if (TARGET_PROJECT) {
  process.env.GOOGLE_CLOUD_PROJECT = TARGET_PROJECT;
  process.env.GCP_PROJECT = TARGET_PROJECT;
}

// Firebase Instances
let firestore: any = null;
let messaging: Messaging | null = null;
let authAdmin: Auth | null = null;
let firebaseAdminApp: App | null = null;
let firebaseClientApp: any = null;

// Helper to ensure Firestore is initialized
async function safeGetFirestore() {
  if (firestore) return firestore;
  await initializeFirebase();
  return firestore;
}

async function initializeFirebase() {
  if (firestore) return;
  try {
    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId;

    // 1. Initialize admin for Auth/Messaging/Firestore
    if (getApps().length === 0) {
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
      const privateKey = privateKeyRaw?.replace(/\\n/g, '\n');

      if (clientEmail && privateKey && projectId) {
        firebaseAdminApp = initializeAdminApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
          projectId
        });
      } else {
        firebaseAdminApp = initializeAdminApp({ 
          credential: admin.credential.applicationDefault(),
          projectId: projectId
        });
      }
    } else {
      firebaseAdminApp = getApps()[0];
    }
    
    if (firebaseAdminApp) {
      messaging = getMessaging(firebaseAdminApp);
      authAdmin = getAuth(firebaseAdminApp);

      // Attempt to initialize Admin Firestore - it bypasses Security Rules
      try {
        console.log(`[Firebase] Connecting Admin Firestore (Project: ${projectId}, Database: ${databaseId || '(default)'})`);
        const adminFs = new admin.firestore.Firestore({
          projectId,
          databaseId: (databaseId && databaseId !== '(default)') ? databaseId : undefined,
        });
        
        // Final verification probe
        await adminFs.collection('webhook_logs').limit(1).get();
        console.log('[Firebase] Admin Firestore SUCCESS');
        firestore = adminFs;
      } catch (adminErr: any) {
        console.warn(`[Firebase] Admin Firestore failed: ${adminErr.message}`);
        
        // Fallback to Client SDK if Admin lacks IAM permissions
        if (firebaseConfig.apiKey) {
          console.log('[Firebase] Falling back to Client SDK...');
          if (!firebaseClientApp) {
            firebaseClientApp = initializeClientApp(firebaseConfig);
          }
          firestore = getClientFirestore(firebaseClientApp, databaseId);
        }
      }
    }
  } catch (err) {
    console.error('[Firebase] Failed to initialize Firebase:', err);
  }
}

// Ensure startup
initializeFirebase();


// Middleware to verify Firebase Auth Token
const authenticateAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    if (!authAdmin) throw new Error('Firebase Auth not initialized');
    const decodedToken = await authAdmin.verifyIdToken(idToken);
    
    // Check if the user is an admin
    const isAdminEmail = decodedToken.email?.toLowerCase() === 'dmv.vasconcelos@gmail.com';
    let isFirestoreAdmin = false;

    const fs = await safeGetFirestore();
    if (!isAdminEmail && fs) {
      if ('collection' in fs && typeof (fs as any).collection === 'function') {
        const userSnap = await (fs as any).collection('users').doc(decodedToken.uid).get();
        isFirestoreAdmin = userSnap.data()?.role === 'admin';
      } else {
        const userSnap = await getDoc(doc(fs, 'users', decodedToken.uid));
        isFirestoreAdmin = userSnap.data()?.role === 'admin';
      }
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

// Firestore Wrappers to support both Admin and Client SDKs
async function dbGetDoc(fs: any, colPath: string, docId: string) {
  if (typeof fs.doc === 'function') return await fs.doc(`${colPath}/${docId}`).get();
  return await getDoc(doc(fs, colPath, docId));
}

async function dbUpdateDoc(ref: any, data: any) {
  if (typeof ref.update === 'function') return await ref.update(data);
  return await updateDoc(ref, data);
}

async function dbAddDoc(colRef: any, data: any) {
  if (typeof colRef.add === 'function') return await colRef.add(data);
  return await addDoc(colRef, data);
}

async function dbSetDoc(ref: any, data: any, options?: any) {
  if (typeof ref.set === 'function') return await ref.set(data, options);
  return await setDoc(ref, data, options);
}

// Background check for notifications
async function checkNotifications() {
  const currentFirestore = await safeGetFirestore();
  if (!currentFirestore) {
    console.warn('[Notifications] Firestore not initialized yet, skipping check.');
    return;
  }
  
  console.log('[Notifications] Checking notifications...');
  
  try {
    const now = new Date();
    const future24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const soon = new Date(now.getTime() + 30 * 60 * 1000); // 30 mins before

    // Handle Query for both SDKs
    let q24hDocs: any[] = [];
    let qDayDocs: any[] = [];

    if (typeof currentFirestore.collection === 'function') {
      // Admin SDK
      const q24h = await currentFirestore.collection('ministerial_agenda')
        .where('notify24h', '==', true)
        .where('notified24h', '==', false)
        .get();
      q24hDocs = q24h.docs;

      const qDay = await currentFirestore.collection('ministerial_agenda')
        .where('notifyDayOf', '==', true)
        .where('notifiedDayOf', '==', false)
        .get();
      qDayDocs = qDay.docs;
    } else {
      // Client SDK
      const agendaRef = collection(currentFirestore, 'ministerial_agenda');
      const q24hQuery = query(agendaRef, where('notify24h', '==', true), where('notified24h', '==', false));
      const q24h = await getDocs(q24hQuery);
      q24hDocs = q24h.docs;

      const qDayQuery = query(agendaRef, where('notifyDayOf', '==', true), where('notifiedDayOf', '==', false));
      const qDay = await getDocs(qDayQuery);
      qDayDocs = qDay.docs;
    }
    
    // Process 24h reminders
    for (const d of q24hDocs) {
      try {
        const event = d.data();
        if (!event.date) continue;
        const eventDate = typeof event.date.toDate === 'function' ? event.date.toDate() : new Date(event.date);
        
        if (eventDate <= future24h && eventDate >= now) {
          await sendPushNotification(event.userId, {
            title: 'Lembrete: Evento em 24h',
            body: `${event.title} amanhã às ${event.time || ''}`,
          });
          await dbUpdateDoc(d.ref, { notified24h: true });
        }
      } catch (e: any) {
        console.warn('[Notifications] Error processing 24h doc:', e.message);
      }
    }

    // Process Day-of reminders
    for (const d of qDayDocs) {
      try {
        const event = d.data();
        if (!event.date) continue;
        const eventDate = typeof event.date.toDate === 'function' ? event.date.toDate() : new Date(event.date);

        if (eventDate <= soon && eventDate >= now) {
          await sendPushNotification(event.userId, {
            title: 'Seu evento está começando!',
            body: `${event.title} em breve às ${event.time || ''}`,
          });
          await dbUpdateDoc(d.ref, { notifiedDayOf: true });
        }
      } catch (e: any) {
        console.warn('[Notifications] Error processing day-of doc:', e.message);
      }
    }
  } catch (err: any) {
    console.error('[Notifications] Error in notification background task:', err.message);
  }
}

async function sendPushNotification(userId: string, payload: { title: string; body: string }) {
  const currentFirestore = await safeGetFirestore();
  if (!currentFirestore || !messaging) return;
  
  try {
    const userSnap = await dbGetDoc(currentFirestore, 'users', userId);
    const userData = userSnap.data();
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

      // Ensure Firestore is initialized
      const fs = await safeGetFirestore();

      // ALWAYS store in Firestore for debugging
      if (fs) {
        try {
          const logData = {
            receivedAt: typeof fs.app === 'undefined' ? ClientTimestamp.fromDate(new Date()) : new Date(),
            payload: payload || { empty: true },
            headers: req.headers,
            source: 'external_gateway_test'
          };
          
          if (typeof fs.collection === 'function') {
            await fs.collection('webhook_logs').add(logData);
          } else {
            await addDoc(collection(fs, 'webhook_logs'), logData);
          }
          console.log('[Webhook] Log saved successfully');
        } catch (e: any) {
          console.error('[Webhook] Error saving log:', e.message || e);
        }
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

      if (isApproved && (email || externalId) && fs) {
        console.log(`[Webhook] Processing approved payment for Email: ${email}, ExtID: ${externalId}`);
        try {
          let userDocRef: any = null;
          let userSnap: any = null;
          
          if (externalId && String(externalId).length > 5) {
            if (typeof fs.doc === 'function') {
              userDocRef = fs.doc(`users/${String(externalId)}`);
              userSnap = await userDocRef.get();
            } else {
              userDocRef = doc(fs, 'users', String(externalId));
              userSnap = await getDoc(userDocRef);
            }

            if (userSnap.exists && (typeof userSnap.exists === 'function' ? userSnap.exists() : userSnap.exists)) {
              console.log(`[Webhook] Found user by ExtID: ${externalId}`);
            } else {
              console.log(`[Webhook] No user found with ID ${externalId}, will create/search by email`);
              userDocRef = null;
            }
          }
          
          if (!userDocRef && email) {
            console.log(`[Webhook] Searching user by email: ${email}`);
            const emailLower = String(email).trim().toLowerCase();
            
            if (typeof fs.collection === 'function') {
              const snap = await fs.collection('users').where('email', '==', emailLower).limit(1).get();
              if (!snap.empty) {
                userDocRef = snap.docs[0].ref;
                console.log(`[Webhook] Found user by email: ${email}`);
              }
            } else {
              const q = query(collection(fs, 'users'), where('email', '==', emailLower), limit(1));
              const snap = await getDocs(q);
              if (!snap.empty) {
                userDocRef = snap.docs[0].ref;
                console.log(`[Webhook] Found user by email: ${email}`);
              }
            }
          }
          
          const now = new Date();
          const oneYearFromNow = new Date();
          oneYearFromNow.setFullYear(now.getFullYear() + 1);
          
          const isClient = typeof fs.app === 'undefined';
          const timestamp = isClient ? ClientTimestamp.fromDate(now) : now;
          const expiryTs = isClient ? ClientTimestamp.fromDate(oneYearFromNow) : oneYearFromNow;

          if (userDocRef) {
            const updateData = {
              role: 'premium',
              subscriptionStatus: 'active',
              isPremium: true,
              subscriptionExpiresAt: expiryTs,
              paidExpiresAt: expiryTs,
              trialExpiresAt: null,
              trialStartedAt: null,
              paidAt: timestamp,
              updatedAt: timestamp
            };

            if (typeof userDocRef.update === 'function') {
              await userDocRef.update(updateData);
            } else {
              await updateDoc(userDocRef, updateData);
            }
            console.log(`[Webhook] Successfully upgraded user ${email || externalId} to Premium`);
            return res.status(200).json({ success: true, message: 'User upgraded' });
          } else {
            console.log(`[Webhook] User ${email || externalId} not found, creating placeholder...`);
            const placeholderId = externalId ? String(externalId) : (String(email).toLowerCase().replace(/[^a-z0-9]/g, '_') + '_p');
            
            const placeholderData = {
              email: String(email || '').toLowerCase(),
              role: 'premium',
              subscriptionStatus: 'active',
              isPremium: true,
              subscriptionExpiresAt: expiryTs,
              paidExpiresAt: expiryTs,
              paidAt: timestamp,
              updatedAt: timestamp,
              createdAt: timestamp
            };

            if (typeof fs.doc === 'function') {
              await fs.doc(`users/${placeholderId}`).set(placeholderData, { merge: true });
            } else {
              const ref = doc(fs, 'users', placeholderId);
              await setDoc(ref, placeholderData, { merge: true });
            }
            console.log(`[Webhook] Created placeholder with ID: ${placeholderId}`);
            return res.status(200).json({ success: true, message: 'Placeholder created' });
          }
        } catch (error) {
          console.error('[Webhook] Internal processing error:', error);
          return res.status(500).json({ error: 'Processing error', details: error instanceof Error ? error.message : String(error) });
        }
      } else {
        console.warn(`[Webhook] Payment not approved or data missing: Status=${status}, Event=${payload.event}, Email=${email}, ExtID=${externalId}`);
        return res.status(200).json({ 
          success: false, 
          message: 'Not approved or missing info',
          debug: {
            isApproved,
            hasEmail: !!email,
            hasExtId: !!externalId,
            hasFirestore: !!fs,
            hasConfig: !!firebaseConfig.projectId,
            configProjectId: firebaseConfig.projectId,
            extractedStatus: status,
            extractedEmail: email,
            extractedExtId: externalId,
            event: payload.event
          }
        });
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
      if (!authAdmin) throw new Error('Firebase Auth not initialized');
      await authAdmin.deleteUser(uid);
      
      // Delete from Firestore
      const fs = await safeGetFirestore();
      if (fs) {
        await deleteDoc(doc(fs, 'users', uid));
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
