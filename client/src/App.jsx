import { useEffect, useRef, useState, useCallback } from 'react';
import IdentifyStep from './components/IdentifyStep.jsx';
import ExistingOrderStep from './components/ExistingOrderStep.jsx';
import ProductPicker from './components/ProductPicker.jsx';
import OrderItemDetailsStep from './components/OrderItemDetailsStep.jsx';
import TemplateEditor from './components/TemplateEditor.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import StoreAuthGate from './components/StoreAuthGate.jsx';
import {
  fetchOrderItemDetails,
  deleteOrderItem,
  identifyCustomer,
  refreshSession,
  logoutSession,
  setUnauthorizedHandler,
} from './api.js';
import { fetchStoreMe } from './storeApi.js';
import { fetchAdminMe } from './adminApi.js';
import {
  savePersistedUi,
  loadPersistedUi,
  clearPersistedUi,
} from './utils/sessionPersist.js';
import { clearVerseDraft } from './utils/verseDraftPersist.js';
import { prefetchVerseBake, clearVerseBakeCache } from './utils/verseBakePrefetch.js';
import {
  clearSessionAuth,
  getSessionMaxAgeMs,
  DEFAULT_WARNING_BEFORE_MS,
} from './utils/sessionAuth.js';
import { closeAllLiveConnections } from './utils/liveConnections.js';
import { useInactivityTimeout } from './utils/useInactivityTimeout.js';
import { MOBILE_LAYOUT_MQ } from './utils/svgLiveUpdate.js';

const STEPS = ['identify', 'product', 'details', 'editor'];

/** Mobile shows only one pair at a time; cross-pair nav is via bottom back only. */
const MOBILE_STEP_PAIR_EARLY = ['identify', 'product'];
const MOBILE_STEP_PAIR_LATE = ['details', 'editor'];

const STEP_LABELS = {
  identify: 'הזדהות',
  product: 'בחירת דגם',
  details: 'פרטי עץ חיים',
  editor: 'פסוקים לעצי חיים',
};

function useMobileLayout() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_LAYOUT_MQ).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_LAYOUT_MQ);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return isMobile;
}

function mobileStepPair(stepId) {
  return MOBILE_STEP_PAIR_LATE.includes(stepId)
    ? MOBILE_STEP_PAIR_LATE
    : MOBILE_STEP_PAIR_EARLY;
}

const SESSION_REFRESH_THROTTLE_MS = 2 * 60 * 1000;
const ORDER_RESEND_NOTICE =
  'יש לתאם מול המנהל מערכת את ההזמנה מחדש';
const ORDER_RESEND_NOTICE_MS = 3500;

