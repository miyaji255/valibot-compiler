import * as v from "valibot";

export const User = v.object({
  id: v.pipe(v.string(), v.nanoid()),
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
  age: v.optional(v.number()),
  sex: v.picklist(["male", "female", "other", "prefer-not-to-say"]),
});

export const Product = v.object({
  id: v.pipe(v.string(), v.nanoid()),
  name: v.string(),
  price: v.number(),
  description: v.optional(v.string()),
  inStock: v.boolean(),
  tags: v.array(v.string()),
});

export const Order = v.object({
  id: v.pipe(v.string(), v.nanoid()),
  userId: v.pipe(v.string(), v.nanoid()),
  productIds: v.array(v.string()),
  totalAmount: v.number(),
  orderDate: v.pipe(v.string(), v.isoDateTime()),
  status: v.picklist(["pending", "shipped", "delivered", "cancelled"]),
});
