// Synthetic tickets for a fictional UPI wallet ("PaisaPal").
// Every name, number and ID below is invented. Aadhaar-format numbers are random
// digits with a valid Verhoeff check digit so the on-device detector can be exercised.

export interface Ticket {
  id: string;
  customer: string;
  channel: 'Email' | 'Chat' | 'App';
  subject: string;
  body: string;
  receivedAt: string;
  tag: string;
}

export const SAMPLE_TICKETS: Ticket[] = [
  {
    id: 'PP-10482',
    customer: 'Priya Raman',
    channel: 'Email',
    subject: 'Refund not received for failed UPI payment',
    tag: 'Refunds',
    receivedAt: '09:12',
    body:
      "Hi, I paid ₹2,450 to a merchant on 12 Nov from priya.raman@okhdfcbank and the payment failed but the money was debited. It's been 4 days. Please call me on +91 98201 44718. This is really frustrating, I need this money back today.",
  },
  {
    id: 'PP-10483',
    customer: 'Arjun Mehta',
    channel: 'App',
    subject: 'KYC rejected twice',
    tag: 'KYC',
    receivedAt: '09:40',
    body:
      'My KYC got rejected again. I uploaded my PAN ABCPM4821K and Aadhaar 4918 2736 4553 both times. The app just says "document unclear". What exactly is wrong? I can\'t add money to my wallet until this is fixed.',
  },
  {
    id: 'PP-10484',
    customer: 'Neha Kulkarni',
    channel: 'Chat',
    subject: 'Charged twice on my card',
    tag: 'Payments',
    receivedAt: '10:05',
    body:
      'I was charged twice for my wallet top-up of ₹1,000 on card 4111 1111 1111 1111. Please reverse the extra charge. My email is neha.k@example.com if you need to send anything.',
  },
  {
    id: 'PP-10485',
    customer: 'Rohit Sharma',
    channel: 'Email',
    subject: 'Withdrawal to bank stuck',
    tag: 'Payouts',
    receivedAt: '10:31',
    body:
      'I withdrew ₹8,000 to my bank account a/c 50100234987612 (IFSC HDFC0001234) yesterday and it still shows "processing". Rohit here, phone 9876543210. When will it reach?',
  },
];

// The team's written policy. Kept short on purpose: on-device models have small context windows.
export const TEAM_POLICY = `You are a support agent for PaisaPal, an Indian UPI wallet.
- Be warm, specific and brief (under 110 words).
- If a failed UPI debit has not reversed after 48 hours, raise a payment dispute and share the dispute ID.
- Never ask the customer to share full card, Aadhaar, PAN or account numbers over chat or email.
- Never promise a same-day refund.
- Never invent IDs, dates or timelines that are not in this policy. Where the agent must add a dispute ID, write [DISPUTE_ID].
- Do not repeat the customer's account, card, Aadhaar, PAN or phone numbers back in the reply.
- Sign off as "PaisaPal Support".`;
