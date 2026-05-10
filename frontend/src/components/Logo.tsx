import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  alt?: string;
};

export function Logo({ className, alt = "Stash" }: LogoProps) {
  return (
    <>
      <img
        src="/logo-light-nobg.png"
        alt={alt}
        draggable={false}
        className={cn("block select-none dark:hidden", className)}
      />
      <img
        src="/logo-nobg.png"
        alt={alt}
        draggable={false}
        className={cn("hidden select-none dark:block", className)}
      />
    </>
  );
}