export default function App() {
  const isMobile = useMobileLayout();
  const appTopRef = useRef(null);
  const [appTopHeight, setAppTopHeight] = useState(96);
  const [storeBooting, setStoreBooting] = useState(true);
  const [store, setStore] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [session, setSession] = useState(null);
  const [step, setStep] = useState('identify');
  const [activeItem, setActiveItem] = useState(null);
  const [itemSupportsVerses, setItemSupportsVerses] = useState(true);
  const [editorTemplateKey, setEditorTemplateKey] = useState('');
  const [flash, setFlash] = useState('');
  const [resendNoticeOpen, setResendNoticeOpen] = useState(false);
  const [restoring, setRestoring] = useState(() => Boolean(loadPersistedUi()?.phone));
  const [leaveDetailsBusy, setLeaveDetailsBusy] = useState(false);
  const [leaveDetailsOpen, setLeaveDetailsOpen] = useState(false);
  const [cancelDetailsOpen, setCancelDetailsOpen] = useState(false);
  const [cancelDetailsBusy, setCancelDetailsBusy] = useState(false);
  /** Ask "delete item?" only for a freshly created item that was never edited. */
  const [detailsMayPromptDelete, setDetailsMayPromptDelete] = useState(false);
  const detailsRef = useRef(null);
  const lastSessionRefreshRef = useRef(0);
  const resendNoticeTimerRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storeData, adminData] = await Promise.all([
          fetchStoreMe(),
          fetchAdminMe().catch(() => ({ authenticated: false })),
        ]);
        if (cancelled) return;
        if (adminData.authenticated && adminData.admin) {
          setAdmin(adminData.admin);
          setStore(null);
        } else if (storeData.authenticated && storeData.store) {
          setStore(storeData.store);
          setAdmin(null);
        } else {
          setStore(null);
          setAdmin(null);
        }
      } catch {
        if (!cancelled) {
          setStore(null);
          setAdmin(null);
        }
      } finally {
        if (!cancelled) setStoreBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    if (resendNoticeTimerRef.current) {
      window.clearTimeout(resendNoticeTimerRef.current);
    }
  }, []);

  const handleStoreAuthenticated = useCallback((nextStore) => {
    setAdmin(null);
    setStore(nextStore);
  }, []);

  const handleAdminAuthenticated = useCallback((nextAdmin) => {
    setStore(null);
    setAdmin(nextAdmin || { role: 'admin', displayName: 'מנהל מערכת' });
  }, []);

  const endSession = useCallback(async (message = 'הסשן הסתיים. יש להתחבר מחדש.') => {
    closeAllLiveConnections();
    try {
      await logoutSession();
    } catch {
      clearSessionAuth();
    }
    clearPersistedUi();
    setSession(null);
    setActiveItem(null);
    setStep('identify');
    setLeaveDetailsOpen(false);
    setCancelDetailsOpen(false);
    setFlash(message);
  }, []);

  const touchServerSession = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastSessionRefreshRef.current < SESSION_REFRESH_THROTTLE_MS) {
      return;
    }
    lastSessionRefreshRef.current = now;
    try {
      await refreshSession();
    } catch {
      /* 401 triggers unauthorized handler */
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      endSession('פג תוקף הסשן. יש להתחבר מחדש.');
    });
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  const {
    warningOpen: inactivityWarningOpen,
    dismissWarning: dismissInactivityWarning,
  } = useInactivityTimeout({
    enabled: Boolean(session),
    maxAgeMs: getSessionMaxAgeMs(),
    warningBeforeMs: DEFAULT_WARNING_BEFORE_MS,
    onActivity: () => {
      touchServerSession({ force: false });
    },
    onTimeout: () => {
      endSession('המערכת נותקה עקב חוסר פעילות.');
    },
  });

  const handleExtendSession = async () => {
    await touchServerSession({ force: true });
    dismissInactivityWarning();
  };

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const saved = loadPersistedUi();
      if (!saved?.phone) {
        setRestoring(false);
        return;
      }

      try {
        const result = await identifyCustomer({
          phone: saved.phone,
          email: saved.email || undefined,
        });
        if (cancelled) return;

        if (result.isNew && result.needsConfirmation) {
          clearPersistedUi();
          setRestoring(false);
          return;
        }

        setSession(result);

        let item = null;
        if (saved.activeItemId) {
          item =
            (result.items || []).find((i) => i.order_item_id === saved.activeItemId) ||
            null;
          setActiveItem(item);
        }

        let nextStep = saved.step || 'product';
        if (nextStep === 'details' || nextStep === 'editor') {
          if (!item) {
            nextStep = result.items?.length ? 'resume' : 'product';
          } else if (nextStep === 'editor' && item.supports_verses === false) {
            nextStep = 'details';
          }
        }
        if (nextStep === 'resume' && !(result.items && result.items.length)) {
          nextStep = 'product';
        }
        if (nextStep === 'identify') {
          nextStep = result.items?.length ? 'resume' : 'product';
        }

        setItemSupportsVerses(saved.itemSupportsVerses !== false);
        if (saved.editorTemplateKey) setEditorTemplateKey(saved.editorTemplateKey);
        setStep(nextStep);
      } catch {
        clearPersistedUi();
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (restoring) return;
    if (!session) {
      clearPersistedUi();
      return;
    }
    savePersistedUi({
      session,
      step,
      activeItem,
      itemSupportsVerses,
      editorTemplateKey,
    });
  }, [session, step, activeItem, itemSupportsVerses, editorTemplateKey, restoring]);

  const openVerseItem = async (item) => {
    if (!session?.order?.order_id || !item?.order_item_id) return;
    setActiveItem(item);
    setDetailsMayPromptDelete(false);
    setFlash('');
    try {
      const data = await fetchOrderItemDetails(session.order.order_id, item.order_item_id);
      const supports = data.supportsVerses !== false;
      setItemSupportsVerses(supports);
      setEditorTemplateKey(
        `${data.item?.plate_diameter ?? ''}:${data.item?.size_code ?? ''}`
      );
      // Sent items without verses: show details with “ההזמנה נשלחה”.
      if (!supports) {
        setStep('details');
        return;
      }
      const nextKey = `${data.item?.plate_diameter ?? ''}:${data.item?.size_code ?? ''}`;
      if (data.detailsComplete) {
        prefetchVerseBake({
          orderId: session.order.order_id,
          itemId: item.order_item_id,
          templateKey: nextKey,
        });
        setStep('editor');
      } else {
        setStep('details');
      }
    } catch {
      setStep('details');
    }
  };

  const handleIdentified = (result) => {
    setSession(result);
    const hasItems = result.returning && result.items && result.items.length > 0;
    setStep(hasItems ? 'resume' : 'product');
    setFlash('');
  };

  const handleContinueExisting = (item) => {
    openVerseItem(item);
  };

  const handleNewItem = (item, model) => {
    const enriched = {
      ...item,
      model_name: item.model_name || model?.model_name,
      product_name: item.model_name || model?.model_name,
    };
    setActiveItem(enriched);
    setItemSupportsVerses(true);
    setEditorTemplateKey('12:12');
    setDetailsMayPromptDelete(true);
    setSession((s) =>
      s ? { ...s, items: [...(s.items || []), enriched] } : s
    );
    setStep('details');
    setFlash('');
  };

  const handlePlainItem = (item, model) => {
    const label = item.model_name || model?.model_name || 'הדגם';
    setFlash(`הדגם "${label}" נוסף להזמנה (ללא התאמת פסוקים).`);
    setSession((s) =>
      s
        ? {
            ...s,
            items: [
              ...s.items,
              {
                ...item,
                model_name: item.model_name || model?.model_name,
                product_name: item.model_name || model?.model_name,
              },
            ],
          }
        : s
    );
  };

  const backToProducts = () => {
    const hasItems = session?.items && session.items.length > 0;
    setStep(hasItems ? 'resume' : 'product');
    setActiveItem(null);
    setDetailsMayPromptDelete(false);
    setFlash('');
  };

  const requestCancelDetails = () => {
    // Only prompt delete for a brand-new item that still matches defaults.
    const untouched = !detailsRef.current?.isDirty?.();
    if (detailsMayPromptDelete && untouched) {
      setCancelDetailsOpen(true);
      return;
    }
    leaveDetailsWithoutDelete();
  };

  const leaveDetailsWithoutDelete = () => {
    if (cancelDetailsBusy) return;
    setCancelDetailsOpen(false);
    setDetailsMayPromptDelete(false);
    backToProducts();
  };

  const handleConfirmCancelDetails = async () => {
    const itemId = activeItem?.order_item_id;
    if (!session?.order?.order_id || !itemId) {
      leaveDetailsWithoutDelete();
      return;
    }
    setCancelDetailsBusy(true);
    try {
      await deleteOrderItem(session.order.order_id, itemId);
      clearVerseDraft(session.order.order_id, itemId);
      const nextItems = (session.items || []).filter(
        (item) => Number(item.order_item_id) !== Number(itemId)
      );
      setSession((s) => (s ? { ...s, items: nextItems } : s));
      setActiveItem(null);
      setDetailsMayPromptDelete(false);
      setCancelDetailsOpen(false);
      setStep(nextItems.length > 0 ? 'resume' : 'product');
      setFlash('');
    } catch (err) {
      setFlash(err.message);
      setCancelDetailsOpen(false);
    } finally {
      setCancelDetailsBusy(false);
    }
  };

  const handleBackToExistingOrder = () => {
    setStep('resume');
    setActiveItem(null);
    setFlash('');
  };

  const handleDeleteItem = async (itemId) => {
    if (!session?.order?.order_id) return;
    try {
      await deleteOrderItem(session.order.order_id, itemId);
      clearVerseDraft(session.order.order_id, itemId);
      setSession((s) =>
        s
          ? {
              ...s,
              items: s.items.filter((item) => item.order_item_id !== itemId),
            }
          : s
      );
      setActiveItem((current) =>
        current?.order_item_id === itemId ? null : current
      );
      setFlash('');
    } catch (err) {
      setFlash(err.message);
    }
  };

  const goToDetails = () => {
    if (activeItem) {
      setDetailsMayPromptDelete(false);
      setStep('details');
      setFlash('');
    }
  };

  const goToEditor = async (templateKey) => {
    setDetailsMayPromptDelete(false);
    if (!activeItem || !itemSupportsVerses) return;
    let key = templateKey ? String(templateKey) : editorTemplateKey;
    if (templateKey) {
      setEditorTemplateKey(String(templateKey));
    } else if (session?.order?.order_id && activeItem.order_item_id) {
      try {
        const data = await fetchOrderItemDetails(
          session.order.order_id,
          activeItem.order_item_id
        );
        key = `${data.item?.plate_diameter ?? ''}:${data.item?.size_code ?? ''}`;
        setEditorTemplateKey(key);
      } catch {
        /* keep previous key */
      }
    }
    if (session?.order?.order_id && activeItem.order_item_id) {
      prefetchVerseBake({
        orderId: session.order.order_id,
        itemId: activeItem.order_item_id,
        templateKey: key,
      });
    }
    setStep('editor');
    setFlash('');
  };

  const handleOrderComplete = (completedItemId, _items, options = {}) => {
    const doneId = Number(completedItemId ?? activeItem?.order_item_id);
    if (session?.order?.order_id && Number.isFinite(doneId)) {
      clearVerseDraft(session.order.order_id, doneId);
      clearVerseBakeCache(session.order.order_id, doneId);
    }

    const finish = () => {
      setResendNoticeOpen(false);
      endSession('ההזמנה הושלמה. ניתן להתחיל הזמנה חדשה.');
    };

    // Resend of an already-sent item: brief notice, then return to identify.
    if (options.isResend) {
      if (resendNoticeTimerRef.current) {
        window.clearTimeout(resendNoticeTimerRef.current);
      }
      setResendNoticeOpen(true);
      resendNoticeTimerRef.current = window.setTimeout(finish, ORDER_RESEND_NOTICE_MS);
      return;
    }

    finish();
  };

  const logout = () => {
    endSession('');
  };

  const currentStepId = step === 'resume' ? 'product' : step;
  const visibleSteps = isMobile ? mobileStepPair(currentStepId) : STEPS;
  const headerMode =
    !session || step === 'identify'
      ? 'identify'
      : currentStepId === 'details' || currentStepId === 'editor'
        ? 'side'
        : 'center';
  const showCustomerInHeader = headerMode === 'side' && Boolean(session);
  /** On mobile identify: still show the early step pair (no logo header). */
  const showAppTop = headerMode !== 'identify' || isMobile;
  const showSiteHeader = headerMode !== 'identify';
  const showStepsNav = Boolean(session) || (isMobile && headerMode === 'identify');

  // Mobile: keep header pinned; spacer height tracks the fixed bar.
  useEffect(() => {
    if (!isMobile || !showAppTop) return undefined;
    const el = appTopRef.current;
    if (!el) return undefined;
    const sync = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) setAppTopHeight(h);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [isMobile, showAppTop, headerMode, showSiteHeader, showStepsNav, showCustomerInHeader]);

  const stepClickable = (s) => {
    if (isMobile && !visibleSteps.includes(s)) return false;
    if (s === 'identify') return true;
    if (s === 'product') return Boolean(session);
    if (s === 'details') return Boolean(activeItem);
    if (s === 'editor') return Boolean(activeItem) && itemSupportsVerses;
    return false;
  };

  const goToStep = (s) => {
    if (s === currentStepId) return;
    // Mobile: no jumping between early/late pairs via tabs — use bottom back.
    if (isMobile && !visibleSteps.includes(s)) return;
    if (currentStepId === 'details' && s === 'editor') {
      if (!itemSupportsVerses) return;
      if (detailsRef.current?.isDirty?.()) {
        setLeaveDetailsOpen(true);
        return;
      }
      goToEditor(detailsRef.current?.getTemplateKey?.() || editorTemplateKey);
      return;
    }
    if (s === 'identify') logout();
    else if (s === 'product') backToProducts();
    else if (s === 'details') goToDetails();
    else if (s === 'editor') goToEditor();
  };

  const handleLeaveDetailsSave = async () => {
    setLeaveDetailsBusy(true);
    try {
      const result = await detailsRef.current?.save?.();
      const key =
        detailsRef.current?.getTemplateKey?.()
        || `${result?.item?.plate_diameter ?? ''}:${result?.item?.size_code ?? ''}`;
      setLeaveDetailsOpen(false);
      await goToEditor(key);
    } catch {
      /* details step shows error */
    } finally {
      setLeaveDetailsBusy(false);
    }
  };

  const handleLeaveDetailsSkip = () => {
    const key = detailsRef.current?.getTemplateKey?.() || editorTemplateKey;
    setLeaveDetailsOpen(false);
    goToEditor(key);
  };

  if (storeBooting) {
    return (
      <div className="app" dir="rtl">
        <main className="main-identify">
          <div className="notice">טוען…</div>
        </main>
      </div>
    );
  }

  if (!store && !admin) {
    return (
      <div className="app" dir="rtl">
        <StoreAuthGate
          onAuthenticated={handleStoreAuthenticated}
          onAdminAuthenticated={handleAdminAuthenticated}
        />
      </div>
    );
  }

  if (store?.needsEmailSetup) {
    return (
      <div className="app" dir="rtl">
        <StoreAuthGate
          initialStep="set_email"
          onAuthenticated={handleStoreAuthenticated}
        />
      </div>
    );
  }

  if (restoring) {
    return (
      <div className="app" dir="rtl">
        <main className="main-identify">
          <div className="identify-brand">
            <img
              className="identify-logo"
              src="/img-judaica-logo-with-bg.png?v=5"
              alt="IMG JUDAICA LTD — אי אמ ג'י יודאיקה בע״מ"
            />
          </div>
          <div className="notice">טוען את ההזמנה…</div>
        </main>
      </div>
    );
  }

  return (
    <div
      className="app"
      dir="rtl"
      style={
        isMobile && showAppTop
          ? { '--app-top-mobile-h': `${appTopHeight}px` }
          : undefined
      }
    >
      {showAppTop && (
        <div
          ref={appTopRef}
          className={`app-top app-top--${headerMode}${isMobile ? ' app-top--mobile' : ''}`}
        >
          {showSiteHeader ? (
            <header className={`site-header site-header--${headerMode}`}>
              <img
                className="site-logo"
                src="/img-judaica-logo-with-bg.png?v=5"
                alt="IMG JUDAICA LTD — אי אמ ג'י יודאיקה בע״מ"
              />
              {showCustomerInHeader ? (
                <div className="site-header-copy">
                  <div className="session-info">
                    <span className="session-greeting">היי {session.customer.full_name}!</span>
                    <span className="session-phone">{session.customer.phone}</span>
                    <span className="session-order">הזמנה #{session.order.order_id}</span>
                  </div>
                </div>
              ) : null}
            </header>
          ) : null}

          {showStepsNav && (
            <nav className="steps" aria-label="שלבי הזמנה">
              <div className={`steps-buttons${isMobile ? ' steps-buttons--pair' : ''}`}>
                {visibleSteps.map((s) => {
                  const unavailable = s === 'editor' && activeItem && !itemSupportsVerses;
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`step ${currentStepId === s ? 'active' : ''}${unavailable ? ' step-unavailable' : ''}`}
                      onClick={() => goToStep(s)}
                      disabled={!stepClickable(s)}
                      title={unavailable ? 'פסוקים לעצי חיים אינם זמינים למידה זו' : undefined}
                    >
                      {STEP_LABELS[s]}
                      {unavailable ? ' (לא זמין)' : ''}
                    </button>
                  );
                })}
              </div>
            </nav>
          )}
        </div>
      )}
      {isMobile && showAppTop ? (
        <div
          className="app-top-mobile-spacer"
          style={{ height: appTopHeight }}
          aria-hidden="true"
        />
      ) : null}

      {flash && <div className="flash">{flash}</div>}

      {resendNoticeOpen ? (
        <div
          className="confirm-overlay order-resend-notice"
          role="alertdialog"
          aria-modal="true"
          aria-live="assertive"
          aria-labelledby="order-resend-notice-title"
        >
          <div className="card confirm-dialog order-resend-notice-dialog">
            <p id="order-resend-notice-title" className="confirm-dialog-message">
              {ORDER_RESEND_NOTICE}
            </p>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={inactivityWarningOpen}
        title="הסשן עומד להסתיים"
        message="לא זוהתה פעילות. הסשן יסתיים בעוד כדקה. לחצו על «המשך עבודה» כדי להאריך את הסשן."
        confirmLabel="המשך עבודה"
        cancelLabel="התנתקות"
        onConfirm={handleExtendSession}
        onCancel={() => endSession('התנתקת מהמערכת.')}
      />

      <ConfirmDialog
        open={leaveDetailsOpen}
        title="מעבר לפסוקים לעצי חיים"
        message="האם לשמור את פרטי ההזמנה לפני המעבר לפסוקים?"
        confirmLabel="שמירה והמשך"
        secondaryLabel="דילוג"
        cancelLabel="ביטול"
        busy={leaveDetailsBusy}
        onConfirm={handleLeaveDetailsSave}
        onSecondary={handleLeaveDetailsSkip}
        onCancel={() => {
          if (!leaveDetailsBusy) setLeaveDetailsOpen(false);
        }}
      />

      <ConfirmDialog
        open={cancelDetailsOpen}
        title="מחיקת הזמנה"
        message="האם למחוק את ההזמנה?"
        confirmLabel="כן, מחק"
        cancelLabel="לא"
        danger
        busy={cancelDetailsBusy}
        onConfirm={handleConfirmCancelDetails}
        onCancel={leaveDetailsWithoutDelete}
      />

      <main
        className={
          step === 'identify'
            ? 'main-identify'
            : step === 'editor'
              ? 'main-editor'
              : step === 'details'
                ? 'main-details'
                : step === 'product'
                  ? 'main-model-picker'
                  : step === 'resume'
                    ? 'main-resume'
                    : undefined
        }
      >
        {step === 'identify' && (
          <IdentifyStep onIdentified={handleIdentified} isAdmin={Boolean(admin)} />
        )}

        {step === 'resume' && session && (
          <ExistingOrderStep
            order={session.order}
            items={session.items}
            customerName={session.customer?.full_name}
            onContinueItem={handleContinueExisting}
            onNewProduct={() => {
              setStep('product');
              setFlash('');
            }}
            onDeleteItem={handleDeleteItem}
          />
        )}

        {step === 'product' && session && (
          <ProductPicker
            order={session.order}
            existingItems={session.items}
            onItemReady={handleNewItem}
            onPlainItem={handlePlainItem}
            onBackToExisting={handleBackToExistingOrder}
            onOpenItem={handleContinueExisting}
          />
        )}

        {step === 'details' && session && activeItem && (
          <OrderItemDetailsStep
            ref={detailsRef}
            orderId={session.order.order_id}
            itemId={activeItem.order_item_id}
            orderSent={activeItem.status === 'completed'}
            onContinueToVerses={goToEditor}
            onFinishWithoutVerses={handleOrderComplete}
            onSupportsVersesChange={setItemSupportsVerses}
            onDirtyChange={(dirty) => {
              if (dirty) setDetailsMayPromptDelete(false);
            }}
            onCancel={requestCancelDetails}
          />
        )}

        {step === 'editor' && session && activeItem && itemSupportsVerses && (
          <TemplateEditor
            key={`${activeItem.order_item_id}-${editorTemplateKey}`}
            orderId={session.order.order_id}
            itemId={activeItem.order_item_id}
            templateKey={editorTemplateKey}
            orderSent={activeItem.status === 'completed'}
            onEditOrderDetails={goToDetails}
            onOrderComplete={handleOrderComplete}
          />
        )}
      </main>
    </div>
  );
}
