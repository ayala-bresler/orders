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
    const pane = wrapper.closest('.preview-pane, .verse-preview-pane');
    const viewport = wrapper.closest('.preview-viewport');

    let scrollRaf = 0;
    const refit = () => {
      if (svgRef.current) fitSvgToContainerHeight(svgRef.current, wrapper, zoom);
    };
    const refitOnScroll = () => {
      if (scrollRaf) return;
      scrollRaf = window.requestAnimationFrame(() => {
        scrollRaf = 0;
        refit();
      });
    };

    const handleBeforePrint = () => {
      if (svgRef.current) clearSvgFitDimensions(svgRef.current);
    };

    const handleAfterPrint = () => {
      refit();
    };

    refit();
    // Second pass after layout settles (flex/footer positions).
    const raf = window.requestAnimationFrame(refit);

    const observer = new ResizeObserver(refit);
    if (pane) observer.observe(pane);
    if (viewport) observer.observe(viewport);
    observer.observe(wrapper);
    window.addEventListener('resize', refit);
    // Mobile: preview often sits below the fold; re-fit when it scrolls into view.
    window.addEventListener('scroll', refitOnScroll, { passive: true, capture: true });
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    window.visualViewport?.addEventListener('resize', refit);
    window.visualViewport?.addEventListener('scroll', refitOnScroll);

    return () => {
      window.cancelAnimationFrame(raf);
      if (scrollRaf) window.cancelAnimationFrame(scrollRaf);
      observer.disconnect();
      window.removeEventListener('resize', refit);
      window.removeEventListener('scroll', refitOnScroll, true);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      window.visualViewport?.removeEventListener('resize', refit);
      window.visualViewport?.removeEventListener('scroll', refitOnScroll);
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
