import { useState, useEffect, useRef } from 'react';
import { 
  Save, Trash2, ArrowLeft, Eye, Edit3, BookMarked, Tag, Trash, FileText, 
  Highlighter, Palette, Type, CaseSensitive, ChevronDown, Share2, MessageSquare, X,
  Users, Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Eraser, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { marked } from 'marked';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Sermon } from '../types';
import AudioRecorder from './AudioRecorder';
import ShareModal from './ShareModal';
import { useLanguage } from '../contexts/LanguageContext';
import { getAIUsageCount, MAX_INDIVIDUAL_AI_REQUESTS, MAX_SHARED_AI_REQUESTS } from '../services/gemini';
import { UserProfile } from '../types';

interface SermonEditorProps {
  profile: UserProfile | null;
  sermonId: string | null;
  pendingOutline?: string | null;
  onClearPendingOutline?: () => void;
  onSaved: () => void;
  onIdChange?: (id: string) => void;
}

export default function SermonEditor({ 
  profile,
  sermonId, 
  pendingOutline, 
  onClearPendingOutline, 
  onSaved, 
  onIdChange 
}: SermonEditorProps) {
  const { t, language } = useLanguage();
  const [activeId, setActiveId] = useState<string | null>(sermonId);
  const [sermon, setSermon] = useState<Sermon | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!sermonId);
  const [titleError, setTitleError] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<any>(null);
  const [isHolding, setIsHolding] = useState(false);
  
  const isOwner = !activeId || auth.currentUser?.uid === sermon?.ownerId;
  const canEdit = !activeId || isOwner || sermon?.sharedWith?.[auth.currentUser?.uid || ''] === 'edit';

  // Fetch usage
  useEffect(() => {
    const fetchUsage = async () => {
      const count = await getAIUsageCount();
      setUsageCount(count);
    };
    fetchUsage();
  }, []);

  // Draft key varies if editing existing or new
  const draftKey = activeId ? `sermon-draft-${activeId}` : 'sermon-draft-new';

  const [conflictDraft, setConflictDraft] = useState<{
    title: string;
    theme: string;
    content: string;
    updatedAt: string;
    isNew: boolean;
  } | null>(null);

  const loadSermon = async (id: string) => {
    try {
      const d = await getDoc(doc(db, 'sermons', id));
      if (d.exists()) {
        const s = d.data() as Sermon;
        setSermon({ ...s, id: d.id });
        
        // Always load server data by default to the editor
        setTitle(s.title || '');
        setTheme(s.theme || '');
        setContent(s.content || '');
        if (editorRef.current) {
          editorRef.current.innerHTML = s.content || '';
        }

        // Check for local draft
        const savedDraft = localStorage.getItem(`sermon-draft-${id}`);
        if (savedDraft) {
          const draft = JSON.parse(savedDraft);
          const serverTime = s.updatedAt?.toMillis() || 0;
          const localTime = new Date(draft.updatedAt).getTime();

          // If local draft is significantly newer (more than 2 seconds) or content is different
          if (localTime > serverTime + 2000) {
            setConflictDraft({ ...draft, isNew: false });
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setActiveId(sermonId);
  }, [sermonId]);

  useEffect(() => {
    if (!activeId) {
      const savedDraft = localStorage.getItem('sermon-draft-new');
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        setTitle(draft.title || '');
        setTheme(draft.theme || '');
        setContent(draft.content || '');
        if (editorRef.current) {
          editorRef.current.innerHTML = draft.content || '';
        }
        // No banner for new drafts, just load them automatically as they are intended to remain
      }
      setLoading(false);
      return;
    }

    loadSermon(activeId);
  }, [activeId]);

  // Handle pending outline from AI Assistant
  useEffect(() => {
    if (pendingOutline && !loading) {
      const convertMarkdownToHtml = async () => {
        try {
          const html = await marked.parse(pendingOutline);
          
          setContent(prev => {
            const newContent = prev + html;
            if (editorRef.current) {
              editorRef.current.innerHTML = newContent;
            }
            return newContent;
          });
          
          onClearPendingOutline?.();
        } catch (err) {
          console.error('Error converting markdown:', err);
          // Fallback simple conversion
          const formattedOutline = pendingOutline
            .split('\n')
            .map(line => line.startsWith('#') ? `<h2>${line.replace(/#/g, '').trim()}</h2>` : `<p>${line}</p>`)
            .join('');
          
          setContent(prev => {
            const newContent = prev + formattedOutline;
            if (editorRef.current) {
              editorRef.current.innerHTML = newContent;
            }
            return newContent;
          });
          onClearPendingOutline?.();
        }
      };

      convertMarkdownToHtml();
    }
  }, [pendingOutline, loading, onClearPendingOutline]);

  const applyDraft = () => {
    if (!conflictDraft) return;
    setTitle(conflictDraft.title);
    setTheme(conflictDraft.theme);
    setContent(conflictDraft.content);
    if (editorRef.current) {
      editorRef.current.innerHTML = conflictDraft.content;
    }
    setConflictDraft(null);
  };

  const discardDraft = () => {
    if (conflictDraft?.isNew) {
      setTitle('');
      setTheme('');
      setContent('');
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
      }
    }
    localStorage.removeItem(draftKey);
    setConflictDraft(null);
  };

  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [notePopup, setNotePopup] = useState<{ x: number, y: number, text: string, anchor: HTMLElement | null } | null>(null);

  // Auto-save draft to local storage then firestore
  useEffect(() => {
    if (loading || saving || !canEdit || conflictDraft) return;

    const handler = setTimeout(async () => {
      const actualContent = editorRef.current ? editorRef.current.innerHTML : content;
      
      // Don't save if everything is empty
      if (!title.trim() && !theme.trim() && (!actualContent || actualContent === '<br>')) return;

      const draft = {
        title,
        theme,
        content: actualContent,
        updatedAt: new Date().toISOString()
      };
      
      localStorage.setItem(draftKey, JSON.stringify(draft));
      setLastAutoSave(new Date());

      if (auth.currentUser) {
        try {
          const idToSave = activeId || `sermon_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          const isNew = !activeId;

          const updateData: any = {
            title,
            theme,
            content: actualContent,
            updatedAt: serverTimestamp(),
          };
          
          if (isNew) {
            updateData.ownerId = auth.currentUser.uid;
            updateData.createdAt = serverTimestamp();
            updateData.status = 'draft';
            updateData.tags = [];
            updateData.sharedWith = {};
          } else if (!sermon?.status || sermon.status === 'draft') {
            updateData.status = 'draft';
          }
          
          await setDoc(doc(db, 'sermons', idToSave), updateData, { merge: true });
          
          if (isNew) {
            setActiveId(idToSave);
            onIdChange?.(idToSave);
            setSermon({ 
              id: idToSave, 
              ownerId: auth.currentUser.uid, 
              status: 'draft',
              title,
              theme,
              content: actualContent,
              createdAt: new Date(),
              updatedAt: new Date(),
              tags: []
            } as any);
            // Move local draft to the specific key
            localStorage.removeItem('sermon-draft-new');
            localStorage.setItem(`sermon-draft-${idToSave}`, JSON.stringify(draft));
          }
        } catch (err) {
          console.error("Auto-save error:", err);
        }
      }
    }, 2000); 

    return () => clearTimeout(handler);
  }, [title, theme, content, draftKey, loading, saving, activeId, canEdit, sermon, conflictDraft]);

  // Sync state to editor ref once after mount or when loading/mode/content changes
  useEffect(() => {
    if (mode === 'edit' && editorRef.current && !loading && !conflictDraft) {
      // Force sync content to ref if ref is empty or different
      if (editorRef.current.innerHTML !== content) {
        editorRef.current.innerHTML = content || '';
      }
    }
  }, [mode, loading, activeId, content, conflictDraft]);

  const handleSave = async () => {
    if (!title.trim()) {
      setTitleError(true);
      const titleInput = document.getElementById('editor-title');
      if (titleInput) {
        titleInput.focus();
      }
      return;
    }
    if (!auth.currentUser || !canEdit) return;
    setSaving(true);
    try {
      const currentContent = editorRef.current ? editorRef.current.innerHTML : content;
      const id = activeId || `sermon_${Date.now()}`;
      
      const saveData: any = {
        title,
        theme,
        content: currentContent,
        updatedAt: serverTimestamp(),
        status: 'published',
        tags: sermon?.tags || []
      };

      if (!activeId) {
        saveData.ownerId = auth.currentUser.uid;
        saveData.createdAt = serverTimestamp();
        saveData.sharedWith = {};
      }
      
      await setDoc(doc(db, 'sermons', id), saveData, { merge: true });
      
      if (!activeId) {
        onIdChange?.(id);
      }

      if (sermon) {
        setSermon({ ...sermon, status: 'published', updatedAt: new Date() });
      }
      
      localStorage.removeItem(draftKey);
      onSaved();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const applyStyle = (command: string, value: string) => {
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, value);
    
    if (editorRef.current) {
      editorRef.current.focus();
      setContent(editorRef.current.innerHTML);
    }
  };

  const handleHighlight = (color: string) => {
    if (color === 'transparent') {
      document.execCommand('styleWithCSS', false, 'false'); // Avoid complex CSS when clearing
      document.execCommand('removeFormat', false, undefined);
      document.execCommand('hiliteColor', false, 'transparent');
      document.execCommand('backColor', false, 'transparent');
      document.execCommand('foreColor', false, '#cbd5e1');
      if (editorRef.current) {
        editorRef.current.focus();
        setContent(editorRef.current.innerHTML);
      }
    } else {
      applyStyle('hiliteColor', color);
    }
  };

  const handleColor = (color: string) => {
    if (color === 'transparent') {
      document.execCommand('foreColor', false, '#cbd5e1');
      if (editorRef.current) {
        editorRef.current.focus();
        setContent(editorRef.current.innerHTML);
      }
    } else {
      applyStyle('foreColor', color);
    }
  };
  
  const handleFontFamily = (font: string) => applyStyle('fontName', font);
  const handleFontSize = (size: string) => {
    const sizeMap: Record<string, string> = {
      '14px': '2',
      '16px': '3',
      '18px': '4',
      '24px': '5',
      '32px': '6',
      '48px': '7'
    };
    applyStyle('fontSize', sizeMap[size] || '3');
  };

  const [activeStyles, setActiveStyles] = useState<{
    bold: boolean;
    italic: boolean;
    underline: boolean;
  }>({ bold: false, italic: false, underline: false });

  const checkStyles = () => {
    setActiveStyles({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline')
    });
  };

  const handleEditorInput = () => {
    if (editorRef.current) {
      setContent(editorRef.current.innerHTML);
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = async () => {
    const idToDelete = activeId || sermonId;
    if (!idToDelete) return;
    
    // Safety check: Don't allow deletion if we are absolutely sure we're not the owner
    // Unless it's a new unsaved sermon (activeId/sermonId would be null then, which we check above)
    if (sermon && auth.currentUser?.uid !== sermon.ownerId) {
      alert(t('noPermissionToDelete'));
      return;
    }

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'sermons', idToDelete));
      localStorage.removeItem(draftKey);
      onSaved();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `sermons/${idToDelete}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const [holdProgress, setHoldProgress] = useState(0);
  const holdIntervalRef = useRef<any>(null);
  const [noteModal, setNoteModal] = useState<{ 
    isOpen: boolean, 
    selectionRange: Range | null, 
    highlight: HTMLElement | null,
    isEditing?: boolean
  }>({
    isOpen: false,
    selectionRange: null,
    highlight: null,
    isEditing: false
  });
  const [noteValue, setNoteValue] = useState('');

  const handleEditorMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'edit' || noteModal.isOpen) return;
    
    setHoldProgress(0);
    let counter = 0;
    const duration = 20; 
    
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    
    holdIntervalRef.current = setInterval(() => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim() !== '') {
        counter++;
        setHoldProgress((counter / duration) * 100);
        
        if (counter >= duration) {
          clearInterval(holdIntervalRef.current);
          holdIntervalRef.current = null;
          setHoldProgress(0);
          handleAddNote();
        }
      } else {
        counter = 0;
        setHoldProgress(0);
      }
    }, 100);
  };

  const handleEditorMouseUp = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldProgress(0);
  };

  const handleAddNote = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || selection.toString().trim() === '') {
      if (!holdIntervalRef.current) {
        alert(t('selectTextToNote'));
      }
      return;
    }

    const range = selection.getRangeAt(0).cloneRange();
    const highlight = document.createElement('span');
    highlight.className = 'selection-highlight bg-indigo-500/30 ring-2 ring-indigo-500/50 rounded-sm transition-all duration-300';
    
    try {
      range.surroundContents(highlight);
    } catch (err) {
      const fragment = range.extractContents();
      highlight.appendChild(fragment);
      range.insertNode(highlight);
    }

    // Open modal instead of prompt
    setNoteValue('');
    setNoteModal({
      isOpen: true,
      selectionRange: range,
      highlight: highlight
    });
  };

  const confirmNote = () => {
    if (!noteValue.trim()) {
      if (noteModal.isEditing) {
        // If editing and cleared, maybe we keep it or delete it? 
        // User probably expects it to be saved as empty or they can just not save.
        // Let's just cancel if empty during edit too.
        cancelNote();
      } else {
        cancelNote();
      }
      return;
    }

    const { highlight, isEditing } = noteModal;
    if (highlight) {
      if (isEditing) {
        // Update existing note
        highlight.dataset.note = noteValue;
        highlight.title = noteValue;
      } else {
        // Create new note
        const noteSpan = document.createElement('span');
        noteSpan.className = 'personal-note-trigger personal-note-added-anim';
        noteSpan.dataset.note = noteValue;
        noteSpan.title = noteValue;
        noteSpan.setAttribute('contenteditable', 'false');
        
        const parent = highlight.parentNode;
        if (parent) {
          while (highlight.firstChild) {
            noteSpan.appendChild(highlight.firstChild);
          }
          parent.replaceChild(noteSpan, highlight);
        }
        
        setTimeout(() => noteSpan.classList.remove('personal-note-added-anim'), 600);
      }

      if (editorRef.current) {
        setContent(editorRef.current.innerHTML);
      }
    }
    
    setNoteModal({ isOpen: false, selectionRange: null, highlight: null, isEditing: false });
  };

  const cancelNote = () => {
    const { highlight, isEditing } = noteModal;
    if (highlight && !isEditing) {
      // Only rollback if it was a NEW highlight (not yet a note)
      const parent = highlight.parentNode;
      if (parent) {
        while (highlight.firstChild) {
          parent.insertBefore(highlight.firstChild, highlight);
        }
        parent.removeChild(highlight);
      }
    }
    setNoteModal({ isOpen: false, selectionRange: null, highlight: null, isEditing: false });
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const noteEl = target.closest('.personal-note-trigger') as HTMLElement;
    
    if (noteEl && noteEl.dataset.note) {
      // Toggle for edit if in edit mode
      if (mode === 'edit') {
        setNoteValue(noteEl.dataset.note);
        setNoteModal({
          isOpen: true,
          selectionRange: null,
          highlight: noteEl,
          isEditing: true
        });
        return;
      }

      const rect = noteEl.getBoundingClientRect();
      setNotePopup({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
        text: noteEl.dataset.note,
        anchor: noteEl
      });
    } else {
      setNotePopup(null);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      alert(t('toolLinkCopied'));
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  const handleExitWithoutSaving = () => {
    if (confirm(t('exitWithoutSaving'))) {
      localStorage.removeItem(draftKey);
      onSaved();
    }
  };

  const handleTranscription = (text: string) => {
    const formattedText = `<br><br>${text}`;
    setContent(prev => prev + formattedText);
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">{t('loadingMinistry')}</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-app-border/60">
        <div className="flex items-center gap-4 sm:gap-5">
          <button 
            onClick={onSaved} 
            className="group flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-app-card hover:bg-app-card/60 rounded-2xl text-app-secondary hover:text-app-text transition-all active:scale-95 border border-app-border shrink-0 shadow-sm"
            title={t('back')}
          >
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </button>
          <div className="space-y-0.5 sm:space-y-1 overflow-hidden relative pl-4">
            <div className="absolute left-0 top-1 bottom-1 w-1 bg-indigo-500 rounded-full opacity-60" />
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-app-text truncate uppercase lg:normal-case">
              {activeId ? t('editSermon') : t('newMinistration')}
            </h2>
            <div className="flex items-center gap-3">
              <p className="text-app-secondary text-[10px] sm:text-xs font-bold tracking-widest uppercase opacity-70 italic">{t('oficinaDaPalavra')}</p>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
                <Info size={10} className="text-indigo-400" />
                <span className="text-[9px] font-black uppercase text-indigo-400 tracking-tighter">
                  IA: {usageCount}/{profile?.geminiApiKey ? MAX_INDIVIDUAL_AI_REQUESTS : MAX_SHARED_AI_REQUESTS}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Audio Tool */}
          {canEdit && (
            <div className="flex-shrink-0 p-1 bg-app-card rounded-2xl border border-app-border shadow-sm hover:border-indigo-500/20 transition-colors">
              <AudioRecorder onTranscription={handleTranscription} />
            </div>
          )}

          {/* Mode Switcher Group */}
          <div className="flex-shrink-0 flex items-center p-1 bg-app-card rounded-2xl border border-app-border shadow-sm overflow-hidden">
            <button 
              onClick={() => {
                if (mode === 'preview' && editorRef.current) setContent(editorRef.current.innerHTML);
                setMode('edit');
              }}
              className={`flex items-center justify-center w-10 h-9 rounded-xl transition-all ${mode === 'edit' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-app-secondary hover:text-app-text hover:bg-app-bg'}`}
              title={t('editorTool')}
            >
              <Edit3 size={16} />
            </button>
            <div className="w-px h-4 bg-app-border mx-1" />
            <button 
              onClick={() => {
                if (mode === 'edit' && editorRef.current) setContent(editorRef.current.innerHTML);
                setMode('preview');
              }}
              className={`flex items-center justify-center w-10 h-9 rounded-xl transition-all ${mode === 'preview' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-app-secondary hover:text-app-text hover:bg-app-bg'}`}
              title={t('pulpitTool')}
            >
              <Eye size={16} />
            </button>
          </div>

          {/* Social / Sharing Group */}
          <div className="flex-shrink-0 flex items-center p-1 bg-app-card rounded-2xl border border-app-border shadow-sm">
            {sermonId && (
              <button 
                onClick={() => setIsShareModalOpen(true)}
                className="flex items-center justify-center w-9 h-9 rounded-xl text-indigo-500 hover:bg-indigo-500/10 transition-all"
                title={t('syncWithColleagues')}
              >
                <Users size={16} />
              </button>
            )}
            <button 
              onClick={handleShare}
              className="flex items-center justify-center w-9 h-9 rounded-xl text-app-secondary hover:bg-indigo-500/10 hover:text-indigo-500 transition-all"
              title={t('copyQuickLink')}
            >
              <Share2 size={16} />
            </button>
            
            {isOwner && sermonId && (
              <div className="flex items-center border-l border-app-border ml-1 pl-1">
                <AnimatePresence mode="wait">
                  {showDeleteConfirm ? (
                    <motion.div 
                      key="confirm"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex items-center gap-1 bg-rose-500/10 rounded-lg p-0.5 border border-rose-500/20"
                    >
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-2 py-2 text-[8px] font-black uppercase text-app-secondary hover:text-app-text"
                      >
                        {t('no')}
                      </button>
                      <button
                        onClick={handleDelete}
                        className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-[8px] font-black uppercase rounded-lg shadow-lg shadow-rose-600/20"
                      >
                        {t('yes')}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.button 
                      key="delete"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center justify-center w-9 h-9 rounded-xl text-app-secondary/40 hover:bg-rose-500/10 hover:text-rose-500 transition-all"
                      title={t('removeStudy')}
                    >
                      <Trash size={16} />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="h-10 w-px bg-app-border hidden lg:block mx-2" />

          {/* Primary Action Button */}
          {canEdit && (
            <button 
              id="btn-save-sermon"
              onClick={handleSave}
              disabled={saving}
              className={`flex-shrink-0 group flex items-center justify-center w-11 h-11 rounded-2xl ${saving ? 'bg-indigo-600/50' : 'bg-indigo-600 hover:bg-indigo-500'} text-white active:scale-95 transition-all shadow-xl shadow-indigo-600/30 border border-indigo-400/20`}
              title={saving ? t('publishing') : t('publish')}
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save size={18} className="group-hover:rotate-12 transition-transform" />
              )}
            </button>
          )}
        </div>
      </header>


      <div className="frosted-glass rounded-[32px] overflow-hidden min-h-[600px] flex flex-col relative shadow-2xl">
        <AnimatePresence>
          {conflictDraft && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-indigo-500/10 border-b border-indigo-500/20 overflow-hidden"
            >
              <div className="p-5 flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 border border-indigo-500/20 shadow-inner">
                    <FileText size={24} />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-black text-indigo-400 uppercase tracking-widest">
                      {conflictDraft.isNew ? t('sessionRestoration') : t('versionConflict')}
                    </h4>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed max-w-md">
                      {conflictDraft.isNew 
                        ? t('draftFoundMsg')
                        : t('versionConflictMsg')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {!conflictDraft.isNew && (
                    <button
                      onClick={applyDraft}
                      className="px-5 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 ring-1 ring-white/20"
                    >
                      {t('useLocal')}
                    </button>
                  )}
                  <button
                    onClick={discardDraft}
                    className="px-5 py-2.5 bg-app-card/40 border border-app-border text-app-secondary text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-app-card hover:text-app-text transition-all"
                  >
                    {conflictDraft.isNew ? t('discard') : t('useServer')}
                  </button>
                  {conflictDraft.isNew && (
                    <button
                      onClick={() => setConflictDraft(null)}
                      className="px-5 py-2.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-500/30 transition-all"
                    >
                      {t('ignore')}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {mode === 'edit' ? (
          <div className="flex flex-col flex-1">
            <div className="p-8 space-y-4 border-b border-app-border/60 bg-app-card/30 relative">
              {lastAutoSave && (
                <div className="absolute top-4 right-8 px-3 py-1 bg-app-bg/40 rounded-full border border-app-border text-[9px] text-app-secondary font-black uppercase tracking-widest flex items-center gap-2 shadow-sm">
                  <div className={`w-1.5 h-1.5 rounded-full ${saving ? 'bg-indigo-500 animate-ping' : 'bg-green-500'}`} />
                  <span>{t('synced')} {lastAutoSave.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
              
              <div className="flex flex-col md:flex-row gap-6 relative">
                <div className="hidden md:block absolute left-[-20px] top-4 bottom-4 w-1 bg-app-accent rounded-full opacity-40 shadow-[0_0_10px_rgba(79,70,229,0.2)]" />
                <div className="flex-1 space-y-1">
                  <label className={`text-[8px] font-black uppercase tracking-widest ${titleError ? 'text-rose-500' : 'text-app-accent'} ml-1 mb-1 block transition-colors`}>
                    {t('sermonTitleLabel')}
                    {titleError && <span className="ml-2 lowercase font-medium italic opacity-80">({t('titleRequired')})</span>}
                  </label>
                  <input
                    id="editor-title"
                    type="text"
                    placeholder={t('sermonTitlePlaceholder')}
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (titleError) setTitleError(false);
                    }}
                    disabled={!canEdit}
                    className={`w-full text-lg sm:text-xl font-bold bg-transparent text-app-text focus:outline-none placeholder:text-app-secondary placeholder:opacity-30 border-b ${titleError ? 'border-rose-500 shadow-[0_1px_0_0_#f43f5e]' : 'border-app-border/40'} pb-2 focus:border-app-accent transition-all`}
                  />
                </div>
                <div className="w-full md:w-1/3 space-y-1 pt-1">
                  <label className="text-[8px] font-black uppercase tracking-widest text-emerald-500 ml-1 mb-1 block">{t('sermonThemeLabel')}</label>
                  <div className="relative group">
                    <Tag className="absolute left-0 top-1/2 -translate-y-1/2 text-app-secondary group-hover:text-emerald-500 transition-colors" size={16} />
                    <input
                      id="editor-theme"
                      type="text"
                      placeholder={t('themePlaceholder')}
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      disabled={!canEdit}
                      className="w-full bg-transparent border-b border-app-border/40 pl-7 py-3 text-app-secondary focus:text-app-text focus:outline-none focus:border-emerald-500 transition-all font-serif italic text-base"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Editing Toolbar */}
            {canEdit && (
              <div className="px-3 py-1.5 border-b border-app-border/40 bg-app-card/30 backdrop-blur-xl sticky top-0 z-50 flex flex-wrap items-center justify-center gap-1.5 overflow-x-auto no-scrollbar shadow-xl">
                
                {/* Basic Text Styles & Alignment combined */}
                <div className="flex items-center gap-0.5 p-0.5 bg-app-card/40 rounded-lg border border-app-border">
                  <button
                    onClick={() => { applyStyle('bold', ''); checkStyles(); }}
                    className={`p-1 rounded-md transition-all ${activeStyles.bold ? 'bg-indigo-600 text-white' : 'text-app-secondary hover:bg-app-card/60 hover:text-app-text'}`}
                    title={t('bold')}
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    onClick={() => { applyStyle('italic', ''); checkStyles(); }}
                    className={`p-1 rounded-md transition-all ${activeStyles.italic ? 'bg-indigo-600 text-white' : 'text-app-secondary hover:bg-app-card/60 hover:text-app-text'}`}
                    title={t('italic')}
                  >
                    <Italic size={14} />
                  </button>
                  <button
                    onClick={() => { applyStyle('underline', ''); checkStyles(); }}
                    className={`p-1 rounded-md transition-all ${activeStyles.underline ? 'bg-indigo-600 text-white' : 'text-app-secondary hover:bg-app-card/60 hover:text-app-text'}`}
                    title={t('underline')}
                  >
                    <Underline size={14} />
                  </button>
                  <div className="w-px h-3.5 bg-app-border mx-0.5" />
                  <button onClick={() => applyStyle('justifyLeft', '')} className="p-1 text-app-secondary hover:bg-app-card/60 hover:text-app-text rounded-md transition-all">
                    <AlignLeft size={14} />
                  </button>
                  <button onClick={() => applyStyle('justifyCenter', '')} className="p-1 text-app-secondary hover:bg-app-card/60 hover:text-app-text rounded-md transition-all">
                    <AlignCenter size={14} />
                  </button>
                  <button
                    onClick={() => { 
                      editorRef.current?.focus();
                      document.execCommand('insertUnorderedList', false);
                      handleEditorInput();
                    }}
                    className="p-1 text-app-secondary hover:bg-app-card/60 hover:text-app-text rounded-md transition-all"
                    title={t('list')}
                  >
                    <List size={14} />
                  </button>
                </div>

                {/* Typography Selectors (Size & Font) */}
                <div className="flex items-center gap-1 p-0.5 bg-app-card/40 rounded-lg border border-app-border">
                  <div className="flex gap-0.5">
                    {[
                      { size: '14px', label: 'P' },
                      { size: '18px', label: 'M' },
                      { size: '24px', label: 'G' }
                    ].map((item) => (
                      <button
                        key={item.size}
                        onClick={() => handleFontSize(item.size)}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-[10px] font-black text-app-secondary hover:text-app-text hover:bg-app-card/60 transition-all"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="w-px h-3.5 bg-app-border mx-0.5" />
                  <div className="flex gap-0.5">
                    <button onClick={() => handleFontFamily('Inter')} className="px-1.5 py-1 hover:bg-app-card/60 rounded-md text-[8px] font-bold uppercase tracking-tighter text-app-secondary">Sans</button>
                    <button onClick={() => handleFontFamily('serif')} className="px-1.5 py-1 hover:bg-app-card/60 rounded-md text-[8px] font-serif font-bold text-app-secondary">Serif</button>
                  </div>
                </div>

                {/* Colors & Highlights */}
                <div className="flex items-center gap-1.5 p-0.5 bg-app-card/40 rounded-lg border border-app-border">
                  <div className="flex items-center gap-1 pr-0.5">
                    <Highlighter size={12} className="text-indigo-400/60 ml-0.5" />
                    {[
                      { color: '#ef4444' },
                      { color: '#f59e0b' },
                      { color: '#10b981' },
                      { color: '#3b82f6' },
                    ].map((item) => (
                      <button
                        key={item.color}
                        onClick={() => handleHighlight(item.color)}
                        className="w-3 h-3 rounded-full border border-app-border hover:scale-110 transition-transform"
                        style={{ backgroundColor: item.color }}
                      />
                    ))}
                    <button
                      onClick={() => handleHighlight('transparent')}
                      className="p-1 text-app-secondary hover:text-rose-500 rounded-md transition-all"
                    >
                      <Eraser size={10} />
                    </button>
                  </div>
                  <div className="w-px h-3.5 bg-app-border" />
                  <div className="flex items-center gap-0.5">
                    <Palette size={12} className="text-indigo-400/60 ml-0.5" />
                    {[
                      { color: 'var(--text-primary)' },
                      { color: '#ef4444' },
                      { color: '#10b981' },
                      { color: '#3b82f6' }
                    ].map((item) => (
                      <button
                        key={item.color}
                        onClick={() => handleColor(item.color)}
                        className="w-6 h-6 flex items-center justify-center text-[10px] font-bold hover:bg-app-card/60 rounded-md transition-all"
                        style={{ color: item.color }}
                      >
                        A
                      </button>
                    ))}
                  </div>
                </div>

                {/* Advanced - Notes */}
                <div className="flex flex-col gap-0.5 min-w-[60px]">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleAddNote}
                    className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[9px] font-bold transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <MessageSquare size={10} />
                    <span>{t('personalNote')}</span>
                  </button>
                  {holdProgress > 0 && (
                    <div className="w-full h-0.5 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-500 transition-all duration-100"
                        style={{ width: `${holdProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div 
              ref={editorRef}
              contentEditable={canEdit}
              onInput={handleEditorInput}
              onClick={(e) => {
                handleEditorClick(e);
                checkStyles();
              }}
              onKeyUp={() => {
                checkStyles();
                handleEditorInput();
              }}
              onMouseDown={handleEditorMouseDown}
              onMouseUp={handleEditorMouseUp}
              onMouseLeave={handleEditorMouseUp}
              onPaste={handleEditorInput}
              onDrop={handleEditorInput}
              className="flex-1 w-full p-8 font-serif text-xl leading-relaxed outline-none min-h-[400px] overflow-y-auto placeholder:text-app-secondary/40 bg-transparent text-app-text prose prose-indigo max-w-none"
              style={{ minHeight: '400px' }}
              onBlur={() => {
                if (editorRef.current) setContent(editorRef.current.innerHTML);
              }}
            />
          </div>
        ) : (
          <div className="p-8 md:p-12 prose dark:prose-invert prose-lg max-w-none prose-headings:font-serif prose-headings:font-medium text-app-text" onClick={handleEditorClick}>
            <h1 className="tracking-tight !mb-4 !text-app-text">{title}</h1>
            <p className="text-xl italic text-indigo-400 font-serif !mt-0 !mb-12 border-b border-app-border/60 pb-4">{t('aiThemeLabel')}: {theme}</p>
            <div className="font-serif mt-8" dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        )}

        <AnimatePresence>
          {notePopup && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              className="fixed z-[100] bg-slate-900 border border-white/20 p-4 rounded-2xl shadow-2xl max-w-xs"
              style={{ 
                left: notePopup.x, 
                top: notePopup.y,
                transform: 'translate(-50%, -100%)'
              }}
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                  <MessageSquare size={12} /> {t('personalNote')}
                </span>
                <button onClick={() => setNotePopup(null)} className="text-slate-500 hover:text-white transition-colors">
                  <X size={14} />
                </button>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed italic">
                "{notePopup.text}"
              </p>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-900 border-r border-b border-white/20 rotate-45" />
            </motion.div>
          )}
        </AnimatePresence>
        {sermon && (
          <ShareModal 
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
            sermon={sermon}
            onUpdate={() => activeId && loadSermon(activeId)}
          />
        )}
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-end gap-4 px-4 text-slate-500">
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-600">
          Escrituras Vivas • Sistema de Ministrações
        </div>
      </div>

      <AnimatePresence>
        {noteModal.isOpen && (
          <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
                onClick={() => setNoteModal({ isOpen: false, selectionRange: null, highlight: null, isEditing: false })}
              />
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="relative bg-slate-900 border border-indigo-500/30 rounded-3xl p-8 max-w-md w-full shadow-2xl"
              >
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-indigo-500/20 rounded-2xl">
                  <MessageSquare size={24} className="text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{t('spiritualNote')}</h3>
                  <p className="text-sm text-slate-400">{t('spiritualNoteSub')}</p>
                </div>
              </div>

              <textarea
                autoFocus
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                placeholder={t('emphasizeExample')}
                className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 min-h-[120px] mb-6"
              />

              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <button
                    onClick={cancelNote}
                    className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={confirmNote}
                    className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/20"
                  >
                    {t('saveNote')}
                  </button>
                </div>
                
                {noteModal.isEditing && (
                  <button
                    onClick={() => {
                      const { highlight } = noteModal;
                      if (highlight) {
                        const parent = highlight.parentNode;
                        if (parent) {
                          while (highlight.firstChild) {
                            parent.insertBefore(highlight.firstChild, highlight);
                          }
                          parent.removeChild(highlight);
                        }
                        if (editorRef.current) setContent(editorRef.current.innerHTML);
                      }
                      setNoteModal({ isOpen: false, selectionRange: null, highlight: null, isEditing: false });
                    }}
                    className="w-full px-6 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 size={14} /> {t('removeNote')}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  </div>
);
}
