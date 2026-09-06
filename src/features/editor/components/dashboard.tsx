'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2, LockKeyhole, Plus, X, Home, Upload, Save } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import { Separator } from '@shared/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';
import { cn } from '@shared/lib/utils';
import {
  EkapDocument,
  decryptEkap,
  encryptEkap,
  parseEkapDocument,
  createEkapZip,
} from '@features/editor/lib/ekap-crypto';

import { EditorView } from '@features/editor/components/editor-view';
import { HomeView } from '@features/editor/components/home-view';
import type { SortConfig, TabSession } from '@features/editor/types';
import type { RecentFile } from '@features/editor/types';

export default function Dashboard() {
  const [sessions, setSessions] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [tabToClose, setTabToClose] = useState<string | null>(null);

  // Load recent files on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ekap-recent-files');
      if (stored) {
        setRecentFiles(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load recent files', e);
    }
  }, []);

  const addToRecent = (file: { name: string; size?: number }) => {
    const newFile: RecentFile = {
      id: `${file.name}-${Date.now()}`,
      name: file.name,
      lastOpened: Date.now(),
      size: file.size,
    };

    setRecentFiles((prev) => {
      const others = prev.filter((f) => f.name !== file.name);
      const updated = [newFile, ...others].slice(0, 20);
      localStorage.setItem('ekap-recent-files', JSON.stringify(updated));
      return updated;
    });
  };

  const clearRecent = () => {
    setRecentFiles([]);
    localStorage.removeItem('ekap-recent-files');
  };

  // Import Flow State
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const activeSession = sessions.find((s) => s.id === activeTabId);
  const closingSession = sessions.find((s) => s.id === tabToClose);

  // --- Handlers ---

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setPendingFile(file);
      setPassword('');
    }
  }, []);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setPassword('');
    event.target.value = '';
  }, []);

  // An .ekap file opened from the shell waits in the main process until this
  // mounts; it then goes through the same password prompt as a picked file.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.filePendingTake) return;
    let cancelled = false;
    const collect = async () => {
      const pending = await api.filePendingTake('ekap').catch(() => null);
      if (!pending || cancelled) return;
      setPendingFile(new File([new Uint8Array(pending.bytes)], pending.name));
      setPassword('');
    };
    void collect();
    const stop = api.onFilePending((kind) => {
      if (kind === 'ekap') void collect();
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const createSession = (doc: EkapDocument, file: File, pwd: string) => {
    const newSession: TabSession = {
      id: crypto.randomUUID(),
      document: doc,
      fileName: file.name,
      password: pwd,
      isDirty: false,
      searchQuery: '',
      sortConfig: { key: 'index', direction: 'asc' },
    };

    setSessions((prev) => [...prev, newSession]);
    setActiveTabId(newSession.id);
  };

  const handleDecrypt = async () => {
    if (!password || !pendingFile) {
      toast.error('Lütfen şifre girin');
      return;
    }

    setIsLoading(true);

    try {
      const fileData = await pendingFile.arrayBuffer();
      const decryptedData = await decryptEkap(fileData, password);

      if (!decryptedData) {
        toast.error('Dosya şifresi çözülemedi. Şifrenizi kontrol edin.');
        setIsLoading(false);
        return;
      }

      const doc = await parseEkapDocument(decryptedData);
      if (!doc) {
        toast.error('EKAP belgesi okunamadı');
        setIsLoading(false);
        return;
      }

      createSession(doc, pendingFile, password);
      addToRecent(pendingFile);

      setPendingFile(null);
      setPassword('');
      toast.success(`${pendingFile.name} yüklendi`);
    } catch (error) {
      console.error(error);
      toast.error('Hata oluştu');
    } finally {
      setIsLoading(false);
    }
  };

  const executeCloseTab = (id: string) => {
    if (activeTabId === id) {
      const index = sessions.findIndex((s) => s.id === id);
      const nextSession = sessions[index - 1] || sessions[index + 1];
      setActiveTabId(nextSession ? nextSession.id : null);
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const handleCloseTab = (e: React.MouseEvent<HTMLElement>, id: string) => {
    e.stopPropagation();
    const session = sessions.find((s) => s.id === id);
    if (session?.isDirty) {
      setTabToClose(id);
    } else {
      executeCloseTab(id);
    }
  };

  const updateSession = useCallback((id: string, updates: Partial<TabSession>) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, []);

  const handleSearchChange = useCallback(
    (sessionId: string, query: string) => {
      updateSession(sessionId, { searchQuery: query });
    },
    [updateSession],
  );

  const handleSortChange = useCallback(
    (sessionId: string, config: SortConfig) => {
      updateSession(sessionId, { sortConfig: config });
    },
    [updateSession],
  );

  const handleDocumentUpdate = (doc: EkapDocument) => {
    if (!activeTabId) return;
    updateSession(activeTabId, { document: doc, isDirty: true });
  };

  const saveSession = useCallback(
    async (session: TabSession) => {
      setIsLoading(true);
      try {
        const zipData = await createEkapZip(session.document);
        const encryptedData = encryptEkap(zipData, session.password);

        const blob = new Blob([encryptedData], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = session.fileName.replace('.ekap', '_modified.ekap') || 'doc.ekap';
        window.document.body.appendChild(a);
        a.click();
        window.document.body.removeChild(a);
        URL.revokeObjectURL(url);

        updateSession(session.id, { isDirty: false });

        addToRecent({
          name: session.fileName,
          size: encryptedData.byteLength,
        });

        toast.success('Kaydedildi');
        return true;
      } catch (error) {
        console.error(error);
        toast.error('Kaydetme hatası');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [updateSession],
  );

  const handleSave = useCallback(async () => {
    if (!activeSession) return;
    await saveSession(activeSession);
  }, [activeSession, saveSession]);

  const handleSaveAndClose = async () => {
    if (!closingSession) return;
    const success = await saveSession(closingSession);
    if (success) {
      executeCloseTab(closingSession.id);
      setTabToClose(null);
    }
  };

  const handleDiscard = () => {
    if (closingSession) {
      executeCloseTab(closingSession.id);
      setTabToClose(null);
    }
  };

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        fileInputRef.current?.click();
      }
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  return (
    <div className="bg-background selection:bg-primary/10 flex h-full flex-col">
      {/* Tab Bar (replaces the old Header) */}
      <div className="bg-background/95 flex h-9 shrink-0 items-center border-b px-1 backdrop-blur">
        {/* Left: Home + Tabs */}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          <Button
            variant={activeTabId === null ? 'secondary' : 'ghost'}
            size="icon"
            className="size-7 shrink-0"
            onClick={() => setActiveTabId(null)}
            title="Ana Sayfa"
          >
            <Home className="size-3.5" />
          </Button>

          <Separator orientation="vertical" className="h-5" />

          {/* Tabs List - Scrollable */}
          {sessions.length > 0 && (
            <div className="relative flex flex-1 items-center overflow-hidden">
              <div
                className="no-scrollbar flex h-full items-center gap-0.5 overflow-x-auto overflow-y-hidden px-[10px]"
                style={{
                  maskImage:
                    'linear-gradient(to right, transparent, black 10px, black calc(100% - 10px), transparent)',
                  WebkitMaskImage:
                    'linear-gradient(to right, transparent, black 10px, black calc(100% - 10px), transparent)',
                }}
              >
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => setActiveTabId(session.id)}
                    onAuxClick={(e) => {
                      if (e.button === 1) {
                        handleCloseTab(e, session.id);
                      }
                    }}
                    className={cn(
                      'group relative flex h-7 max-w-[160px] min-w-[100px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-all select-none',
                      activeTabId === session.id
                        ? 'bg-muted border-border text-foreground z-10'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border-transparent bg-transparent',
                    )}
                  >
                    <FileText className="size-3 shrink-0" />
                    <span className="flex-1 truncate" title={session.fileName}>
                      {session.fileName}
                    </span>
                    {session.isDirty && (
                      <div className="size-1.5 shrink-0 rounded-full bg-amber-500" />
                    )}
                    <div
                      className="hover:bg-muted-foreground/20 rounded-sm p-0.5"
                      onClick={(e) => handleCloseTab(e, session.id)}
                    >
                      <X className="size-3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: New Tab + Save + Upload */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-7 shrink-0 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            title="Dosya Aç (Ctrl+O)"
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-7 shrink-0 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            title="Dosya Yükle (Ctrl+O)"
          >
            <Upload className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 cursor-pointer"
            disabled={!activeSession || isLoading}
            onClick={handleSave}
            title="Kaydet (Ctrl+S)"
          >
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* --- Main Content --- */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {pendingFile && (
          <div className="bg-background/80 absolute inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-card animate-in fade-in slide-in-from-bottom-4 w-full max-w-sm rounded-xl border p-6 shadow-sm duration-300">
              <div className="mb-6 flex flex-col items-center text-center">
                <div className="bg-primary/10 text-primary mb-4 flex size-12 items-center justify-center rounded-full">
                  <FileText className="size-6" />
                </div>
                <h3 className="text-lg font-semibold">{pendingFile.name}</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {(pendingFile.size / 1024).toFixed(1)} KB
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password-input">Şifre Girin</Label>
                  <Input
                    id="password-input"
                    type="password"
                    placeholder="******"
                    className="text-center text-lg tracking-widest"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !!password && handleDecrypt()}
                  />
                </div>
                <Button
                  className="w-full cursor-pointer"
                  size="lg"
                  onClick={handleDecrypt}
                  disabled={!password || isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <LockKeyhole className="mr-2 size-4" />
                  )}
                  Aç
                </Button>
                <Button
                  variant="ghost"
                  className="w-full cursor-pointer"
                  onClick={() => {
                    setPendingFile(null);
                    setPassword('');
                  }}
                >
                  İptal
                </Button>
              </div>
            </div>
          </div>
        )}

        {!activeSession ? (
          <div
            className="relative flex h-full flex-1 flex-col overflow-hidden"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <HomeView
              sessions={sessions}
              activeTabId={activeTabId}
              recentFiles={recentFiles}
              onOpenFile={() => fileInputRef.current?.click()}
              onOpenSession={setActiveTabId}
              onClearRecent={clearRecent}
            />

            {/* Overlay for drag drop global on home screen */}
            {isDragOver && (
              <div className="bg-background/80 border-primary pointer-events-none absolute inset-0 z-50 m-4 flex items-center justify-center rounded-xl border-4 border-dashed backdrop-blur-sm">
                <div className="text-center">
                  <Upload className="text-primary mx-auto mb-4 size-12 animate-bounce" />
                  <h3 className="text-primary text-2xl font-bold">Dosyayı Bırakın</h3>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="relative flex h-full flex-1 flex-col overflow-hidden"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {sessions.map((session) => (
              <EditorView
                key={session.id}
                document={session.document}
                fileName={session.fileName}
                onUpdate={handleDocumentUpdate}
                isActive={session.id === activeTabId}
                searchQuery={session.searchQuery}
                onSearchChange={(q) => handleSearchChange(session.id, q)}
                sortConfig={session.sortConfig}
                onSortChange={(c) => handleSortChange(session.id, c)}
              />
            ))}

            <div
              className={cn(
                'bg-background/60 pointer-events-none absolute inset-0 z-40 flex items-center justify-center backdrop-blur-sm transition-opacity duration-200',
                isDragOver ? 'opacity-100' : 'opacity-0',
              )}
            >
              <div className="border-primary bg-primary/5 rounded-xl border-4 border-dashed p-10 text-center">
                <Plus className="text-primary mx-auto mb-4 size-12" />
                <h3 className="text-primary text-2xl font-bold">Yeni Sekmede Aç</h3>
                <p className="text-muted-foreground">Dosyayı buraya bırakın</p>
              </div>
            </div>
          </div>
        )}
      </main>
      <input ref={fileInputRef} type="file" accept=".ekap" hidden onChange={handleFileUpload} />

      <Dialog open={!!tabToClose} onOpenChange={(open) => !open && setTabToClose(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kaydedilmemiş değişiklikler var.</DialogTitle>
            <DialogDescription>
              &quot;{closingSession?.fileName}&quot; dosyasında kaydedilmemiş değişiklikler var.
              Kapatmadan önce kaydetmek ister misiniz?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="space-x-2">
            <Button variant="ghost" onClick={() => setTabToClose(null)}>
              Vazgeç
            </Button>
            <Button variant="destructive" onClick={handleDiscard}>
              Kaydetme
            </Button>
            <Button onClick={handleSaveAndClose}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
