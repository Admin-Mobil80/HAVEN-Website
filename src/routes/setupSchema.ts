import { z } from "zod";
import { PRONOUNS } from "../domain/types.js";

// The first-run setup: who the main user is, who Haven is for, and what they call them.
const name = z.string().trim().min(1).max(40);
export const SetupBody = z.object({
  userName: name,
  userPronouns: z.enum(PRONOUNS),
  userRelation: z.string().trim().min(1).max(40), // "son", "daughter", "grandson", "friend"
  elderName: name,
  relationToUser: z.string().trim().min(1).max(40), // "mother", "father", "grandmother", "friend"
  calledBy: z.string().trim().max(30).default(""),
  elderPronouns: z.enum(PRONOUNS),
  city: z.string().trim().max(40).optional(),
  language: z.enum(["en-IN", "hi-IN"]).optional(),
  thingsTheyLove: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  phrases: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
});
export type SetupBodyInput = z.infer<typeof SetupBody>;
