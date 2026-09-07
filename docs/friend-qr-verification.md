# QR friend requests: two-device verification

Install the updated app on both devices and deploy the updated backend. Both devices must use the same API and different signed-in accounts. No database migration is required for this change.

1. On B, open My QR. On A, scan it inside BoomMall. Confirm that B's name and friend code appear, then send the request.
2. On B, keep the Friends, Chat, or Add Friend screen open. Within approximately 5 seconds (plus network latency), A's incoming request should appear with accept/reject controls. Add Friend also shows outgoing requests.
3. Accept on B. Confirm A and B both see their direct chat and friend entry. Leave A's Chat/Friends screen open to check automatic refresh, then navigate away and back to verify persistence.
4. Search for B by exact friend code, @handle, display name (at least 3 characters), and numeric profile ID. Confirm a result is displayed before choosing Add Friend. Accounts that disable discovery remain hidden from search.
5. Show one QR on B, open another QR for the same account on a second signed-in device, then scan the original. Both should work until their own expiry. Previously revoked QR codes remain invalid; create a new one after deployment.
6. Scan B's QR with the phone's system camera. The `boommall://add-friend?token=…` link should open B's result in the app, ready for explicit Add Friend selection.
7. Reject a request; verify neither account gains a friend/chat from that rejection. Send the same pending request again, then try sending in the opposite direction; the original recipient must remain the recipient and be prompted to accept.
8. Scan an unrelated/malformed QR. One error should appear, with a Scan Again button. Deny camera access and check the permission/settings button and manual search alternative.
9. Disconnect the network. Search/request errors must be visible; calls must time out rather than spin indefinitely. Reconnect and retry. Background and foreground B to check incoming-request refresh.

Automated coverage: `npx vitest run src/modules/search/domain/friendQr.test.ts src/modules/search/data/friendApi.test.ts backend/src/modules/friends/FriendService.test.ts`.

Automated service tests use mocked persistence and do not replace the above device/backend checks. Request updates now poll globally while the signed-in app is foregrounded, including the Feed. A global banner opens /friend-requests. Backend sends Expo push for new requests and acceptances; background delivery requires permission, a registered device token, and working FCM/APNs configuration. Accept returns a conversation ID and opens that chat. Test cold-start taps and account switching too.
