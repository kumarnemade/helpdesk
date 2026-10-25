// Seeds 100 realistic demo tickets into the dev database so sorting (and,
// later, filtering) has varied data to work with. Run with
// `bun run db:seed:tickets` from server/.
//
// Statuses, categories, assignees, senders and received dates are spread out
// with a fixed-seed PRNG, so every run produces the same data. Each ticket has
// a fixed emailMessageId and rows are inserted with skipDuplicates, so the
// script is safe to re-run: existing seed tickets (and any other tickets) are
// left untouched.
import type { AgentTicketStatus, TicketCategory } from "core";
import { AI_AGENT_EMAIL } from "../src/aiAgent";
import { prisma } from "../src/db";
import type { Prisma } from "../src/generated/prisma/client";

type SeedTicket = [category: TicketCategory | null, subject: string, body: string];

const TICKETS: SeedTicket[] = [
  // Technical questions
  ["technical_question", "Video lessons stuck on loading", "Every video in Module 3 of the Python for Data Analysis course just shows a spinning wheel. I've tried Chrome and Firefox and cleared my cache. Other modules play fine."],
  ["technical_question", "Can't log in after password reset", "I reset my password this morning and got the confirmation email, but the new password is rejected on the login page. I've tried three times and I'm worried about being locked out."],
  ["technical_question", "Two-factor code never arrives", "I've enabled two-factor authentication but the SMS code never arrives on my phone (UK number). I'm completely locked out until I can get in."],
  ["technical_question", "Certificate PDF downloads blank", "I finished the Project Management Fundamentals course and the certificate downloads as a blank white page. I need it for my performance review next week."],
  ["technical_question", "Quiz answers not saving", "Halfway through the Module 5 quiz the page refreshed and all my answers were gone. It still counted as an attempt and I only have one left."],
  ["technical_question", "iOS app crashes on launch", "Since the latest update the iOS app crashes as soon as I open it. I'm on an iPhone 13 running iOS 18. Reinstalling didn't help."],
  ["technical_question", "Subtitles out of sync in Spanish course", "Subtitles in the Spanish for Beginners lessons are about five seconds behind the audio, which makes them really hard to follow."],
  ["technical_question", "Downloaded lessons won't play offline", "I downloaded lessons in the Android app for a flight, but offline they all show 'Content unavailable'. They play fine when I'm online."],
  ["technical_question", "Course progress reset to 0%", "My progress on the Excel Masterclass shows 0% even though I completed 14 lessons last week. The completed ticks are gone too."],
  ["technical_question", "Final project upload fails at 90%", "Uploading my final project (a 48 MB zip) fails at about 90% with 'Network error'. My connection is stable and smaller uploads work."],
  ["technical_question", "Microsoft SSO sign-in error AADSTS50011", "When I click 'Sign in with Microsoft' I get 'AADSTS50011: redirect URI mismatch'. Several colleagues on our team plan have the same problem."],
  ["technical_question", "Course page returns Internal Server Error", "Opening the Intro to Machine Learning course page gives an 'Internal Server Error'. It's been like this since yesterday afternoon."],
  ["technical_question", "Audio plays but video is black", "On my Windows laptop lessons play audio but the video area stays black, in both Edge and Chrome. The same lessons work on my phone."],
  ["technical_question", "Run button does nothing in code exercises", "The Run button in the JavaScript exercises does nothing. The browser console shows a blocked script error, so it might be my company firewall."],
  ["technical_question", "Receiving the same notification email 15 times a day", "I'm getting the same 'New lesson available' email 10 to 15 times a day. My notification settings only have the weekly digest switched on."],
  ["technical_question", "Profile photo won't update", "Uploading a new profile photo shows a success message but the old picture stays. I've tried JPG and PNG files under 1 MB."],
  ["technical_question", "Code samples unreadable in dark mode", "With dark mode on, the code samples in lessons are dark grey on black and nearly impossible to read."],
  ["technical_question", "Live Q&A link says meeting not found", "The link to Thursday's live Q&A session says 'Meeting not found'. The session starts in an hour, please help!"],
  ["technical_question", "Screen reader skips quiz options", "I use NVDA and the multiple-choice options in quizzes aren't announced, so I can't tell which answer I'm selecting."],
  ["technical_question", "Playback speed resets every lesson", "Each time a new lesson starts the playback speed goes back to 1x. Is there a way to keep it at 1.5x?"],
  ["technical_question", "Account locked after two sign-in attempts", "My account says it's locked after too many sign-in attempts, but I only tried twice. It's been over an hour and it's still locked."],
  ["technical_question", "Verification email never received", "I signed up through my company's invite but never received the verification email. I've checked spam and the promotions tab."],
  ["technical_question", "Transcript download is an empty file", "The 'Download transcript' button gives me an empty .txt file for every lesson in Module 2."],
  ["technical_question", "Android app stuck on 'Syncing'", "The Android app has shown 'Syncing…' for two days and the notes I take there aren't appearing on the website."],
  ["technical_question", "Slides don't load in Safari", "On Safari 18 the slide decks inside lessons are just a grey box. They work in Chrome on the same Mac."],
  ["technical_question", "Timed exam closed after 35 minutes", "The final exam said 60 minutes but closed and submitted automatically after about 35. I hadn't finished."],
  ["technical_question", "Deadlines shown in the wrong timezone", "Assignment deadlines show in US Pacific time even though my profile is set to Singapore. I almost missed one because of this."],
  ["technical_question", "Google Calendar connection fails", "Connecting Google Calendar fails with 'Authorization failed'. I've allowed pop-ups and tried twice in different browsers."],
  ["technical_question", "Lesson bookmarks disappeared", "All my lesson bookmarks disappeared after I logged in on a new laptop."],
  ["technical_question", "Forum posts not appearing", "I posted a question in the course forum twice, but neither post shows up. There's no error message."],

  // General questions
  ["general_question", "Do certificates expire?", "My employer wants to know whether the Data Analytics certificate has an expiry date or needs renewing."],
  ["general_question", "Change the email address on my account", "I'm leaving my job and need to move my account from my work email to my personal one without losing my courses."],
  ["general_question", "Which course should a beginner start with?", "I'm completely new to programming. Should I start with Python Basics or Web Development 101?"],
  ["general_question", "Invoice with company name and VAT number", "Our finance team needs an invoice with our company name and VAT number for last month's purchase. Could you reissue it?"],
  ["general_question", "Team licences for 25 people", "We're a team of 25 and would like a group plan. What pricing and admin features are available?"],
  ["general_question", "Is the PM course PMI accredited?", "Is the Project Management Fundamentals course accredited by PMI, and does it count towards PDUs?"],
  ["general_question", "How long do I keep access to a course?", "If I buy a single course, how long will I have access to it? Is it lifetime access?"],
  ["general_question", "Student discount", "I'm a full-time university student. Do you offer a student discount, and what proof do you need?"],
  ["general_question", "Delete my account and personal data", "Please delete my account and all personal data under GDPR. My account uses the email address I'm writing from."],
  ["general_question", "Name spelled wrong on certificate", "My certificate says 'Jon' but my name is 'John'. Can it be corrected and reissued?"],
  ["general_question", "Pause subscription while travelling", "I'm travelling for two months with limited internet. Can I pause my subscription instead of cancelling it?"],
  ["general_question", "Business courses in French", "Are any of the business courses available in French, or with French subtitles?"],
  ["general_question", "Gift a course to a friend", "I'd like to buy the Photography Basics course as a birthday gift. How do I send it to someone else?"],
  ["general_question", "Contacting the instructor", "I have a question about the case study in Module 4. Is there a way to contact the instructor directly?"],
  ["general_question", "Advanced cloud security course planned?", "Do you have plans to release an advanced cloud security course this year?"],
  ["general_question", "Move a course to a colleague's account", "I bought a course on my account but my colleague should be taking it. Can it be moved to their account?"],
  ["general_question", "Captions and transcripts on all videos?", "Do all videos have captions and transcripts? I'm hard of hearing and need them for every lesson."],
  ["general_question", "Discount for nonprofits", "We're a registered charity. Do you offer discounts for nonprofit organisations?"],
  ["general_question", "Paying without a credit card", "Can I pay with PayPal or bank transfer? I don't have a credit card."],
  ["general_question", "Exam retake policy", "I failed the final exam by two points. How many retakes am I allowed, and is there a waiting period?"],
  ["general_question", "Adding my certificate to LinkedIn", "How do I add my certificate to the 'Licenses & certifications' section of my LinkedIn profile?"],
  ["general_question", "Update billing address on receipts", "I've moved house and need to update the billing address that appears on my receipts."],
  ["general_question", "Prerequisites for Machine Learning", "Do I need to know statistics before taking the Machine Learning course, or is it covered?"],
  ["general_question", "Where is learner data stored?", "Our IT security team wants to know where learner data is stored and whether you're SOC 2 compliant."],
  ["general_question", "Merge two accounts", "I accidentally created a second account with my Gmail. Can you merge its courses into my main account?"],
  ["general_question", "Is there a deadline to finish a course?", "Is there a deadline to finish a course once I've started it, or can I go at my own pace?"],
  ["general_question", "Printed copy of my certificate", "Can I order a printed copy of my certificate? I'd like to frame it for my office."],
  ["general_question", "Progress reports for team admins", "As a team admin, can I see which lessons each member of my team has completed?"],
  ["general_question", "Thank you for the SQL joins lesson", "Just wanted to say the SQL joins lesson in Module 2 is the clearest explanation I've seen. Please pass my thanks to the instructor!"],
  ["general_question", "Applying to become an instructor", "I'm a UX designer with 10 years' experience. How can I apply to teach a course on your platform?"],

  // Refund requests
  ["refund_request", "Charged twice for annual plan", "My card was charged $199 twice on the same day for the annual plan. Please refund the duplicate payment."],
  ["refund_request", "Bought the wrong Excel course", "I meant to buy Excel Intermediate but clicked Excel Beginner. I haven't started it. Can I get a refund or swap it?"],
  ["refund_request", "Charged after cancelling subscription", "I cancelled my monthly subscription on the 3rd but was charged again on the 15th. Please refund this charge."],
  ["refund_request", "Advanced React course not as described", "The Advanced React course only covers basics I already know and doesn't match its description. I'd like a refund."],
  ["refund_request", "Free trial converted without a reminder", "My free trial turned into a paid subscription without any reminder email. I'd like the $29 refunded."],
  ["refund_request", "Refund for 8 unused team seats", "We bought 20 seats but only 12 people joined. Can we get a refund for the 8 unused seats?"],
  ["refund_request", "Price dropped two days after I bought", "I bought the Data Science bundle for $149 and it went on sale for $89 two days later. Could you refund the difference?"],
  ["refund_request", "Approved refund still not received", "I was told 10 days ago that my refund was approved, but nothing has reached my account yet."],
  ["refund_request", "Charged in USD instead of EUR", "I was charged in USD instead of EUR and my bank added a foreign transaction fee. Can this be refunded?"],
  ["refund_request", "Couldn't finish because videos never loaded", "The videos never loaded on my device, so I couldn't complete the course within the access period. I'd like a refund."],
  ["refund_request", "Unrecognised charge on my card", "There's a charge from you on my card that I don't recognise, and I've never had an account. Please refund it and investigate."],
  ["refund_request", "Live workshop rescheduled", "The live workshop I paid for was rescheduled to a date I can't attend. Can I get a refund?"],
  ["refund_request", "Prorated refund when switching to monthly", "I'd like to switch from annual to monthly billing and get a prorated refund for the remaining months."],
  ["refund_request", "Bought the same course twice", "I bought the same course twice, once in the app and once on the website. Please refund one of them."],
  ["refund_request", "Renewal refund after deleting account", "I deleted my account by accident the day after it renewed. Can the renewal be refunded?"],
  ["refund_request", "Employer is paying instead", "My company will pay for the course through their own account, so I'd like a refund for the one I bought myself."],
  ["refund_request", "Forgot about auto-renewal", "My annual plan auto-renewed yesterday. I haven't used the platform in months. Is a refund possible?"],
  ["refund_request", "Refund issued to an expired card", "My refund was issued to a card that has since expired. How will I receive the money?"],
  ["refund_request", "Course removed from my bundle", "I bought a 5-course bundle but one course was removed from the catalogue. Can I get a partial refund?"],
  ["refund_request", "Refund an unused exam voucher", "I bought an exam voucher but have decided not to sit the exam. Can the voucher be refunded?"],
  ["refund_request", "VAT charged despite valid VAT number", "I entered a valid VAT number at checkout but VAT was still added. Please refund the VAT amount."],
  ["refund_request", "Purchases made by my child", "My son bought three courses in the mobile app without my permission. I'd like these refunded."],
  ["refund_request", "Purchased course missing from library", "The course I bought is no longer in my library. Please either restore it or refund me."],
  ["refund_request", "Charged $39 after cancelling trial", "I cancelled during my 7-day trial and have the confirmation email, but I was still charged $39."],
  ["refund_request", "Refund policy for cancelling team plan", "What's your refund policy if we cancel our team plan partway through the year?"],

  // Not yet categorised
  [null, "Urgent: certificate verification needed by Friday", "I need my certificate verified by Friday for my employer's bonus scheme. Who can confirm it's genuine?"],
  [null, "Re: my previous message", "Following up on my earlier message about my account. I haven't heard back yet. Could someone take a look?"],
  [null, "Hello", "Hi, I have a few questions about your platform. When would be a good time to chat?"],
  [null, "Problem with order #48213", "Something went wrong with order #48213. The course isn't in my library but I was charged."],
  [null, "New catalogue layout is hard to use on tablet", "The new course catalogue layout is much harder to browse on an iPad. Is the old view coming back?"],
  [null, "Partnership enquiry from a coding bootcamp", "I run a coding bootcamp and would like to discuss offering your courses to our students."],
  [null, "No answers in the course Q&A for two weeks", "I've posted three questions in the course Q&A and none have been answered in two weeks."],
  [null, "Help please", "I can't find the course I bought last week anywhere. I'm not sure what I'm doing wrong."],
  [null, "Press enquiry: online learning trends", "I'm a journalist writing about online learning trends. Could someone from your team answer a few questions?"],
  [null, "Automatic reply: Out of office", "I am out of the office until Monday with limited access to email. For urgent matters please contact my colleague."],
  [null, "Is this email from you?", "I received an email claiming to be from you asking me to confirm my password. Is this legitimate?"],
  [null, "Why does my plan say Basic?", "My dashboard says my plan is 'Basic' but I paid for Premium last week."],
  [null, "Re: Invoice", "Please find our purchase order for the renewal below. Let me know if you need anything else."],
  [null, "Course suggestion: accessibility testing", "It would be great to have a course on accessibility testing for web developers."],
  [null, "(no subject)", "Hi, my login isn't working and my course starts tomorrow. Please call me back."],
];

