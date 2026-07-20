import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { UiSubscription } from '../../app/models';
import type { Theme } from '../../ui/theme';
import { ServerCatalog } from './ServerCatalog';
import { SubscriptionDetails } from './SubscriptionDetails';

// Cap the sheet content and centre it so the list/details read as a column
// instead of stretching across the full desktop-width window.
const CONTENT_MAX_WIDTH = 700;

type ServerSheetProps = {
  groups: UiSubscription[];
  selectedServerId: string;
  addServerOpen: boolean;
  addServerValue: string;
  addServerError: string;
  addServerLoading: boolean;
  importMessage: string;
  refreshAllLoading: boolean;
  subscriptionMenuId: string | null;
  theme: Theme;
  accent: string;
  onSelect: (id: string) => void;
  onRemove: (id: string, event: MouseEvent) => void;
  onDeleteSubscription: (id: string) => void;
  onOpenSubscription: (id: string) => void;
  onCloseSubscription: () => void;
  onRefreshAll: () => void;
  onOpenAddServer: () => void;
  onCancelAddServer: () => void;
  onChangeAddServerValue: (value: string) => void;
  onSubmitAddServer: () => void;
};

export function ServerSheet(props: ServerSheetProps) {
  const { groups, subscriptionMenuId, theme } = props;
  const subscription = groups.find((group) => group.id === subscriptionMenuId) ?? null;
  const latchedSubscription = useRef(subscription);
  if (subscription !== null) latchedSubscription.current = subscription;

  const [detailsVisible, setDetailsVisible] = useState(subscriptionMenuId !== null);
  const [detailsClosing, setDetailsClosing] = useState(false);

  useEffect(() => {
    if (subscriptionMenuId !== null) {
      setDetailsClosing(false);
      setDetailsVisible(true);
      return;
    }
    if (!detailsVisible) return;

    setDetailsClosing(true);
    const timeout = setTimeout(() => {
      setDetailsVisible(false);
      setDetailsClosing(false);
    }, 220);
    return () => clearTimeout(timeout);
  }, [subscriptionMenuId, detailsVisible]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr',
        flex: 1,
        minHeight: 0,
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      <div
        className={detailsVisible ? (detailsClosing ? 'drill-in-back' : 'drill-out-forward') : ''}
        style={{
          gridColumn: 1,
          gridRow: 1,
          minWidth: 0,
          minHeight: 0,
          width: '100%',
          maxWidth: CONTENT_MAX_WIDTH,
          justifySelf: 'center',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          visibility: detailsVisible && !detailsClosing ? 'hidden' : 'visible',
          pointerEvents: detailsVisible && !detailsClosing ? 'none' : 'auto',
        }}
      >
        <ServerCatalog
          groups={groups}
          selectedServerId={props.selectedServerId}
          refreshAllLoading={props.refreshAllLoading}
          importMessage={props.importMessage}
          theme={theme}
          accent={props.accent}
          addServer={{
            open: props.addServerOpen,
            value: props.addServerValue,
            error: props.addServerError,
            loading: props.addServerLoading,
            onOpen: props.onOpenAddServer,
            onCancel: props.onCancelAddServer,
            onChange: props.onChangeAddServerValue,
            onSubmit: props.onSubmitAddServer,
          }}
          onSelect={props.onSelect}
          onRemove={props.onRemove}
          onOpenSubscription={props.onOpenSubscription}
          onRefreshAll={props.onRefreshAll}
        />
      </div>

      {(detailsVisible || detailsClosing) && latchedSubscription.current && (
        <div
          className={detailsClosing ? 'drill-out-back' : 'drill-in-forward'}
          style={{
            gridColumn: 1,
            gridRow: 1,
            minWidth: 0,
            minHeight: 0,
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            justifySelf: 'center',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: theme.sheetBg,
          }}
        >
          <SubscriptionDetails
            subscription={latchedSubscription.current}
            theme={theme}
            onBack={props.onCloseSubscription}
            onDelete={() => {
              const id = latchedSubscription.current?.id;
              if (id) props.onDeleteSubscription(id);
            }}
          />
        </div>
      )}
    </div>
  );
}
