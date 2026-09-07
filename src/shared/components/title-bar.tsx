'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  CircleFadingArrowUp,
  ArrowLeft,
  LogOut,
  UserIcon,
  Moon,
  Sun,
  Minus,
  X,
  RefreshCw,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

import { Button } from '@shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@shared/components/ui/dropdown-menu';
import { useAuth } from '@features/auth/context';
import { BrandLogo } from '@shared/components/brand-logo';
import { UpdateDialog } from '@shared/components/update-dialog';

interface TitleBarProps {
  title: string;
  showAppReturn?: boolean;
}

const subscribeToElectron = () => () => {};
const getElectronSnapshot = () => Boolean(window.electronAPI);
const getServerElectronSnapshot = () => false;

function TablerSquare(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      />
    </svg>
  );
}

function TablerSquares(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="M8 10a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z" />
        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
      </g>
    </svg>
  );
}

export function TitleBar({ title, showAppReturn = false }: TitleBarProps) {
  const { user, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = useSyncExternalStore(
    subscribeToElectron,
    getElectronSnapshot,
    getServerElectronSnapshot,
  );
  const [updateInfo, setUpdateInfo] = useState<{
    version: string;
    releaseNotes: string | null;
  } | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI
      .windowIsMaximized()
      .then(setIsMaximized)
      .catch(() => setIsMaximized(false));
    const cleanupMaximize = window.electronAPI.onMaximizeChange(setIsMaximized);
    const cleanupAvail = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateInfo(info);
      setShowUpdateDialog(true);
    });
    const cleanupDownloaded = window.electronAPI.onUpdateDownloaded(() => {
      setUpdateReady(true);
      setShowUpdateDialog(true);
    });
    const cleanupStatus = window.electronAPI.onUpdateStatus(({ status, message }) => {
      if (status === 'checking') toast.info('Güncellemeler denetleniyor…');
      if (status === 'current') toast.success('İcmal güncel.');
      if (status === 'error') toast.error(message ?? 'Güncelleme denetlenemedi.');
    });
    return () => {
      cleanupMaximize();
      cleanupAvail();
      cleanupDownloaded();
      cleanupStatus();
    };
  }, []);

  return (
    <>
      <div
        className="bg-background/95 z-50 flex h-9 shrink-0 items-center border-b backdrop-blur select-none"
        style={isElectron ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : undefined}
      >
        <div className="flex h-full min-w-0 items-center gap-2 px-2.5">
          {showAppReturn && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1.5 px-2 text-xs"
              style={
                isElectron ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined
              }
              asChild
            >
              <Link href="/editor" aria-label="Normal uygulamaya dön">
                <ArrowLeft className="size-3.5" />
                <span className="hidden sm:inline">Uygulamaya dön</span>
              </Link>
            </Button>
          )}
          <Link
            href="/"
            className="text-foreground flex shrink-0 items-center gap-1.5 text-xs font-semibold"
            style={isElectron ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
            aria-label="İcmal ana sayfası"
          >
            <BrandLogo className="h-5" />
          </Link>
          <span className="bg-border h-4 w-px shrink-0" aria-hidden="true" />
          <span className="text-muted-foreground truncate text-xs">{title}</span>
        </div>

        {/* Draggable spacer */}
        <div className="h-full flex-1" />

        {/* Right side: Theme + User */}
        <div
          className="flex h-full shrink-0 items-center gap-1"
          style={isElectron ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
        >
          {updateInfo && !showUpdateDialog && (
            <Button
              variant="ghost"
              size="icon"
              className="relative size-7 cursor-pointer"
              aria-label="Hazır güncellemeyi görüntüle"
              onClick={() => setShowUpdateDialog(true)}
            >
              <CircleFadingArrowUp className="size-3.5" />
              <span className="bg-primary absolute top-1 right-1 size-1.5 rounded-full" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 cursor-pointer"
            onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
          >
            <Sun className="size-3.5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute size-3.5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
            <span className="sr-only">Tema değiştir</span>
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 cursor-pointer"
                  aria-label="Kullanıcı menüsünü aç"
                >
                  <UserIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/user" className="cursor-pointer">
                    <UserIcon className="mr-2 size-4" />
                    Profilim
                  </Link>
                </DropdownMenuItem>
                {isElectron && (
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => window.electronAPI?.checkForUpdates()}
                  >
                    <RefreshCw className="mr-2 size-4" />
                    Güncellemeleri Denetle
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="cursor-pointer" onClick={() => signOut()}>
                  <LogOut className="mr-2 size-4" />
                  Çıkış Yap
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
                <Link href="/login">Giriş Yap</Link>
              </Button>
              <Button size="sm" className="h-7 px-2 text-xs" asChild>
                <Link href="/register">Kayıt Ol</Link>
              </Button>
            </div>
          )}
        </div>

        {/* Window Controls (Electron only) */}
        {isElectron && (
          <div
            className="flex h-full items-center"
            style={isElectron ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
          >
            <div className="bg-border mx-1 h-4 w-px" />
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-muted h-full w-10 cursor-pointer rounded-none border-none shadow-none"
              aria-label="Pencereyi küçült"
              onClick={() => window.electronAPI?.windowMinimize()}
            >
              <Minus className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-muted h-full w-10 cursor-pointer rounded-none border-none shadow-none"
              aria-label={isMaximized ? 'Pencereyi önceki boyutuna getir' : 'Pencereyi büyüt'}
              onClick={() => window.electronAPI?.windowMaximize()}
            >
              {isMaximized ? (
                <TablerSquares className="size-3 scale-x-[-1]" />
              ) : (
                <TablerSquare className="size-3" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-full w-11 cursor-pointer rounded-none border-none shadow-none hover:bg-red-500 hover:text-white"
              aria-label="Pencereyi kapat"
              onClick={() => window.electronAPI?.windowClose()}
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
      </div>
      <UpdateDialog
        open={showUpdateDialog}
        onOpenChange={setShowUpdateDialog}
        updateInfo={updateInfo}
        updateReady={updateReady}
        onInstall={() => window.electronAPI?.installUpdate()}
      />
    </>
  );
}
