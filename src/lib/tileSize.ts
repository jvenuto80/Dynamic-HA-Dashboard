import type { HassEntity } from 'home-assistant-js-websocket';
import type { RoomEntity, TileSize } from '../types';

/** Auto-pick a size when the user hasn't set one explicitly. */
export function autoSize(entity: HassEntity | undefined, entity_id: string): TileSize {
  const domain = entity_id.split('.')[0];
  if (domain === 'vacuum') return '1x2';
  if (domain === 'cover' && entity?.attributes.current_position != null) return '1x2';
  if (domain === 'light' && entity?.attributes.brightness != null) return '2x1';
  return '1x1';
}

/** Resolve the effective size for a tile (explicit override wins). */
export function effectiveSize(re: RoomEntity, entity: HassEntity | undefined): TileSize {
  return re.size ?? autoSize(entity, re.entity_id);
}

/** Map a size to the grid span flags used by DeviceTile / CSS. */
export function sizeToSpan(size: TileSize): { span: boolean; tall: boolean } {
  switch (size) {
    case '2x1':
      return { span: true, tall: false };
    case '1x2':
      return { span: false, tall: true };
    case '2x2':
      return { span: true, tall: true };
    default:
      return { span: false, tall: false };
  }
}
