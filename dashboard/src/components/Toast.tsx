interface ToastProps {
  message: string;
  type: "success" | "error" | "info";
  visible: boolean;
  onDismiss?: () => void;
}

export default function Toast({ message, type, visible, onDismiss }: ToastProps) {
  return (
    <div className={`toast ${visible ? "show" : ""} ${type}`}>
      <span className="toast-message">{message}</span>
      {onDismiss && (
        <button className="toast-dismiss" onClick={onDismiss} aria-label="Dismiss">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}
