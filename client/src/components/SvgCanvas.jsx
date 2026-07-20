import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { applyPreviewCrop } from '../utils/svgPreviewCrop.js';
import {
  applyFieldStyle,
  applyFieldText,
  prepareSvgForDisplay,
  syncSvgFromState,
  fitSvgToContainerHeight,
  clearSvgFitDimensions,
} from '../utils/svgLiveUpdate.js';
import { styleForKey } from '../utils/verseStyles.js';

/**
 * Live SVG canvas: mounts the master SVG once and mutates bound text nodes in place.
 * Preview fits the full SVG in the viewport at zoom 1; zoom in to enable scrolling.
 */
const LiveSvgCanvas = forwardRef(function LiveSvgCanvas(
  { masterSvg, fields, values, fontScales, zoom = 1, cropPreview = true, fitByHeight = true },
  ref
) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const svgRef = useRef(null);

  useImperativeHandle(ref, () => ({
    getSvgRoot: () => svgRef.current,
    applyFieldText: (field, text) => {
      if (svgRef.current && field) applyFieldText(svgRef.current, field, text);
    },
    applyFieldStyle: (field, style) => {
      if (svgRef.current && field) applyFieldStyle(svgRef.current, field, style);
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !masterSvg) return;

    container.innerHTML = masterSvg;
    const svg = container.querySelector('svg');
    svgRef.current = svg;
    if (svg) {
      prepareSvgForDisplay(svg);
      if (cropPreview) applyPreviewCrop(svg);
      if (fitByHeight && wrapperRef.current) {
        fitSvgToContainerHeight(svg, wrapperRef.current, zoom);
      }
      if (fields?.length) {
        syncSvgFromState(svg, fields, values, fontScales, styleForKey);
      }
    }
    // Remount only when the SVG document changes — not on zoom/text edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- values/fontScales synced below
  }, [masterSvg, cropPreview, fitByHeight]);

  useEffect(() => {
    if (!svgRef.current || !fields?.length) return;
    syncSvgFromState(svgRef.current, fields, values, fontScales, styleForKey);
  }, [fields, values, fontScales]);

  useEffect(() => {
    if (!fitByHeight || !wrapperRef.current) return undefined;

    const wrapper = wrapperRef.current;

    const refit = () => {
      if (svgRef.current) fitSvgToContainerHeight(svgRef.current, wrapper, zoom);
    };

    const handleBeforePrint = () => {
      if (svgRef.current) clearSvgFitDimensions(svgRef.current);
    };

    const handleAfterPrint = () => {
      refit();
    };

    refit();
    const pane = wrapper.closest('.preview-pane, .verse-preview-pane');
    const observer = new ResizeObserver(refit);
    if (pane) observer.observe(pane);
    window.addEventListener('resize', refit);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', refit);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [fitByHeight, masterSvg, zoom]);

  return (
    <div
      ref={wrapperRef}
      className="svg-canvas svg-canvas--live svg-canvas--height-fit"
      aria-label="תצוגה מקדימה"
    >
      <div className="svg-canvas-inner" ref={containerRef} />
    </div>
  );
});

export default LiveSvgCanvas;