const FIRST_NAMES = [
  "Aisha", "Liam", "Mei", "Carlos", "Priya", "Noah", "Fatima", "Lucas", "Yuki", "Olivia",
  "Ahmed", "Emma", "Diego", "Chloe", "Ravi", "Sophie", "Kwame", "Isabella", "Hiroshi", "Grace",
  "Omar", "Ava", "Mateo", "Zara", "Arjun", "Mia", "Tunde", "Ella", "Sven", "Lily",
  "Ibrahim", "Hannah", "Pablo", "Nina", "Vikram", "Ruby", "Kofi", "Freya", "Kenji", "Leah",
  "Yusuf", "Amelia", "Andre", "Sara", "Rohan", "Maya", "Chidi", "Alice", "Lars", "Nora",
  "Hassan", "Emily", "Javier", "Ines", "Sanjay", "Clara", "Emeka", "Lucy", "Bjorn", "Eva",
  "Tariq", "Isla", "Rafael", "Leila", "Anil", "Julia", "Femi", "Rose", "Mikael", "Anna",
  "Karim", "Holly", "Bruno", "Dana", "Deepak", "Jade", "Segun", "Molly", "Erik", "Tara",
  "Samir", "Megan", "Hugo", "Lina", "Nikhil", "Zoe", "Ade", "Beth", "Oskar", "Ivy",
  "Malik", "Kate", "Felipe", "Rania", "Kiran", "Amy", "Bayo", "Iris", "Jonas", "Elif",
];

