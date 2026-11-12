# Transactions Mobile

An Android/iOS React Native expense tracker with a web companion, authentication checks and cross-platform parity tests.

**Status:** Development snapshot; supply your own Firebase configuration. The Android app previously launched on a Pixel emulator; physical Android and public Play Store release remain unverified. No financial transfers are performed. Signing assets and production service configuration are excluded.

[Project portfolio](https://zacharysturman.com/projects/transactions)

## Quick start

```sh
npm --prefix web ci --no-audit --no-fund
npm --prefix mobile ci --no-audit --no-fund
cp mobile/.env.example mobile/.env
cp web/.env.local.example web/.env.local
```

## Usage

```sh
npm --prefix mobile run start
# For a native Android development build:
npm --prefix mobile run android
```

## How it works

Expo/React Native and Next.js clients share Firebase Authentication and Firestore records. Emulator tests use synthetic accounts and stub email delivery. This snapshot includes both clients so parity tests retain their relative paths.

## Testing

```sh
npm --prefix mobile run test:google-signin
npm --prefix mobile run test:apple-signin
npm --prefix mobile run typecheck
```

See [validation and next steps](docs/NEXT_STEPS.md) for the checks performed on this snapshot. Automated fixture tests do not establish physical-device compatibility.

## Configuration and privacy

This is a curated source snapshot, published November 12, 2026. Configure your own endpoints, credentials and signing identities. Private development history, local environment files, personal recordings, runtime databases, signing materials and deployment automation are excluded. Deployment and device installation are explicit operator actions.

## License and attribution

Existing licenses and third-party notices apply to the files they cover. Publication of this snapshot does not grant a new license to original material; no additional license is granted where none is supplied.
