# BetWin - Sports Betting Platform

A professional sports betting platform with live odds, real-time match updates, and secure payment processing.

## Features

- **Live Match Betting**: Real-time odds from multiple sports leagues
- **User Authentication**: Secure login with email/password and Google OAuth
- **Wallet System**: Deposit, withdraw, and manage your betting balance
- **Bet Tracking**: View all placed bets with live status updates
- **5-Year Data Retention**: All bets and transactions stored for 5 years
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Tech Stack

- **Framework**: Next.js 15 with React 19
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui

## Data Retention Policy

All user data (bets, transactions, account information) is stored with a 5-year retention policy:

- Each bet document includes an `expiresAt` field set to 5 years from creation
- Each transaction includes an `expiresAt` field set to 5 years from creation
- Data persists indefinitely in Firebase Firestore
- For automated cleanup after 5 years, implement Firebase Cloud Functions

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up Firebase:
   - Create a Firebase project
   - Enable Firestore and Authentication
   - Update `lib/firebase.ts` with your config
4. Run the development server: `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)

## Firebase Structure

\`\`\`
users/
  {userId}/
    - balance: number
    - email: string
    - displayName: string
    - updatedAt: timestamp
    
    bets/
      {betId}/
        - userId: string
        - matches: array
        - totalOdds: number
        - totalStake: number
        - potentialReturns: number
        - selections: number
        - status: "pending" | "won" | "lost"
        - winningsCredited: boolean
        - timestamp: timestamp
        - expiresAt: timestamp (5 years)
        
    transactions/
      {transactionId}/
        - userId: string
        - type: "deposit" | "bet" | "winnings" | "withdrawal"
        - amount: number
        - description: string
        - status: string
        - timestamp: timestamp
        - expiresAt: timestamp (5 years)
\`\`\`

## License

MIT
