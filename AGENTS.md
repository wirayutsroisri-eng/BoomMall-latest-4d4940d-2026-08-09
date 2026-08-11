# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Iron rule: drag-down to dismiss

Every closable screen / modal / sheet must support drag-down to close (not only an X button).
Use `DragDownDismiss` + `dismissibleModalOptions` from `@/shared/components/DragDownDismiss`.

# Iron rule: App Store compliance

Do not ship iOS features that will fail App Review: no fake payments/calls/LIVE, no Boom Coin purchase without IAP, no UGC without report/block, no account without delete, no `voip` without real VoIP, accurate permission strings, Privacy Policy + Terms required.
See `.cursor/rules/app-store-compliance.mdc`.
