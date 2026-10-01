import { Car, Home, MoreHorizontal, Plane, Receipt, ShoppingBag, Ticket, Utensils } from "lucide-react";
import type { Category } from "@/lib/categories";

/** The category's Lucide icon (the lib only stores the icon name). */
export function categoryGlyph(category: Category, size: number) {
  const props = { size, "aria-hidden": true } as const;
  switch (category.icon) {
    case "Utensils":
      return <Utensils {...props} />;
    case "Car":
      return <Car {...props} />;
    case "Home":
      return <Home {...props} />;
    case "ShoppingBag":
      return <ShoppingBag {...props} />;
    case "Ticket":
      return <Ticket {...props} />;
    case "Plane":
      return <Plane {...props} />;
    case "Receipt":
      return <Receipt {...props} />;
    default:
      return <MoreHorizontal {...props} />;
  }
}

/** Category background: the category color at 15% (22% in dark, see --category-tint). */
export function categoryTint(color: string): string {
  return `color-mix(in srgb, ${color} var(--category-tint), transparent)`;
}

type Props = {
  category: Category;
  className?: string;
};

export default function CategoryIcon({ category, className = "" }: Props) {
  return (
    <span
      role="img"
      aria-label={category.label}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${className}`}
      style={{ backgroundColor: categoryTint(category.color), color: category.color }}
    >
      {categoryGlyph(category, 20)}
    </span>
  );
}
