import { TrailSymbol } from './TrailSymbol';
/**
 * [EN] Renders subtle ambient sunbeams, drifting clouds, and fluttering butterflies over the scrolling park panorama.
 * [KR] 흐르는 파노라마 공원 배경 위로 햇살·구름·나비만 자연스럽게 더합니다.
 */
export function ParkTrailWonders(){
  return <div className="hearts-wonders" aria-hidden="true">
    <div className="hearts-sunbeams"/>
    <span className="hearts-butterfly hearts-butterfly-a"><TrailSymbol kind="butterfly"/></span>
    <span className="hearts-butterfly hearts-butterfly-b"><TrailSymbol kind="butterfly"/></span>
    <span className="hearts-dandelion hearts-dandelion-a"><TrailSymbol kind="sparkle"/></span>
    <span className="hearts-dandelion hearts-dandelion-b"><TrailSymbol kind="sparkle"/></span>
  </div>;
}
