// Note: This is informational - Firebase Firestore doesn't support automatic TTL
// Data will be retained indefinitely unless manually deleted
// The expiresAt field is added to documents for reference and future cleanup

console.log(`
Firebase Data Retention Configuration
======================================

This betting platform stores data with a 5-year retention policy.

Data Storage Details:
- All bets include an 'expiresAt' field set to 5 years from creation
- All transactions include an 'expiresAt' field set to 5 years from creation
- Data is stored in Firestore which has no storage limits for the Spark (free) plan
- Firestore Blaze (pay-as-you-go) plan supports unlimited storage

Firebase does not support automatic TTL (Time To Live) deletion.
To implement automatic cleanup:

1. Use Firebase Cloud Functions to periodically delete expired documents:
   - Set up a scheduled function that runs monthly
   - Query documents where expiresAt < current date
   - Delete old documents in batches

2. Use Cloud Scheduler + Cloud Functions for automated cleanup

3. Manual cleanup through Firebase Console when needed

Current Implementation:
- ✓ All bet documents include 'expiresAt' timestamp
- ✓ All transaction documents include 'expiresAt' timestamp  
- ✓ Data persists for 5 years from creation
- ⚠ Manual cleanup or Cloud Function required for deletion

For production use, consider implementing automated cleanup.
`)
