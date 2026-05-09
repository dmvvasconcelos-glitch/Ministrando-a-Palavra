export type BibleVersion = 'ARA' | 'ARC' | 'NVI' | 'KJV';

export interface Sermon {
  id: string;
  ownerId: string;
  title: string;
  theme: string;
  date: any; // Firestore Timestamp
  event: string;
  content: string;
  status: 'draft' | 'published' | 'preached';
  createdAt: any;
  updatedAt: any;
  tags: string[];
  sharedWith?: Record<string, 'view' | 'edit'>;
}

export interface UserProfile {
  uid: string;
  email?: string;
  displayName: string;
  fullName?: string;
  birthDate?: string;
  newBirthDate?: string;
  denomination?: string;
  presidentPastor?: string;
  photoURL?: string;
  geminiApiKey?: string;
  role?: 'admin' | 'user';
  subscriptionStatus?: 'trial' | 'active' | 'expired';
  trialExpiresAt?: any;
  trialDuration?: number;
  paidExpiresAt?: any;
  subscriptionExpiresAt?: any;
  deviceInfo?: {
    model?: string;
    os?: string;
    browser?: string;
    platform?: string;
  };
  locationInfo?: {
    neighborhood?: string;
    city?: string;
    state?: string;
    country?: string;
    ip?: string;
    latitude?: number;
    longitude?: number;
  };
  lastLogin?: any;
  isBlocked?: boolean;
  createdAt?: any;
  updatedAt: any;
  fcmToken?: string;
  notificationsEnabled?: boolean;
  defaultNotify24h?: boolean;
  defaultNotifyDayOf?: boolean;
}

export interface Highlight {
  id: string;
  userId: string;
  verseReference: string;
  text: string;
  color: string;
  createdAt: any;
}

export interface AgendaItem {
  id: string;
  userId: string;
  title: string;
  description: string;
  location?: string;
  address?: string;
  date: any;
  type: 'culto' | 'celula' | 'congresso' | 'extra' | 'preaching';
  createdAt: any;
  notify24h?: boolean;
  notifyDayOf?: boolean;
  notified24h?: boolean;
  notifiedDayOf?: boolean;
  source?: 'event' | 'preaching';
  isPreaching?: boolean;
  sermonId?: string;
  guestId?: string;
  guestName?: string;
  userName?: string;
  userEmail?: string;
}

export interface BibleVerse {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  version: BibleVersion;
}

export interface Birthday {
  id: string;
  userId: string;
  name: string;
  date: string; // YYYY-MM-DD
  relationship?: string;
  createdAt: any;
}

export interface ContactMessage {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  message: string;
  createdAt: any;
  repliedAt?: any;
  replyMessage?: string;
  status: 'pending' | 'replied';
  archived?: boolean;
  archivedBy?: 'user' | 'admin';
}
