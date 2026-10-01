import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  categoryForExpense,
  getCategory,
  inferCategoryFromTitle,
  isValidCategory,
} from "./categories";

describe("CATEGORIES", () => {
  it("has 8 unique keys", () => {
    expect(CATEGORIES).toHaveLength(8);
    expect(new Set(CATEGORIES.map((c) => c.key)).size).toBe(8);
  });
});

describe("getCategory", () => {
  it("returns the matching category", () => {
    expect(getCategory("travel").label).toBe("Travel");
  });

  it("falls back to other for null, undefined, empty and unknown keys", () => {
    expect(getCategory(null).key).toBe("other");
    expect(getCategory(undefined).key).toBe("other");
    expect(getCategory("").key).toBe("other");
    expect(getCategory("gabim").key).toBe("other");
  });
});

describe("isValidCategory", () => {
  it("accepts only known keys", () => {
    expect(isValidCategory("food")).toBe(true);
    expect(isValidCategory("other")).toBe(true);
    expect(isValidCategory("gabim")).toBe(false);
    expect(isValidCategory("")).toBe(false);
    expect(isValidCategory(null)).toBe(false);
    expect(isValidCategory(5)).toBe(false);
  });
});

describe("inferCategoryFromTitle", () => {
  it("handles the demo expenses", () => {
    expect(inferCategoryFromTitle("Rijksmuseum tickets").key).toBe("entertainment");
    expect(inferCategoryFromTitle("Dinner at Foodhallen").key).toBe("food");
    expect(inferCategoryFromTitle("Train from Schiphol").key).toBe("transport");
    expect(inferCategoryFromTitle("Airbnb, 2 nights").key).toBe("housing");
  });

  it("covers the other categories and Albanian words", () => {
    expect(inferCategoryFromTitle("Flight to Rome").key).toBe("travel");
    expect(inferCategoryFromTitle("Electricity bill").key).toBe("bills");
    expect(inferCategoryFromTitle("Darkë në restorant").key).toBe("food");
    expect(inferCategoryFromTitle("Qira").key).toBe("housing");
  });

  it("does not match inside unrelated words", () => {
    expect(inferCategoryFromTitle("Business cards").key).toBe("other");
  });

  it("falls back to other", () => {
    expect(inferCategoryFromTitle("Something random").key).toBe("other");
    expect(inferCategoryFromTitle("").key).toBe("other");
    expect(inferCategoryFromTitle(null).key).toBe("other");
  });
});

describe("categoryForExpense", () => {
  it("prefers the stored category over the title", () => {
    expect(categoryForExpense({ category: "bills", description: "Dinner" }).key).toBe("bills");
  });

  it("infers from the title when nothing is stored", () => {
    expect(categoryForExpense({ category: null, description: "Dinner" }).key).toBe("food");
    expect(categoryForExpense({ description: "Taxi" }).key).toBe("transport");
  });
});
