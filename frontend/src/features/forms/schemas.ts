import { z } from "zod";

export const recipientSchema = z.object({
  name: z.string().trim().min(1, "Please enter their name").max(200),
  mobileNumber: z.string().trim().min(1, "Please enter a mobile number").regex(/^\+?[1-9][0-9]{7,14}$/, "Enter a mobile number like +919876543210"),
  addressLine1: z.string().trim().min(1, "Please enter an address").min(3, "That address looks too short").max(300),
  city: z.string().trim().min(1, "Please enter a city").max(100),
  postalCode: z.string().trim().min(1, "Please enter the PIN code").regex(/^[0-9]{6}$/, "PIN code should be 6 digits"),
  dateOfBirth: z.string().min(1, "Please pick a birthday"),
  anniversaryDate: z.string().optional().or(z.literal("")),
  budget: z.string().trim().min(1, "Please enter a budget").transform(Number).pipe(z.number().min(0, "Budget can't be below 0")),
  remark: z.string().max(2000).optional().or(z.literal("")),
  relationship: z.string().optional().or(z.literal("")),
  designation: z.string().trim().max(120, "Keep this under 120 characters").optional().or(z.literal("")),
  isPrimary: z.boolean().optional()
});

/** Adding a recipient: the budget is set later, when the recipient is edited. */
export const recipientCreateSchema = recipientSchema.omit({ budget: true });

/** Editing an existing recipient: older records may lack a birthday or budget, so both are optional here. */
export const recipientEditSchema = recipientSchema.extend({
  dateOfBirth: z.string().optional().or(z.literal("")),
  budget: z.string().trim().optional().or(z.literal("")).refine((value) => !value || (Number.isFinite(Number(value)) && Number(value) >= 0), "Budget can't be below 0")
});
