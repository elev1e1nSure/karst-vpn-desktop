import { createPortal } from 'react-dom';
import { formatElapsed } from './presentation';
import type { AppController } from './useAppController';
import { ConnectButton, LocationChip } from '../features/connection/ConnectionControls';
import { ServerSheet } from '../features/servers/ServerSheet';
import { SettingsSheet } from '../features/settings/SettingsSheet';
import { LogsScreen } from '../ui/LogsScreen';
import { Pressable } from '../ui/Pressable';
import { Tooltip } from '../ui/Tooltip';
import { ACCENT, themeVars } from '../ui/theme';
import { useSheetDrag } from '../ui/useSheetDrag';

type AppViewProps = {
  controller: AppController;
};

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
    openLogs: onOpenLogs,
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
    visible: settingsVisible,
    closing: settingsClosing,
    themeBusy,
    darkModeOn,
    theme,
    routingMode,
    autoRefreshMode,
    autoRefreshHours,
    dnsDohUrl,
    open: onOpenSettings,
    close: onCloseSettings,
    toggleDarkMode: onToggleDarkMode,
    setRouting: handleSetRoutingMode,
    setAutoRefresh: handleSetAutoRefreshMode,
    setAutoRefreshHours: handleSetAutoRefreshHours,
    setDnsDohUrl: handleSetDnsDohUrl,
  } = preferences;
  const {
    screen: appScreen,
    direction: screenDir,
    logs,
    loading: logsLoading,
    error: logsError,
    toastMessage,
    toastClosing,
    back: onBackToMain,
    clear: onClearLogs,
    copy: onCopyLogs,
  } = logState;

  const menuAnim = `${menuClosing ? 'menuSlideDown' : 'menuSlideUp'} 0.26s cubic-bezier(0.4,0,0.2,1) both`;
  const backdropAnim = `${menuClosing ? 'backdropOut' : 'backdropIn'} 0.22s cubic-bezier(0.4,0,0.2,1) both`;
  const settingsAnim = `${settingsClosing ? 'menuSlideDown' : 'menuSlideUp'} 0.26s cubic-bezier(0.4,0,0.2,1) both`;
  const settingsBackdropAnim = `${settingsClosing ? 'backdropOut' : 'backdropIn'} 0.32s cubic-bezier(0.4,0,0.2,1) both`;
  const menuDrag = useSheetDrag(onCloseServerMenu);
  const settingsDrag = useSheetDrag(onCloseSettings);
  const sheetDragTransition = (dragging: boolean) =>
    dragging ? 'none' : 'translate 0.25s cubic-bezier(0.4,0,0.2,1)';

  const renderDragHandle = (drag: ReturnType<typeof useSheetDrag>) => (
    <div
      {...drag.handlers}
      style={{
        padding: '10px 0 12px',
        display: 'flex',
        justifyContent: 'center',
        cursor: drag.dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
    >
      <div
        style={{
          width: 36,
          height: 4,
          borderRadius: 2,
          background: theme.border,
        }}
      />
    </div>
  );

  return (
    <div
      className={themeBusy ? 'no-transitions' : ''}
      style={{
        width: '100%',
        height: '100%',
        background: theme.appBg,
        position: 'relative',
        overflow: 'hidden',
        ...themeVars(theme),
      }}
    >
      <div
        className={
          appScreen === 'main' && screenDir === 'back'
            ? 'route-enter-from-left'
            : appScreen === 'main'
              ? ''
              : 'route-exit-to-left'
        }
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          padding: '8px 28px 36px',
          background: theme.appBg,
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'hidden',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          pointerEvents: appScreen !== 'main' ? 'none' : undefined,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingTop: 18,
            paddingBottom: 0,
          }}
        >
          <Tooltip label="Настройки" theme={theme} placement="bottom">
            <Pressable
              onClick={onOpenSettings}
              className="settings-btn"
              ripple={false}
              style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                background: theme.cardBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5Z"
                  stroke={theme.mutedInk}
                  strokeWidth="1.8"
                />
                <path
                  d="M19.4 13.5C19.46 13.01 19.5 12.51 19.5 12C19.5 11.49 19.46 10.99 19.4 10.5L21.34 8.97C21.53 8.82 21.58 8.55 21.46 8.34L19.74 5.36C19.62 5.15 19.36 5.07 19.14 5.15L16.87 6.06C16.18 5.53 15.42 5.11 14.6 4.82L14.25 2.42C14.21 2.18 14.01 2 13.77 2H10.33C10.09 2 9.89 2.18 9.85 2.42L9.5 4.82C8.68 5.11 7.92 5.54 7.23 6.06L4.96 5.15C4.74 5.07 4.48 5.15 4.36 5.36L2.64 8.34C2.52 8.55 2.57 8.82 2.76 8.97L4.7 10.5C4.64 10.99 4.6 11.5 4.6 12C4.6 12.5 4.64 13.01 4.7 13.5L2.76 15.03C2.57 15.18 2.52 15.45 2.64 15.66L4.36 18.64C4.48 18.85 4.74 18.93 4.96 18.85L7.23 17.94C7.92 18.47 8.68 18.89 9.5 19.18L9.85 21.58C9.89 21.82 10.09 22 10.33 22H13.77C14.01 22 14.21 21.82 14.25 21.58L14.6 19.18C15.42 18.89 16.18 18.46 16.87 17.94L19.14 18.85C19.36 18.93 19.62 18.85 19.74 18.64L21.46 15.66C21.58 15.45 21.53 15.18 21.34 15.03L19.4 13.5Z"
                  stroke={theme.mutedInk}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </Pressable>
          </Tooltip>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 28,
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
              gap: 6,
              minHeight: 78,
            }}
          >
            <div style={{ font: "500 24px/1.15 'Source Serif 4', serif", color: theme.ink }}>
              {statusLabel}
            </div>
            {isConnected ? (
              <div
                style={{
                  font: "500 14px/1 'Inter', sans-serif",
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
                  font: "400 14px/1.4 'Inter', sans-serif",
                  color: appError ? theme.danger : theme.mutedInk,
                  maxWidth: 250,
                  textAlign: 'center',
                }}
              >
                {subLabel}
              </div>
            )}
          </div>
        </div>

        <LocationChip server={selectedServer} theme={theme} onClick={onOpenServerMenu} />

        {menuVisible && (
          <>
            <div
              onClick={onCloseServerMenu}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                animation: backdropAnim,
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
                background: theme.appBg,
                borderRadius: '22px 22px 0 0',
                boxShadow: '0 -18px 40px -16px rgba(0,0,0,0.4)',
                padding: '0 22px 28px',
                boxSizing: 'border-box',
                zIndex: 6,
                animation: menuAnim,
                overflow: 'hidden',
                translate: `0 ${menuDrag.offset}px`,
                transition: sheetDragTransition(menuDrag.dragging),
              }}
            >
              {renderDragHandle(menuDrag)}
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

        {settingsVisible && (
          <>
            <div
              onClick={onCloseSettings}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                animation: settingsBackdropAnim,
                zIndex: 5,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                maxHeight: '78%',
                display: 'flex',
                flexDirection: 'column',
                background: theme.appBg,
                borderRadius: '22px 22px 0 0',
                boxShadow: '0 -18px 40px -16px rgba(0,0,0,0.4)',
                padding: '0 22px 28px',
                boxSizing: 'border-box',
                zIndex: 6,
                animation: settingsAnim,
                overflow: 'hidden',
                translate: `0 ${settingsDrag.offset}px`,
                transition: sheetDragTransition(settingsDrag.dragging),
              }}
            >
              {renderDragHandle(settingsDrag)}
              <SettingsSheet
                theme={theme}
                accent={ACCENT}
                darkModeOn={darkModeOn}
                routingMode={routingMode}
                autoRefreshMode={autoRefreshMode}
                autoRefreshHours={autoRefreshHours}
                dnsDohUrl={dnsDohUrl}
                onToggleDarkMode={onToggleDarkMode}
                onSetRoutingMode={(m) => void handleSetRoutingMode(m)}
                onSetAutoRefreshMode={(m) => void handleSetAutoRefreshMode(m)}
                onSetAutoRefreshHours={(h) => void handleSetAutoRefreshHours(h)}
                onSetDnsDohUrl={(url) => void handleSetDnsDohUrl(url)}
                onOpenLogs={onOpenLogs}
              />
            </div>
          </>
        )}
      </div>

      {appScreen === 'logs' && (
        <div
          className={screenDir === 'forward' ? 'route-enter-from-right' : 'route-enter-from-left'}
        >
          <LogsScreen
            theme={theme}
            accent={ACCENT}
            logs={logs}
            logsLoading={logsLoading}
            logsError={logsError}
            onBack={onBackToMain}
            onClear={onClearLogs}
            onCopy={() => void onCopyLogs()}
          />
        </div>
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
