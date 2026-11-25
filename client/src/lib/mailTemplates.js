// Ready-made messages for the SPOC mails (the "Use template" tab of the compose window).
// Each SPOC gets their own copy, with their own donors. In the subject or the message:
//   {{spoc}}   the SPOC's name          {{count}}   how many of their donors
//   {{total}}  their donors' amount     {{donors}}  the donors' names, comma-separated
//   {{table}}  the table of their donors (name, amount, created, stage, platform), oldest first
// A message with no {{table}} gets the table added at the end (unless "Add the donor table" is unticked).
export const MAIL_TEMPLATES = [
  {
    key: "stuck",
    label: "Donors stuck in a stage — please update",
    subject: "Action needed: {{count}} donor(s) waiting in the pipeline",
    body:
      "<p>Hi {{spoc}},</p>" +
      "<p>The donors below have been in their current stage for a long time. Please review each one and update the stage and the next step in Bigin by <b>the end of this week</b>.</p>" +
      "<div>{{table}}</div>" +
      "<p>If a donor should be moved ahead, put on hold or closed, please tell me why.</p>" +
      "<p>Regards</p>",
  },
  {
    key: "budget",
    label: "Follow up on budget discussions",
    subject: "Budget discussions pending: {{count}} donor(s)",
    body:
      "<p>Hi {{spoc}},</p>" +
      "<p>These donors have been in <b>Budget discussion</b> for a while ({{total}} in total). Could you follow up with each of them and share where the discussion stands — proposed amount, any objection, and the date you expect a decision?</p>" +
      "<div>{{table}}</div>" +
      "<p>Regards</p>",
  },
  {
    key: "requirement",
    label: "Schedule requirement identification meetings",
    subject: "Please schedule requirement meetings — {{count}} donor(s)",
    body:
      "<p>Hi {{spoc}},</p>" +
      "<p>The donors below are waiting at <b>Requirement Identification</b>. Please schedule a short meeting or call with each of them this week to identify the school needs their support can cover, and note the outcome in Bigin.</p>" +
      "<div>{{table}}</div>" +
      "<p>Let me know if you need any help setting these up.</p>" +
      "<p>Regards</p>",
  },
  {
    key: "reminder",
    label: "Gentle reminder for pending updates",
    subject: "Reminder: pending updates on {{count}} donor(s)",
    body:
      "<p>Hi {{spoc}},</p>" +
      "<p>This is a gentle reminder that the donors below (<b>{{donors}}</b>) have had no movement for some time. Please update their status in Bigin, or reply to this mail with a short note on each.</p>" +
      "<div>{{table}}</div>" +
      "<p>Thank you,<br>Regards</p>",
  },
];

export const MAIL_TOKENS = [
  { token: "{{spoc}}", hint: "the SPOC's name" },
  { token: "{{count}}", hint: "how many donors" },
  { token: "{{total}}", hint: "their total amount" },
  { token: "{{donors}}", hint: "donor names" },
  { token: "{{table}}", hint: "the donor table", block: true },
];