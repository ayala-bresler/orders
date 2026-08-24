import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { applyPreviewCrop } from '../utils/svgPreviewCrop.js';
import {
  applyFieldStyle,
  applyFieldText,
  prepareSvgForDisplay,
  syncSvgFromState,
  fitSvgToContainerHeight,
  clearSvgFitDimensions,
  PREVIEW_SCROLL_Y_ZOOM,
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
    const zoomed = Number(zoom) >= PREVIEW_SCROLL_Y_ZOOM;

    const refit = () => {
      if (svgRef.current) fitSvgToContainerHeight(svgRef.current, wrapper, zoom);
    };

    refit();
    const raf = window.requestAnimationFrame(refit);

    const observer = new ResizeObserver(() => {
      refit();
    });
    if (pane) observer.observe(pane);
    if (viewport) observer.observe(viewport);

    window.addEventListener('resize', refit);
    window.visualViewport?.addEventListener('resize', refit);

    const handleBeforePrint = () => {
      if (svgRef.current) clearSvgFitDimensions(svgRef.current);
    };
    const handleAfterPrint = () => {
      refit();
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    let scrollRaf = 0;
    const refitOnScroll = () => {
      if (zoomed) return;
      if (scrollRaf) return;
      scrollRaf = window.requestAnimationFrame(() => {
        scrollRaf = 0;
        refit();
      });
    };
    if (!zoomed) {
      window.addEventListener('scroll', refitOnScroll, { passive: true, capture: true });
      window.visualViewport?.addEventListener('scroll', refitOnScroll);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      if (scrollRaf) window.cancelAnimationFrame(scrollRaf);
      observer.disconnect();
      window.removeEventListener('resize', refit);
      window.visualViewport?.removeEventListener('resize', refit);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      window.removeEventListener('scroll', refitOnScroll, true);
      window.visualViewport?.removeEventListener('scroll', refitOnScroll);
    };
  }, [fitByHeight, masterSvg, zoom]);

  // Drag-to-pan when zoomed (scrollbars are hidden).
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const viewport = wrapper?.closest?.('.preview-viewport');
    if (!viewport || Number(zoom) < PREVIEW_SCROLL_Y_ZOOM) return undefined;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    const onPointerDown = (e) => {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      originLeft = viewport.scrollLeft;
      originTop = viewport.scrollTop;
      viewport.classList.add('is-panning');
      try {
        viewport.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      viewport.scrollLeft = originLeft - dx;
      viewport.scrollTop = originTop - dy;
    };

    const onPointerUp = (e) => {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove('is-panning');
      try {
        viewport.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerUp);
    viewport.addEventListener('lostpointercapture', onPointerUp);

    return () => {
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', onPointerUp);
      viewport.removeEventListener('pointercancel', onPointerUp);
      viewport.removeEventListener('lostpointercapture', onPointerUp);
      viewport.classList.remove('is-panning');
    };
  }, [zoom, masterSvg]);

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
