import type { Map as LeafletMap } from 'leaflet';

export function removeLeafletMap(map: LeafletMap | undefined) {
  if (!map) return;
  map.stop();
  // Leaflet 1.9 leaves its zoom-completion timer running after remove().
  // Finish the transition while the map pane still exists; its later timer
  // then sees an inactive animation and returns without touching removed DOM.
  const animated = map as LeafletMap & {
    _onZoomTransitionEnd?: () => void;
  };
  animated._onZoomTransitionEnd?.();
  map.remove();
}
