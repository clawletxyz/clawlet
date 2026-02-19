interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

export default function Skeleton({
  width = "100%",
  height = "16px",
  borderRadius = "6px",
  className = "",
}: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-[#EBEBEB] rounded ${className}`}
      style={{ width, height, borderRadius }}
    />
  );
}
