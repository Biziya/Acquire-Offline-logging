import type { ToastNotification, ToastState } from "../types/domain";
import { useCallback, useRef, useState } from "react";

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextToastId = useRef(1);

  const showToast = useCallback((notification: ToastNotification) => {
    const toastId = nextToastId.current;

    nextToastId.current += 1;
    setToast({ id: toastId, ...notification });
  }, []);

  const hideToast = useCallback((toastId: number) => {
    setToast((currentToast) =>
      currentToast?.id === toastId ? null : currentToast,
    );
  }, []);

  return { toast, showToast, hideToast };
}
