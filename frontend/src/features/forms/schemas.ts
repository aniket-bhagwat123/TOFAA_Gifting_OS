import { z } from "zod";

export const recipientSchema = z.object({
  name: z.string().trim().min(1, "Full name is required").max(200),
  mobileNumber: z.string().trim().min(1, "Mobile number is required").regex(/^\+?[1-9][0-9]{7,14}$/, "Enter a valid mobile number"),
  addressLine1: z.string().trim().min(1, "Address is required").min(3, "Enter a valid address").max(300),
  city: z.string().trim().min(1, "City is required").max(100),
  postalCode: z.string().trim().min(1, "Postal code is required").regex(/^[0-9]{6}$/, "Enter a valid 6-digit postal code"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  anniversaryDate: z.string().optional().or(z.literal("")),
  budget: z.string().trim().min(1, "Budget (INR) is required").transform(Number).pipe(z.number().min(0, "Budget cannot be negative")),
  remark: z.string().max(2000).optional().or(z.literal(""))
});

export const customOccasionSchema = z.object({
  name: z.string().trim().min(2, "Occasion name is required").max(120),
  date: z.string().min(1, "Date is required"),
  repeatYearly: z.boolean(),
  description: z.string().max(500).optional().or(z.literal(""))
});
