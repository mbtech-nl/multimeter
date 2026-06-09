// One meter channel's card (Phase 7, plan-7.md §6): an editable role/label, the live value, a
// connection status that doubles as the connect/disconnect control, the meter's front-panel
// controls, and a remove button. The card backs a MeterSession (via the MetersSession coordinator),
// so connect/reconnect/disconnect/controls drive the real (or demo) connection. Reuses the existing
// ConnectionStatus/DeviceMenu + MeterControls by adapting the channel + session into a Meter shape.

import { useState } from 'react';
import type { MeterChannel, Meters } from '@ble-multimeter/react';
import type { Meter } from '@ble-multimeter/react';
import { ConnectionStatus, DeviceMenu } from './ConnectionChip';
import { MeterControls } from './MeterControls';

// Adapt a MeterChannel + its backing session into the `Meter` shape ConnectionStatus/DeviceMenu
// expect, so those components are reused unchanged across one-or-many meters.
function asMeter(channel: MeterChannel, meters: Meters): Meter {
  const session = meters.meterSession(channel.id);
  return {
    state: channel.state,
    reading: channel.reading,
    deviceName: channel.deviceName,
    error: channel.error,
    controls: channel.controls,
    connect: () => session?.connect(),
    reconnect: () => session?.reconnect(),
    disconnect: () => session?.disconnect(),
    toggleBacklight: () => session?.toggleBacklight(),
    sendControl: name => session?.sendControl(name),
  };
}

export function MeterCard({
  channel,
  meters,
  removable,
}: {
  channel: MeterChannel;
  meters: Meters;
  removable: boolean;
}) {
  const meter = asMeter(channel, meters);
  const [editing, setEditing] = useState(false);
  const r = channel.reading;
  const value = r ? (r.overload ? 'OL' : r.displayText || '—') : '—';

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              defaultValue={channel.role}
              aria-label="Channel role"
              onBlur={e => {
                meters.setMeterRole(channel.id, e.target.value.trim() || channel.role);
                setEditing(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-sm text-zinc-100"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="truncate text-left text-sm font-semibold text-zinc-200 hover:text-zinc-50"
              title="Rename this channel"
            >
              {channel.role}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <DeviceMenu meter={meter} />
          {removable && (
            <button
              onClick={() => meters.removeMeter(channel.id)}
              aria-label={`Remove ${channel.role}`}
              title="Remove channel"
              className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
            >
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className={`font-mono text-3xl font-bold tabular-nums ${
            r?.overload ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-50'
          }`}
        >
          {value}
        </span>
        {r?.displayUnit && <span className="text-lg text-zinc-400">{r.displayUnit}</span>}
      </div>

      <ConnectionStatus meter={meter} />

      {channel.state === 'live' && channel.controls.length > 0 && (
        <MeterControls controls={meter.controls} onPress={meter.sendControl} />
      )}
    </div>
  );
}
