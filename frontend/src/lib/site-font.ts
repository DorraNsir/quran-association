import { Amiri } from "next/font/google"

/** The public website's Arabic display font (headings; also the hero's floating letters). */
export const amiri = Amiri({ variable: "--font-amiri", subsets: ["arabic", "latin"], weight: ["400", "700"] })
