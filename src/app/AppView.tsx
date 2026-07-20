import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatElapsed } from './presentation';
import type { AppController } from './useAppController';
import { ConnectButton, LocationChip } from '../features/connection/ConnectionControls';
import { ServerSheet } from '../features/servers/ServerSheet';
import { SettingsSheet } from '../features/settings/SettingsSheet';
import { LogsScreen } from '../ui/LogsScreen';
import { Sidebar } from '../ui/Sidebar';
import type { AppTab } from '../ui/Sidebar';
import { ACCENT, themeVars } from '../ui/theme';
import { useSheetDrag } from '../ui/useSheetDrag';

type AppViewProps = {
  controller: AppController;
};

const SIDEBAR_COLLAPSED_KEY = 'karst-sidebar-collapsed';

export function AppView({ controller }: AppViewProps) {
  const {
    appError,
    phase,
    elapsed,
    isTransitioning,
    isConnected,
    statusLabel,
    subLabel,
    toggleConnection: onTapButton,
    catalog,
    preferences,
    logs: logState,
  } = controller;
  const {
    groups,
    selectedServer,
    selectedServerId,
    menuVisible,
    menuClosing,
    openMenu: onOpenServerMenu,
    closeMenu: onCloseServerMenu,
    subscriptionMenuId,
    setSubscriptionMenuId,
    addServerOpen,
    addServerValue,
    addServerError,
    addServerLoading,
    importMessage,
    refreshAllLoading,
    selectServer: onSelectServer,
    removeServer: onRemoveServer,
    deleteSubscription: onDeleteSubscription,
    openAddServer: onOpenAddServer,
    closeAddServer: onCancelAddServer,
    changeAddServerValue: onChangeAddServerValue,
    submitAddServer: onSubmitAddServer,
    refreshAll: onRefreshAll,
  } = catalog;
  const {
    themeBusy,
    darkModeOn,
    theme,
    bypassLocal,
    bypassRu,
    autoRefreshMode,
    autoRefreshHours,
    dnsDohUrl,
    toggleDarkMode: onToggleDarkMode,
    toggleBypassLocal: handleToggleBypassLocal,
    toggleBypassRu: handleToggleBypassRu,
    setAutoRefresh: handleSetAutoRefreshMode,
    setAutoRefreshHours: handleSetAutoRefreshHours,
    setDnsDohUrl: handleSetDnsDohUrl,
  } = preferences;
  const {
    logs,
    loading: logsLoading,
    error: logsError,
    toastMessage,
    toastClosing,
    load: onLoadLogs,
    clear: onClearLogs,
    copy: onCopyLogs,
  } = logState;

  const [activeTab, setActiveTab] = useState<AppTab>('connection');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true',
  );

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  // Refresh logs each time the Logs tab is opened.
  useEffect(() => {
    if (activeTab === 'logs') void onLoadLogs();
  }, [activeTab, onLoadLogs]);

  const menuDrag = useSheetDrag(onCloseServerMenu);

  // Drive the sheet + backdrop with transitions (not keyframes): switching a CSS
  // animation restarts it from its 0% frame, which jumps whenever open/close
  // interrupts a still-running fade. `menuReady` flips on the frame after mount
  // so the entrance interpolates from the closed state.
  const [menuReady, setMenuReady] = useState(false);
  useEffect(() => {
    if (menuVisible && !menuClosing) {
      const id = requestAnimationFrame(() => setMenuReady(true));
      return () => cancelAnimationFrame(id);
    }
    setMenuReady(false);
  }, [menuVisible, menuClosing]);

  const menuOpen = menuReady && !menuClosing;
  // Backdrop fades with the drag so the darkening tracks the pull instead of
  // holding full and snapping away on release.
  const dragFade = Math.min(menuDrag.offset / 500, 0.6);
  const backdropOpacity = menuOpen ? 1 - dragFade : 0;
  const sheetShift = menuOpen ? '0%' : '100%';
  const sheetTransition = menuDrag.dragging
    ? 'none'
    : 'transform 0.26s cubic-bezier(0.4,0,0.2,1), translate 0.26s cubic-bezier(0.4,0,0.2,1)';

  return (
    <div
      className={themeBusy ? 'no-transitions' : ''}
      style={{
        width: '100%',
        height: '100%',
        background: theme.appBg,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        ...themeVars(theme),
      }}
    >
      <Sidebar
        theme={theme}
        accent={ACCENT}
        activeTab={activeTab}
        collapsed={sidebarCollapsed}
        onSelectTab={setActiveTab}
        onToggleCollapsed={toggleSidebar}
      />

      <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
        {activeTab === 'connection' && (
          <div
            key="connection"
            className="tab-content-anim"
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxSizing: 'border-box',
              padding: '40px 40px 48px',
              background: theme.appBg,
            }}
          >
            {/* Cap and centre the content so the button and server card read as a
                real panel instead of stretching across the wide desktop window. */}
            <div
              style={{
                width: '100%',
                maxWidth: 480,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 36,
                }}
              >
                <ConnectButton
                  phase={isTransitioning && phase === 'off' ? 'connecting' : phase}
                  enabled={selectedServer !== null || isConnected}
                  theme={theme}
                  accent={ACCENT}
                  onClick={() => void onTapButton()}
                />

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    minHeight: 92,
                  }}
                >
                  <div style={{ font: "500 30px/1.15 'Source Serif 4', serif", color: theme.ink }}>
                    {statusLabel}
                  </div>
                  {isConnected ? (
                    <div
                      style={{
                        font: "500 17px/1 'Inter', sans-serif",
                        color: theme.mutedInk,
                        letterSpacing: '0.3px',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatElapsed(elapsed)}
                    </div>
                  ) : (
                    <div
                      style={{
                        font: "400 16px/1.45 'Inter', sans-serif",
                        color: appError ? theme.danger : theme.mutedInk,
                        maxWidth: 360,
                        textAlign: 'center',
                      }}
                    >
                      {subLabel}
                    </div>
                  )}
                </div>
              </div>

              <LocationChip server={selectedServer} theme={theme} onClick={onOpenServerMenu} />
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div key="logs" className="tab-content-anim" style={{ width: '100%', height: '100%' }}>
            <LogsScreen
              theme={theme}
              accent={ACCENT}
              logs={logs}
              logsLoading={logsLoading}
              logsError={logsError}
              onClear={onClearLogs}
              onCopy={() => void onCopyLogs()}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div
            key="settings"
            className="tab-content-anim"
            style={{
              width: '100%',
              height: '100%',
              boxSizing: 'border-box',
              overflow: 'auto',
              padding: '24px 28px 28px',
            }}
          >
            <SettingsSheet
              theme={theme}
              accent={ACCENT}
              darkModeOn={darkModeOn}
              bypassLocal={bypassLocal}
              bypassRu={bypassRu}
              autoRefreshMode={autoRefreshMode}
              autoRefreshHours={autoRefreshHours}
              dnsDohUrl={dnsDohUrl}
              onToggleDarkMode={onToggleDarkMode}
              onToggleBypassLocal={() => void handleToggleBypassLocal()}
              onToggleBypassRu={() => void handleToggleBypassRu()}
              onSetAutoRefreshMode={(m) => void handleSetAutoRefreshMode(m)}
              onSetAutoRefreshHours={(h) => void handleSetAutoRefreshHours(h)}
              onSetDnsDohUrl={(url) => void handleSetDnsDohUrl(url)}
            />
          </div>
        )}
      </div>

      {menuVisible && (
        <>
          <div
            onClick={onCloseServerMenu}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              opacity: backdropOpacity,
              transition: menuDrag.dragging ? 'none' : 'opacity 0.24s cubic-bezier(0.4,0,0.2,1)',
              zIndex: 5,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: '82%',
              display: 'flex',
              flexDirection: 'column',
              background: theme.sheetBg,
              borderRadius: '22px 22px 0 0',
              boxShadow: '0 -18px 40px -16px rgba(0,0,0,0.4)',
              padding: '0 22px 28px',
              boxSizing: 'border-box',
              zIndex: 6,
              overflow: 'hidden',
              transform: `translateY(${sheetShift})`,
              translate: `0 ${menuDrag.offset}px`,
              transition: sheetTransition,
            }}
          >
            <div
              {...menuDrag.handlers}
              style={{
                padding: '10px 0 12px',
                display: 'flex',
                justifyContent: 'center',
                cursor: menuDrag.dragging ? 'grabbing' : 'grab',
                touchAction: 'none',
              }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: theme.border }} />
            </div>
            <ServerSheet
              groups={groups}
              selectedServerId={selectedServerId}
              addServerOpen={addServerOpen}
              addServerValue={addServerValue}
              addServerError={addServerError}
              addServerLoading={addServerLoading}
              importMessage={importMessage}
              refreshAllLoading={refreshAllLoading}
              subscriptionMenuId={subscriptionMenuId}
              theme={theme}
              accent={ACCENT}
              onSelect={onSelectServer}
              onRemove={onRemoveServer}
              onDeleteSubscription={onDeleteSubscription}
              onOpenSubscription={setSubscriptionMenuId}
              onCloseSubscription={() => setSubscriptionMenuId(null)}
              onRefreshAll={() => void onRefreshAll()}
              onOpenAddServer={onOpenAddServer}
              onCancelAddServer={onCancelAddServer}
              onChangeAddServerValue={onChangeAddServerValue}
              onSubmitAddServer={() => void onSubmitAddServer()}
            />
          </div>
        </>
      )}

      {toastMessage &&
        createPortal(
          <div
            className={`toast ${toastClosing ? 'toast-out' : 'toast-in'} ${darkModeOn ? 'toast-dark' : ''}`}
          >
            {toastMessage}
          </div>,
          document.body,
        )}
    </div>
  );
}
