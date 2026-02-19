import { Toaster as Sonner } from "sonner";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const iconClass = "h-4 w-4 text-[#111111]";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CheckCircle2 className={iconClass} />,
        error: <AlertCircle className={iconClass} />,
        info: <Info className={iconClass} />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-[#111111] group-[.toaster]:border group-[.toaster]:border-[#E0E0E0] group-[.toaster]:shadow-none group-[.toaster]:rounded-[10px] group-[.toaster]:font-[Inter,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]",
          title: "group-[.toast]:text-sm group-[.toast]:font-medium group-[.toast]:text-[#111111]",
          description: "group-[.toast]:text-xs group-[.toast]:text-[#888888]",
          actionButton: "group-[.toast]:bg-[#111111] group-[.toast]:text-white group-[.toast]:rounded-full group-[.toast]:text-xs group-[.toast]:font-medium",
          cancelButton: "group-[.toast]:bg-[#F2F2F2] group-[.toast]:text-[#111111] group-[.toast]:rounded-full group-[.toast]:text-xs group-[.toast]:font-medium group-[.toast]:border-0",
          closeButton: "group-[.toast]:bg-[#F2F2F2] group-[.toast]:border-0 group-[.toast]:text-[#888888] group-[.toast]:hover:bg-[#EBEBEB]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
