# Security Specification - Ministrando a Palavra

## 1. Data Invariants
- A **Sermon** must be owned by the creator.
- A **Highlight** must be owned by the creator.
- An **AgendaItem** must be owned by the creator.
- Users can only read their own data.
- System fields like `createdAt` must be immutable.

## 2. The Dirty Dozen Payloads (Target: DENY)
1. **Identity Spoofing**: Creating a sermon with `ownerId` of another user.
2. **PII Leak**: Authenticated user 'B' trying to list user 'A' profiles.
3. **Ghost Field Injection**: Adding `isAdmin: true` to a sermon document.
4. **ID Poisoning**: Document ID with 1KB junk characters.
5. **State Shortcut**: Updating `status` of someone else's preached sermon.
6. **Resource Exhaustion**: Sending 1MB string in `content`.
7. **Orphaned Writes**: Creating a highlight for a non-existent verse (logical check if refs existed).
8. **Client Time Spoofing**: setting `createdAt` to a future date instead of `request.time`.
9. **Unverified User Write**: Writing data without `email_verified == true`.
10. **Blanket Read Request**: `sermons.where('id', '>', '')` without an owner filter.
11. **Immutable Field Change**: Trying to update `createdAt` after creation.
12. **Type Poisoning**: Sending an integer for the `title` field.

## 3. Test Runner
(I will implement `firestore.rules` first then verify)
