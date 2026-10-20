import type { Metadata } from "next";
import { SharedBrief } from "@/components/SharedBrief";

export const metadata: Metadata = {
  title: "Shared brief",
  description: "A cultural brief shared from TasteForge, with the Qloo evidence behind every line.",
  robots: { index: false, follow: false },
};

export default function SharedBriefPage() {
  return <SharedBrief />;
}