const LAST_NAMES = [
  "Khan", "Murphy", "Chen", "Garcia", "Sharma", "Williams", "Hassan", "Silva", "Tanaka", "Brown",
  "Ali", "Wilson", "Lopez", "Martin", "Patel", "Dubois", "Mensah", "Rossi", "Sato", "Taylor",
  "Haddad", "Clarke", "Fernandez", "Novak", "Iyer", "Schmidt", "Adeyemi", "Moreau", "Larsen", "Evans",
  "Nakamura", "Kowalski", "Okoro", "Jensen", "Reyes", "Gupta", "Walsh",
];

const EMAIL_DOMAINS = [
  "gmail.com", "outlook.com", "yahoo.com", "icloud.com", "proton.me", "hotmail.co.uk",
  "acme-logistics.com", "northwind.io", "brightpath.edu", "globex.co", "uni-leeds.ac.uk", "contoso.com",
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_AGE_DAYS = 90;

// mulberry32: tiny deterministic PRNG so the seed data is the same every run.
function createRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

if (TICKETS.length !== 100 || FIRST_NAMES.length !== 100) {
  throw new Error("Expected exactly 100 tickets and 100 sender first names");
}

const random = createRandom(20261023);

// Roughly 30% new, 30% open, 25% resolved, 15% closed.
const statuses = shuffle<AgentTicketStatus>(
  [
    ...Array<AgentTicketStatus>(30).fill("new"),
    ...Array<AgentTicketStatus>(30).fill("open"),
    ...Array<AgentTicketStatus>(25).fill("resolved"),
    ...Array<AgentTicketStatus>(15).fill("closed"),
  ],
  random,
);

// The AI agent only owns tickets during auto-resolution, so it's left out.
const agents = await prisma.user.findMany({
  where: { deletedAt: null, email: { not: AI_AGENT_EMAIL } },
  select: { id: true, name: true },
  orderBy: { createdAt: "asc" },
});
if (agents.length === 0) {
  throw new Error("No active users to assign tickets to; run `bun run db:seed` first");
}

const now = Date.now();
const data: Prisma.TicketCreateManyInput[] = TICKETS.map(([category, subject, body], i) => {
  const status = statuses[i]!;
  const firstName = FIRST_NAMES[i]!;
  const lastName = LAST_NAMES[(i * 7) % LAST_NAMES.length]!;
  const domain = EMAIL_DOMAINS[Math.floor(random() * EMAIL_DOMAINS.length)]!;

  // Resolved/closed tickets were always handled by someone; open ones usually
  // are, new ones about half the time.
  const assignChance = { new: 0.5, open: 0.85, resolved: 1, closed: 1 }[status];
  const assignee = random() < assignChance ? agents[Math.floor(random() * agents.length)]! : null;

  const createdAt = new Date(now - Math.floor(random() * MAX_AGE_DAYS * DAY_MS));
  // Resolved/closed tickets took 1–96 hours (derived from the index rather than
  // the PRNG, so the other generated values stay the same), but not past now.
  const resolvedAt =
    status === "resolved" || status === "closed"
      ? new Date(Math.min(now, createdAt.getTime() + (1 + ((i * 37) % 96)) * HOUR_MS))
      : null;

  return {
    subject,
    body,
    status,
    category,
    senderName: `${firstName} ${lastName}`,
    senderEmail: `${firstName}.${lastName}@${domain}`.toLowerCase(),
    assignedToId: assignee?.id ?? null,
    emailMessageId: `seed-${String(i + 1).padStart(3, "0")}@helpdesk.local`,
    resolvedAt,
    createdAt,
  };
});

const { count } = await prisma.ticket.createMany({ data, skipDuplicates: true });
console.log(
  `Inserted ${count} of ${data.length} seed tickets (${data.length - count} already existed). ` +
    `Assignees: ${agents.map((a) => a.name).join(", ")}.`,
);

await prisma.$disconnect();
