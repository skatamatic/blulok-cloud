import { useMemo, useState } from 'react';

import type { GatewayInstanceState } from '@protocol/ipc-channels';

import {

  formatEventLogLocalTime,

  isHeartbeatEvent,

  readHideHeartbeatLogsPreference,

  writeHideHeartbeatLogsPreference,

} from '../utils/event-log.utils';

import { PanelSection } from './PanelSection';



type Props = { gateway: GatewayInstanceState; embedded?: boolean };



export function EventLogConsole({ gateway, embedded }: Props) {

  const [hideHeartbeats, setHideHeartbeats] = useState(readHideHeartbeatLogsPreference);



  const { visible, hiddenCount } = useMemo(() => {

    const reversed = [...gateway.events].reverse();

    if (!hideHeartbeats) return { visible: reversed, hiddenCount: 0 };

    const visibleEvents = reversed.filter((e) => !isHeartbeatEvent(e));

    return { visible: visibleEvents, hiddenCount: reversed.length - visibleEvents.length };

  }, [gateway.events, hideHeartbeats]);



  const toggleHideHeartbeats = (next: boolean) => {

    setHideHeartbeats(next);

    writeHideHeartbeatLogsPreference(next);

  };



  return (

    <PanelSection

      embedded={embedded}

      className={embedded ? 'flex min-h-0 flex-1 flex-col' : 'flex h-64 flex-col'}

    >

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">

        <div>

          <h3 className="font-semibold">Event log</h3>

          <p className="text-xs text-gray-500">Inbound/outbound WebSocket traffic and system messages</p>

        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-400">

          <input

            type="checkbox"

            checked={hideHeartbeats}

            onChange={(e) => toggleHideHeartbeats(e.target.checked)}

          />

          Hide ping/pong

          {hideHeartbeats && hiddenCount > 0 && (

            <span className="text-gray-400">({hiddenCount} hidden)</span>

          )}

        </label>

      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs dark:border-gray-700 dark:bg-gray-950/50">

        {visible.map((e) => (

          <div key={e.id} className="border-b border-gray-200/80 py-1 dark:border-gray-800">

            <span className="text-gray-400">{formatEventLogLocalTime(e.timestamp)}</span>{' '}

            <span

              className={

                e.direction === 'in'

                  ? 'text-blue-600 dark:text-blue-400'

                  : e.direction === 'out'

                    ? 'text-green-600 dark:text-green-400'

                    : 'text-gray-600 dark:text-gray-400'

              }

            >

              [{e.direction}]

            </span>{' '}

            {e.summary}

          </div>

        ))}

        {!visible.length && (

          <p className="text-gray-500">

            {gateway.events.length && hideHeartbeats

              ? 'No events to show — ping/pong hidden'

              : 'No events yet — connect and interact to populate the log'}

          </p>

        )}

      </div>

    </PanelSection>

  );

}

