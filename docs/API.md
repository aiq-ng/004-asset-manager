# Assets Inventory API

Base URL: `http://localhost:3000`

All request bodies and query parameters are validated with Zod. Timestamps are ISO-8601 UTC strings.

## Response shapes

Success:

```json
{
  "data": { "...": "..." },
  "meta": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 }
}
```

`meta` is only present on list endpoints.

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [{ "path": "code", "message": "code must be 2-4 uppercase letters, e.g. LAP" }]
  }
}
```

| `error.code`         | HTTP | Meaning                                                       |
| -------------------- | ---- | ------------------------------------------------------------- |
| `VALIDATION_ERROR`   | 400  | Malformed body/query, or a failed business precondition on 4xx |
| `UNAUTHENTICATED`    | 401  | No session cookie, or the session was revoked/expired          |
| `FORBIDDEN`          | 403  | Authenticated, but the role is not allowed to do this           |
| `NOT_FOUND`          | 404  | Unknown asset / staff / type / assignment                     |
| `CONFLICT`           | 409  | Unique violation, asset already assigned, resource in use     |
| `UNPROCESSABLE`      | 422  | Business rule violation (wrong status, already returned, ...) |
| `STORAGE_UNAVAILABLE`| 502  | MinIO / S3 could not be reached                                |
| `INTERNAL_ERROR`     | 500  | Unexpected failure (logged server side)                        |

---

## Authentication

Every endpoint except `POST /api/auth/login` requires the `c54_session` HTTP-only
session cookie. Sign in once and reuse the cookie:

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ana.ribeiro@example.com","password":"..."}'

curl -b cookies.txt http://localhost:3000/api/auth/me
```

The role and profile are read from PostgreSQL on every request, so a demotion or
deletion takes effect immediately. Passwords and session signing keys never leave
the server; responses include `hasPassword` but never `passwordHash`.

### Role matrix

| Capability                                   | USER | ASSIGNER | ADMIN | SUPERADMIN |
| -------------------------------------------- | :--: | :------: | :---: | :--------: |
| Read assets, types, staff, assignments, QR    | ✅   | ✅       | ✅    | ✅         |
| Create/return assignments (targets restricted) | ❌ | ✅       | ✅    | ✅         |
| Status-only asset update                      | ❌   | ✅       | ✅    | ✅         |
| Create/update/retire assets                   | ❌   | ❌       | ✅    | ✅         |
| Upload/remove asset images                    | ❌   | ❌       | ✅    | ✅         |
| Manage asset types                            | ❌   | ❌       | ✅    | ✅         |
| Create/update/delete staff, set roles/passwords | ❌ | ❌       | ❌    | ✅         |
| Read the audit trail                           | ❌   | ❌       | ❌    | ✅         |
| Promote somebody to `SUPERADMIN`              | ❌   | ❌       | ❌    | ❌ (CLI only) |

An `ASSIGNER` may only assign to `USER` or another `ASSIGNER`, never to
themselves or to `ADMIN`/`SUPERADMIN`. `ADMIN` and `SUPERADMIN` may assign to
anyone, including themselves. Staff updates by a `SUPERADMIN` reject
`SUPERADMIN` as a target role, and the `SUPERADMIN` account cannot be edited or
deleted through the API.

### `POST /api/auth/login`

Public. Validates `{ email, password }` and sets the session cookie. Returns the
staff summary; invalid credentials and unknown emails share one `401` message so
accounts cannot be enumerated. Accounts without a password (`hasPassword:
false`) cannot log in.

```json
{
  "data": {
    "id": "cmupql9yk0004k8zr5tncye2w",
    "name": "Ana Ribeiro",
    "email": "ana.ribeiro@example.com",
    "department": "IT",
    "role": "SUPERADMIN"
  }
}
```

### `POST /api/auth/logout`

Requires a session. Increments `Staff.sessionVersion` and clears the cookie, so
cookies already issued to the account stop working immediately rather than
remaining valid until they expire.

```json
{ "data": { "signedOut": true } }
```

### `GET /api/auth/me`

Requires a session. Returns the caller plus `hasPassword`, which tells the UI
whether to prompt for a password before revealing privileged views.

```json
{
  "data": {
    "id": "cmupql9yk0004k8zr5tncye2w",
    "name": "Ana Ribeiro",
    "email": "ana.ribeiro@example.com",
    "department": "IT",
    "role": "SUPERADMIN",
    "hasPassword": true
  }
}
```

### `POST /api/auth/change-password`

Requires a session. Body `{ currentPassword, newPassword }` (12+ characters).
Bumps `sessionVersion` to revoke that account's other sessions, then re-issues the
caller's cookie so the current device stays signed in.

```json
{ "data": { "id": "cmupql9yk0004k8zr5tncye2w", "passwordUpdated": true } }
```

### `POST /api/auth/forgot-password`

Public. Body `{ email }`.

Emails a single-use reset link when the account exists. The response is
byte-identical whether or not the address is registered, so the endpoint cannot
be used to enumerate accounts — only the audit trail records the difference.
Requesting a link supersedes any earlier one for that account.

```json
{ "data": { "message": "If an account exists for that email, a reset link is on its way." } }
```

### `POST /api/auth/reset-password`

Public. Body `{ token, newPassword, confirmPassword }` (12+ characters).

Consumes the token from the emailed link. Invalid, already-used and expired
tokens all fail with the same message, so the error cannot distinguish which
case happened. Also bumps `sessionVersion`, so any session the account still
holds is revoked, and clears the forced-change flag an invited session carries.

Errors: `400` invalid or expired token, `400` validation.

---

## Asset types

### `GET /api/asset-types`

*Requires: Signed in.*

Lists every asset type with the number of assets it holds.

```bash
curl -b cookies.txt http://localhost:3000/api/asset-types
```

```json
{
  "data": [
    {
      "id": "cmupql9we0000k8zrtl7zsbar",
      "name": "Laptop",
      "code": "LAP",
      "assetCount": 3,
      "createdAt": "2026-10-01T16:16:37.214Z",
      "updatedAt": "2026-10-01T16:16:37.214Z"
    }
  ]
}
```

### `POST /api/asset-types`

*Requires: `ADMIN`.*

`code` must be 2-4 uppercase letters; both `name` and `code` are unique. Returns `409` on duplicates.

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/asset-types \
  -H 'content-type: application/json' \
  -d '{"name":"Docking Station","code":"DCK"}'
```

```json
{
  "data": {
    "id": "cmupqs5u00000dozrp36pyycx",
    "name": "Docking Station",
    "code": "DCK",
    "assetCount": 0,
    "createdAt": "2026-10-01T16:21:58.537Z",
    "updatedAt": "2026-10-01T16:21:58.537Z"
  }
}
```

Errors: `400` invalid code/name, `409` duplicate `name` or `code`.

### `PATCH /api/asset-types/[id]`

*Requires: `ADMIN`.*

Partial update. `code` may only change while the type has **no** assets — generated ids (`IT-LAP-0001`) already embed it. Otherwise `409`.

```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/asset-types/<id> \
  -H 'content-type: application/json' \
  -d '{"name":"Laptops"}'
```

```json
{
  "data": {
    "id": "cmupql9we0000k8zrtl7zsbar",
    "name": "Laptops",
    "code": "LAP",
    "assetCount": 3,
    "createdAt": "2026-10-01T16:16:37.214Z",
    "updatedAt": "2026-10-01T16:40:11.001Z"
  }
}
```

Errors: `400`, `404`, `409` (duplicate value, or `code` change with assets in use).

---

## Assets

### `GET /api/assets`

*Requires: Signed in.*

| Query param  | Type    | Notes                                                            |
| ------------ | ------- | ---------------------------------------------------------------- |
| `page`       | int ≥ 1 | default `1`                                                      |
| `pageSize`   | int ≤100| default `20`                                                     |
| `q`          | string  | case-insensitive match on `assetId`, `serialNumber`, `description`, `brand`, `model` |
| `type`       | string  | asset type `code` (case-insensitive) or `id`                     |
| `status`     | enum    | `AVAILABLE` \| `ASSIGNED` \| `UNDER_REPAIR` \| `RETIRED`         |
| `assignedTo` | string  | staff id — only assets currently assigned to that person         |
| `brand`      | string  | exact match, e.g. `Dell`                                        |
| `model`      | string  | exact match, e.g. `Latitude 5440`                               |

```bash
curl -b cookies.txt 'http://localhost:3000/api/assets?page=1&pageSize=20&q=thinkpad&type=LAP&status=AVAILABLE'
```

```json
{
  "data": [
    {
      "id": "cmupql9zt000ek8zrqe8iglid",
      "assetId": "IT-LAP-0003",
      "description": "Spare pool laptop",
      "brand": "Lenovo",
      "model": "ThinkPad T14",
      "serialNumber": null,
      "status": "AVAILABLE",
      "imageKey": null,
      "imageUrl": null,
      "assetType": { "id": "cmupql9we0000k8zrtl7zsbar", "name": "Laptops", "code": "LAP" },
      "assignedTo": null,
      "assignment": null,
      "createdAt": "2026-10-01T16:16:37.341Z",
      "updatedAt": "2026-10-01T16:16:37.341Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

`imageUrl` is a presigned GET URL (default expiry 3600 s) or `null`. `assignedTo` / `assignment` describe the current active assignment only.

### `POST /api/assets`

*Requires: `ADMIN`.*

| Field         | Type   | Required | Notes                                                            |
| ------------- | ------ | -------- | ---------------------------------------------------------------- |
| `assetType`   | string | yes      | asset type `code` or `id`                                          |
| `description` | string | yes      | ≤ 500 chars; stored exactly as sent                             |
| `brand`       | string | yes      | ≤ 100 chars; trimmed                                     |
| `model`       | string | no       | ≤ 100 chars; trimmed, `""`/whitespace becomes `null`            |
| `serialNumber`| string | yes      | ≤ 120 chars; trimmed; unique across the register                |
| `status`      | enum   | no       | `AVAILABLE` (default), `UNDER_REPAIR`, `RETIRED`                  |

`assetId` is generated server-side as `IT-{TYPE_CODE}-{4 digits}` from a per-type counter that is incremented inside the creating transaction, so concurrent requests can never collide and numbers are never reused.

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/assets \
  -H 'content-type: application/json' \
  -d '{"assetType":"DCK","description":"WD19TB Thunderbolt dock","brand":"CalDigit","serialNumber":"SN-DCK-0001"}'
```

```json
{
  "data": {
    "id": "cmupqs61k0003dozreom3pwab",
    "assetId": "IT-DCK-0001",
    "description": "WD19TB Thunderbolt dock",
    "brand": "CalDigit",
    "serialNumber": "SN-DCK-0001",
    "status": "AVAILABLE",
    "imageKey": null,
    "imageUrl": null,
    "assetType": { "id": "cmupqs5u00000dozrp36pyycx", "name": "Docking Station", "code": "DCK" },
    "assignedTo": null,
    "assignment": null,
    "createdAt": "2026-10-01T16:21:58.808Z",
    "updatedAt": "2026-10-01T16:21:58.808Z"
  }
}
```

Errors: `400` validation, `409` duplicate `serialNumber`, `422` unknown asset type.

### `POST /api/assets/bulk`

*Requires: `ADMIN`.*

Registers many items of one kind in a single call — the same batch the "Register
in bulk" sheet submits. Serials within the batch are deduplicated and checked
against the register; the ones that cannot be created come back in `skipped`
with a reason rather than failing the whole batch. Responds `201` when every row
was created and `200` when anything was skipped, so the caller can tell the two
apart from the status code alone.

| Field        | Type     | Required | Notes                                        |
| ------------ | -------- | -------- | -------------------------------------------- |
| `assetType`  | string   | yes      | asset type `code` or `id`                    |
| `description`| string   | yes      | ≤ 500 chars; shared by every row             |
| `brand`      | string   | yes      | ≤ 100 chars; shared by every row             |
| `model`      | string   | no       | ≤ 100 chars; shared by every row             |
| `serials`    | string[] | yes      | in order, so asset ids run down the column   |
| `status`     | enum     | no       | `AVAILABLE` (default), `UNDER_REPAIR`, `RETIRED` |

```json
{
  "data": {
    "created": [{ "assetId": "IT-MON-0041", "serial": "SN-MON-0041" }],
    "skipped": [{ "serial": "SN-MON-0007", "reason": "Already on the register" }]
  }
}
```

The photo is **not** accepted here: an uploaded image is a `multipart/form-data`
part, and this route parses JSON. The bulk sheet posts its one batch photo
through the Server Action instead.

### Populating `serials` from a spreadsheet

The register's bulk sheet can read the serials out of a file instead of asking
for them one at a time: pick a CSV or Excel file, and the first column — one
serial per row — becomes the batch's `serials`, with the count derived from it.
Everything after that is this endpoint, unchanged: the same within-batch
dedupe, the same `skipped` reasons, the same per-type id allocation.

This is a **UI-only** convenience and adds no API surface. Nothing is uploaded:
the file is parsed in the browser and the result travels as the ordinary
`serials` array, so this endpoint knows nothing about spreadsheets.

| Behaviour                | Rule                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| Formats                  | `.csv`, `.tsv`, `.xlsx`, `.xls`; up to 5 MB                            |
| Column read              | The first column of the first sheet, one serial per row                |
| Heading row              | A first cell reading `serial`, `serial number`, `s/n`, `sn`, … is skipped |
| Within-file duplicates   | Folded case-insensitively and reported as skipped rows                 |
| Row cap                  | `BULK_ASSET_ENTRY_MAX` (500); the overflow is reported, not silently cut |
| Bad file                 | An inline message naming the problem; nothing is filled in             |

The cap and the dedupe are enforced here as well as on submit. The import is a
way of typing faster, not a second way in: a serial already on the register
still comes back in `skipped` with `Already on the register`.

### `GET /api/assets/[id]`

*Requires: Signed in.*

`[id]` accepts either the database id or the human `assetId` (`IT-LAP-0001`), so a scanned QR code resolves directly. Includes the full assignment history.

```bash
curl -b cookies.txt http://localhost:3000/api/assets/IT-LAP-0001
```

```json
{
  "data": {
    "id": "cmupql9z90008k8zr2y33x1yj",
    "assetId": "IT-LAP-0001",
    "description": "MacBook Pro 14\" M3",
    "serialNumber": "SN-LAP-0001",
    "status": "ASSIGNED",
    "imageKey": null,
    "imageUrl": null,
    "assetType": { "id": "cmupql9we0000k8zrtl7zsbar", "name": "Laptops", "code": "LAP" },
    "assignedTo": {
      "id": "cmupql9yk0004k8zr5tncye2w",
      "name": "Ana Ribeiro",
      "department": "IT",
      "email": "ana.ribeiro@example.com",
      "phone": "+351 912 000 111"
    },
    "assignment": {
      "id": "seed-assignment",
      "dateAssigned": "2026-10-01T16:16:37.361Z",
      "dateReturned": null,
      "note": "Issued with the onboarding kit",
      "staff": {
        "id": "cmupql9yk0004k8zr5tncye2w",
        "name": "Ana Ribeiro",
        "department": "IT",
        "email": "ana.ribeiro@example.com",
        "phone": "+351 912 000 111"
      }
    },
    "history": [
      {
        "id": "seed-assignment",
        "dateAssigned": "2026-10-01T16:16:37.361Z",
        "dateReturned": null,
        "note": "Issued with the onboarding kit",
        "staff": { "id": "cmupql9yk0004k8zr5tncye2w", "name": "Ana Ribeiro", "department": "IT", "email": "ana.ribeiro@example.com", "phone": "+351 912 000 111" }
      }
    ],
    "createdAt": "2026-10-01T16:16:37.345Z",
    "updatedAt": "2026-10-01T16:16:37.345Z"
  }
}
```

Errors: `404`.

### `PATCH /api/assets/[id]`

*Requires: `ASSIGNER` (status field only) or `ADMIN` (all fields).*

Accepts `description`, `brand`, `model`, `serialNumber`, `status`. `assetId` is immutable. `status: "ASSIGNED"` is rejected — status only flips through the assignments endpoints (the enum itself rejects it with `400`, and `422` if the asset is currently checked out).

An `ASSIGNER` is held to a strict, narrower body: `status` only, and only
between `AVAILABLE` and `UNDER_REPAIR`. `RETIRED` is an `asset:manage` operation
and is refused with `400` on that path — retiring is `DELETE /api/assets/[id]`,
which is `ADMIN`-only. Any other field is refused too, because the assigner
schema is `.strict()`.

```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/assets/IT-LAP-0002 \
  -H 'content-type: application/json' \
  -d '{"description":"Dell Latitude 5440 (replaced battery)","status":"UNDER_REPAIR"}'
```

```json
{
  "data": {
    "id": "cmupql9zx000gk8zrbvubkjfz",
    "assetId": "IT-LAP-0002",
    "description": "Dell Latitude 5440 (replaced battery)",
    "serialNumber": "SN-LAP-0002",
    "status": "UNDER_REPAIR",
    "imageKey": null,
    "imageUrl": null,
    "assetType": { "id": "cmupql9we0000k8zrtl7zsbar", "name": "Laptops", "code": "LAP" },
    "assignedTo": null,
    "assignment": null,
    "createdAt": "2026-10-01T16:16:37.337Z",
    "updatedAt": "2026-10-01T16:44:02.117Z"
  }
}
```

Errors: `400`, `404`, `409` duplicate `serialNumber`, `422` status change while assigned. An `ASSIGNER` sending `RETIRED` or any field other than `status` gets `400`.

### `DELETE /api/assets/[id]`

*Requires: `ADMIN`.*

Soft delete: sets `status` to `RETIRED`. Nothing is hard-deleted and the stored image is kept. Refused with `409` while the asset is assigned.

```bash
curl -b cookies.txt -X DELETE http://localhost:3000/api/assets/IT-LAP-0003
```

```json
{
  "data": {
    "id": "cmupql9zz000ik8zrbw4ghz0c",
    "assetId": "IT-LAP-0003",
    "description": "ThinkPad T14 (spare pool)",
    "serialNumber": null,
    "status": "RETIRED",
    "imageKey": null,
    "imageUrl": null,
    "assetType": { "id": "cmupql9we0000k8zrtl7zsbar", "name": "Laptops", "code": "LAP" },
    "assignedTo": null,
    "assignment": null,
    "createdAt": "2026-10-01T16:16:37.341Z",
    "updatedAt": "2026-10-01T16:45:41.884Z"
  }
}
```

Errors: `404`, `409` (currently assigned).

---

## Device passwords

The password an asset itself is protected by. Stored in plaintext in the
database — a deliberate trade, chosen over encryption so there is no key to
back up or lose (losing the key would lose every stored password at once). The
compensating controls: the value never appears in any list or detail DTO or on
the public tag page, it is readable only through this ADMIN-gated endpoint, and
every verb is audited, including failed reads.

### `GET /api/assets/[id]/password`

*Requires: `ADMIN`.*

Returns the stored plaintext, once, per call. Returns `404` when nothing is
stored. Whether a password exists, and when and by whom it was set, is on the
asset's own DTO (`devicePassword`), so a client can render that metadata without
touching this endpoint.

```bash
curl -b cookies.txt http://localhost:3000/api/assets/IT-LAP-0002/password
```

```json
{ "data": { "password": "LAP-UZJT-EESH" } }
```

Errors: `401`, `403` (below ADMIN), `404` (asset or password not found).

### `POST /api/assets/[id]/password`

*Requires: `ADMIN`.*

Stores a password. Either `{ "generate": true }` — a fresh readable code keyed on
the asset type (`LAP-UZJT-EESH`) — or `{ "password": "..." }` (≥ 6 characters
after trimming) for one already configured on the device. Both return the
plaintext that is now stored, so a client never needs a second, separately
audited reveal to display what it just set.

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/assets/IT-LAP-0002/password \
  -H 'content-type: application/json' -d '{"generate":true}'
```

```json
{
  "data": {
    "password": "LAP-UZJT-EESH",
    "status": { "setAt": "2026-10-06T05:38:29.283Z", "setBy": "Ana Ribeiro" }
  }
}
```

Errors: `400` (empty body, or password below the minimum length), `404`.

### `DELETE /api/assets/[id]/password`

*Requires: `ADMIN`.*

Forgets a stored password, for a device that no longer uses it. `404` when
nothing is stored.

```bash
curl -b cookies.txt -X DELETE http://localhost:3000/api/assets/IT-LAP-0002/password
```

```json
{ "data": { "cleared": true } }
```

Errors: `404`.

The audit trail records three actions here: `ASSET_PASSWORD_SET` (with `source`
of `generated` or `manual`, never the value), `ASSET_PASSWORD_REVEALED` (with an
`outcome` of `revealed` or `unreadable`), and `ASSET_PASSWORD_CLEARED`. See the
audit section for reading them.
---

## Images

### `POST /api/assets/[id]/image`

*Requires: `ADMIN`.*

`multipart/form-data` with a single `file` field; one image per asset (uploading again replaces it). Accepts JPEG, PNG and WebP up to 5 MB. The format is verified from the file's magic bytes, not the client-supplied MIME type.

Order of operations: upload the new object → update the database → delete the previous object. If the database write fails the new object is deleted again, so nothing is orphaned.

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/assets/IT-DCK-0001/image \
  -F 'file=@dock.png;type=image/png'
```

```json
{
  "data": {
    "id": "cmupqs61k0003dozreom3pwab",
    "assetId": "IT-DCK-0001",
    "description": "WD19TB Thunderbolt dock",
    "serialNumber": "SN-DCK-0001",
    "status": "AVAILABLE",
    "imageKey": "assets/IT-DCK-0001/636254f4-ac8e-4b4e-8f8b-a5356b9570c9.png",
    "imageUrl": "http://localhost:9000/asset-images/assets/IT-DCK-0001/636254f4-ac8e-4b4e-8f8b-a5356b9570c9.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=minioadmin%2F20261001%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20261001T162521Z&X-Amz-Expires=3600&X-Amz-Signature=1249ea5c333c35bce7304de67be78f930edf8ea24e6e8fca74121c0555f158c8&X-Amz-SignedHeaders=host&x-id=GetObject",
    "assetType": { "id": "cmupqs5u00000dozrp36pyycx", "name": "Docking Station", "code": "DCK" },
    "assignedTo": null,
    "assignment": null,
    "createdAt": "2026-10-01T16:21:58.808Z",
    "updatedAt": "2026-10-01T16:25:21.236Z"
  }
}
```

Errors: `400` (missing field, too large, unsupported format), `404`, `502` MinIO unreachable.

### `DELETE /api/assets/[id]/image`

*Requires: `ADMIN`.*

Deletes the object from MinIO and clears `imageKey`. Returns the asset with `imageUrl: null`.

```bash
curl -b cookies.txt -X DELETE http://localhost:3000/api/assets/IT-DCK-0001/image
```

Errors: `404`, `422` when the asset has no image.

---

## QR codes

### `GET /api/assets/[id]/qr`

*Requires: Signed in.*

| Query param | Values      | Default | Notes                                              |
| ------------ | ----------- | ------- | -------------------------------------------------- |
| `format`     | `png`/`svg` | `png`   | `svg` returns `image/svg+xml`                       |
| `download`   | `1`         | off     | adds `Content-Disposition: attachment; filename="{assetId}.png"` |

The QR encodes `{APP_URL}/assets/{assetId}` and is generated on demand — nothing is written to object storage.

That page is the one route readable without a session: the QR is printed on a
physical tag, so the person holding the device has no cookie to send. An
anonymous visitor with a valid asset number gets a read-only card — description,
status, type, brand, model, serial, registered date and the current holder's name
and department. No history, no return notes or photos, no database id, no
controls, and no app chrome. An unknown number is a `404`. A signed-in visitor
gets the full authenticated detail page instead, and an invited session that still
owes a password change is sent to `/change-password` before either.

```bash
curl -b cookies.txt http://localhost:3000/api/assets/IT-LAP-0001/qr --output qr.png
curl -b cookies.txt 'http://localhost:3000/api/assets/IT-LAP-0001/qr?format=svg'
curl -b cookies.txt -OJ 'http://localhost:3000/api/assets/IT-LAP-0001/qr?download=1'
```

```
HTTP/1.1 200 OK
Content-Type: image/png
Content-Disposition: attachment; filename="IT-LAP-0001.png"
```

Errors: `404`, `400` invalid `format`.

---

## Staff

### `GET /api/staff`

*Requires: Signed in.*

Supports `page`, `pageSize`, `q` (case-insensitive over `name`, `email`, `department`, `phone`), `department` and `role`.

```bash
curl -b cookies.txt 'http://localhost:3000/api/staff?q=finance&page=1&pageSize=20'
```

```json
{
  "data": [
    {
      "id": "cmupql9yl0002k8zr6jxd6y4z",
      "name": "Bruno Costa",
      "department": "Finance",
      "email": "bruno.costa@example.com",
      "phone": null,
      "role": "USER"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

### `POST /api/staff`

*Requires: `SUPERADMIN`.*

| Field        | Type   | Required | Notes                                                          |
| ------------ | ------ | -------- | -------------------------------------------------------------- |
| `name`       | string | yes      | ≤ 120 chars                                                     |
| `department` | string | yes      | ≤ 120 chars                                                     |
| `email`      | string | yes      | lower-cased, unique                                              |
| `phone`      | string | no       | `""`/whitespace stored as `null`                                 |
| `role`       | string | no       | `USER` (default), `ASSIGNER` or `ADMIN`; `SUPERADMIN` is rejected |
| `password`   | string | no       | ≥ 12 chars. Omit it and the account cannot log in until set    |

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/staff \
  -H 'content-type: application/json' \
  -d '{"name":"Diogo Alves","department":"IT","email":"diogo.alves@example.com","phone":"+351 912 000 111","role":"ASSIGNER","password":"correct-horse-battery"}'
```

```json
{
  "data": {
    "id": "cmupqwvrp0004djzrs4d6mllo",
    "name": "Diogo Alves",
    "department": "IT",
    "email": "diogo.alves@example.com",
    "phone": "+351 912 000 111",
    "role": "ASSIGNER",
    "createdAt": "2026-10-01T16:16:37.292Z",
    "updatedAt": "2026-10-01T16:16:37.292Z"
  }
}
```

Errors: `400` (including `role: "SUPERADMIN"`), `409` duplicate `email`.

### `GET /api/staff/[id]`

*Requires: Signed in.*

Includes the assets the person currently holds plus their full assignment history, newest first. History rows are never deleted, so every past asset shows up here; `GET /api/assignments?staffId=<id>` returns the same records as a paginated list.

```bash
curl -b cookies.txt http://localhost:3000/api/staff/cmupql9yk0004k8zr5tncye2w
```

```json
{
  "data": {
    "id": "cmupql9yk0004k8zr5tncye2w",
    "name": "Ana Ribeiro",
    "department": "IT",
    "email": "ana.ribeiro@example.com",
    "phone": "+351 912 000 111",
    "role": "SUPERADMIN",
    "createdAt": "2026-10-01T16:16:37.292Z",
    "updatedAt": "2026-10-01T16:16:37.292Z",
    "currentAssets": [
      {
        "id": "cmupql9z90008k8zr2y33x1yj",
        "assetId": "IT-LAP-0001",
        "description": "MacBook Pro 14\" M3",
        "status": "ASSIGNED"
      }
    ],
    "history": [
      {
        "id": "seed-assignment",
        "assetId": "cmupql9z90008k8zr2y33x1yj",
        "dateAssigned": "2026-10-01T16:16:37.374Z",
        "dateReturned": null,
        "note": "Issued with the onboarding kit",
        "active": true,
        "asset": {
          "id": "cmupql9z90008k8zr2y33x1yj",
          "assetId": "IT-LAP-0001",
          "description": "MacBook Pro 14\" M3",
          "status": "ASSIGNED",
          "assetType": { "id": "cmupql9we0000k8zrtl7zsbar", "name": "Laptop", "code": "LAP" }
        }
      }
    ]
  }
}
```

`history[].active` is `true` while `dateReturned` is `null`, and `history[].asset.status` is the asset's *current* status rather than the status it had while held.

Errors: `404`.

### `PATCH /api/staff/[id]`

*Requires: `SUPERADMIN`.*

Partial update of `name`, `department`, `email`, `phone`, `role` and `password`.

Setting `password` resets it and revokes that account's existing sessions.
`SUPERADMIN` is rejected as a `role` value, and the single `SUPERADMIN` account
cannot be edited through this route (`403`).

```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/staff/<id> \
  -H 'content-type: application/json' \
  -d '{"phone":"+351 999 000 111"}'
```

Errors: `400`, `404`, `409` duplicate `email`.

### `DELETE /api/staff/[id]`

*Requires: `SUPERADMIN`.*

Refused with `409` while the person still holds assets, and also when they appear in assignment history (history is never deleted, and `Assignment.staffId` is a restricting foreign key).

```bash
curl -b cookies.txt -X DELETE http://localhost:3000/api/staff/<id>
```

```json
{ "data": { "id": "cmupqwvrp0004djzrs4d6mllo", "deleted": true } }
```

### `POST /api/staff/[id]/resend-invite`

*Requires: `SUPERADMIN`.*

Re-issues the invite for an account. A fresh temporary password is generated,
emailed to the member, and **any previous password stops working**: the hash is
replaced and `sessionVersion` is bumped, so a session already signed in is
revoked and the forced-change flag is re-armed. The temporary password is never
in the response — it exists only in the email.

Note this does not require the account to have been password-less: it overwrites
whatever password was there, which is the point of a resend.

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/staff/<id>/resend-invite
```

```json
{ "data": { "delivered": true, "skipped": false } }
```

`skipped` is `true` when no mail provider is configured, in which case the
temporary password has been set but not sent.

Errors: `404` unknown staff, `403` the target is the superadmin.

---

## Audit trail

*Requires: `SUPERADMIN`.*

Every meaningful action is queued to BullMQ and written to an append-only
`AuditLog` table by a separate worker (the `worker` service in
`docker-compose.yml`, or `pnpm worker:audit`), so the response is never held up by
audit storage. Each row carries a snapshot of who acted (id, name, email, role at
the time), where they acted from (client IP, user agent, route), a human-readable
summary, and a field-level `changes` diff for updates.

Actions taken through the UI are recorded exactly like API calls. They carry
`route` as `action:<name>` (e.g. `action:login`, `action:createAsset`) because a
Server Action has no HTTP path of its own.

```bash
curl -b cookies.txt 'http://localhost:3000/api/audit-logs?pageSize=5'
```

```json
{
  "data": [
    {
      "id": "cmupwhrhg0003mizrua1m4guk",
      "eventId": "84d19b7f-7fa1-4c08-a5a6-36dbac114303",
      "action": "ASSET_UPDATED",
      "entityType": "ASSET",
      "entityId": "cmupwhq7a0002mizrp6smp9aa",
      "summary": "Updated asset IT-DCK-0001 (description)",
      "changes": {
        "description": { "from": "WD19TB Thunderbolt dock", "to": "WD19TB dock (rev 2)" }
      },
      "metadata": { "assetId": "IT-DCK-0001" },
      "actor": {
        "id": "cmupql9yk0004k8zr5tncye2w",
        "name": "Ana Ribeiro",
        "email": "ana.ribeiro@example.com",
        "role": "SUPERADMIN",
        "exists": true
      },
      "ipAddress": "203.0.113.24",
      "userAgent": "Mozilla/5.0",
      "route": "PATCH /api/assets/IT-DCK-0001",
      "occurredAt": "2026-10-01T18:52:11.404Z",
      "createdAt": "2026-10-01T18:52:11.612Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 5,
    "total": 42,
    "totalPages": 9,
    "actions": { "ASSET_UPDATED": 12, "ASSIGNMENT_CREATED": 9, "LOGIN_SUCCEEDED": 8 },
    "worker": {
      "workerRunning": true,
      "lastSeenAt": "2026-10-01T18:52:10.902Z",
      "waiting": 0,
      "active": 0,
      "failed": 0,
      "delayed": 0
    }
  }
}
```

| Field        | Notes                                                                   |
| ------------ | ----------------------------------------------------------------------- |
| `eventId`    | Producer-generated UUID, also the BullMQ job id; makes replays idempotent |
| `occurredAt` | When the action happened                                                 |
| `createdAt`  | When the worker persisted the row (can lag behind during an outage)      |
| `changes`    | Field-level `{ from, to }` diff; `null` when nothing changed             |
| `actor.exists` | `false` once the account has been deleted (the FK is `SET NULL`)       |

### Filters

| Query          | Type   | Notes                                                       |
| -------------- | ------ | ----------------------------------------------------------- |
| `action`       | string | Exact action name, e.g. `ASSIGNMENT_RETURNED` (invalid → 400) |
| `entityType`   | string | `SESSION`, `ASSET`, `ASSET_TYPE`, `STAFF`, `ASSIGNMENT`, `PERMISSION` |
| `entityId`     | string | Database id of the affected row                              |
| `q`            | string | Case-insensitive search over summary, actor name and email  |
| `from` / `to`  | ISO-8601| Bounds on `occurredAt` (with offset, e.g. `2026-10-01T00:00:00Z`) |
| `page` / `pageSize` | number | Standard pagination                                    |

`meta.actions` always carries per-action totals for the whole table, so a UI can
build a filter bar from one request.

### Worker health (`meta.worker`)

The trail is written by a separate process, so an empty `data` array has two very
different causes: nothing has happened, or events are queued and nothing is
draining them. `meta.worker` distinguishes them.

| Field           | Notes                                                                  |
| --------------- | ---------------------------------------------------------------------- |
| `workerRunning` | A heartbeat stamp exists and is younger than 45s                       |
| `lastSeenAt`    | When the worker last beat; `null` if it has never run                   |
| `waiting`       | Events queued but not yet written — **non-zero with no worker means the trail is behind** |
| `active`        | Events being written right now                                         |
| `delayed`       | Events waiting on a retry backoff                                      |
| `failed`        | Events that exhausted all 5 attempts. These are **written off** and need an operator; restarting the worker does not recover them |

The worker stamps a heartbeat key every 10s, and clears it on a planned shutdown so
a deploy is not reported as a failure. If Redis is unreachable the whole object
falls back to zeros with `workerRunning: false` rather than the request failing.

> Note: if `workerRunning` is `false` and `waiting` is `0`, nothing is missing yet —
> but the next action taken will queue with nobody to write it.

### Recorded actions

| Group       | Actions                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| Sessions    | `LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGED`                              |
| Assets      | `ASSET_CREATED`, `ASSET_UPDATED`, `ASSET_RETIRED`, `ASSET_IMAGE_UPLOADED`, `ASSET_IMAGE_REMOVED` |
| Asset types | `ASSET_TYPE_CREATED`, `ASSET_TYPE_UPDATED`                                                   |
| Staff       | `STAFF_CREATED`, `STAFF_UPDATED`, `STAFF_ROLE_CHANGED`, `STAFF_PASSWORD_RESET`, `STAFF_DELETED` |
| Assignments | `ASSIGNMENT_CREATED`, `ASSIGNMENT_RETURNED`                                                  |
| Security    | `AUTHORIZATION_DENIED` (a `403`, naming the account and the permission it wanted), `ASSET_PASSWORD_SET` (`source` of `generated`/`manual`), `ASSET_PASSWORD_REVEALED` (`outcome` of `revealed`/`unreadable`), `ASSET_PASSWORD_CLEARED` |
| Departments  | `DEPARTMENT_CREATED`, `DEPARTMENT_RENAMED`, `DEPARTMENT_DELETED`                              |

Guarantees and limits:

- **Append-only.** Database triggers reject `UPDATE` and `DELETE` on `"AuditLog"`; the one exception is the foreign key's `ON DELETE SET NULL` unlink, so a deleted account still leaves a readable row.
- **Idempotent.** A replayed job upserts on `eventId` instead of inserting.
- **Retried.** 5 attempts with exponential backoff (2s → 32s) if the worker or database is briefly unavailable.
- **No secrets.** Passwords, tokens and secrets are replaced with `[redacted]` before an event is queued. Device-password events never carry the value at all — the password lives in an encrypted column, and the rows record only that it changed, when, and by whom.
- **Fail-open.** If Redis is down the API keeps working and the enqueue is bounded at 1s, after which a circuit breaker pauses auditing for 30s. Events during that window are lost — availability of the API wins over completeness of the trail.
- **Observable.** A worker that is down does not break anything, which is what makes it easy to miss. `/audit` shows a banner with the number of queued events, and `meta.worker` above is the machine-readable form of the same signal.

---

## Assignments

### `POST /api/assignments`

*Requires: `ASSIGNER`+ with target rules.*

| Field    | Type   | Required | Notes                                                |
| -------- | ------ | -------- | ---------------------------------------------------- |
| `assetId`| string | yes      | human id (`IT-LAP-0001`) or database id              |
| `staffId`| string | yes      | staff id                                             |
| `note`   | string | no       | ≤ 500 chars; `""` stored as `null`                   |

Rules, enforced in one transaction:

- the asset must exist and be `AVAILABLE` (else `422`)
- the staff member must exist (else `404`)
- an asset can have at most one active assignment — the partial unique index `Assignment_one_active_per_asset` (`WHERE "dateReturned" IS NULL`) makes this true even under concurrent requests; a violation is returned as `409`
- the asset status flips to `ASSIGNED`

Who may be handed the asset:

- an `ASSIGNER` may only target `USER` or another `ASSIGNER`, never themselves and never `ADMIN`/`SUPERADMIN` (`403`)
- an `ADMIN` or `SUPERADMIN` may target anybody, including themselves

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/assignments \
  -H 'content-type: application/json' \
  -d '{"assetId":"IT-DCK-0001","staffId":"cmupqwvrp0004djzrs4d6mllo","note":"loan for workshop"}'
```

```json
{
  "data": {
    "id": "cmupqww2a0006djzrl7h1mohx",
    "assetId": "cmupqs61k0003dozreom3pwab",
    "dateAssigned": "2026-10-01T16:25:39.154Z",
    "dateReturned": null,
    "note": "loan for workshop",
    "active": true,
    "asset": {
      "id": "cmupqs61k0003dozreom3pwab",
      "assetId": "IT-DCK-0001",
      "description": "WD19TB Thunderbolt dock",
      "status": "ASSIGNED"
    },
    "staff": {
      "id": "cmupqwvrp0004djzrs4d6mllo",
      "name": "Diogo Alves",
      "department": "IT",
      "email": "diogo.alves@example.com",
      "phone": null,
      "role": "USER"
    }
  }
}
```

Errors: `400`, `404`, `409` (already assigned), `422` (asset not `AVAILABLE`).

### `POST /api/assignments/[id]/return`

*Requires: `ASSIGNER`+.*

Stamps `dateReturned`, records `returnedBy` ("return accepted by" — always the authenticated actor, never client input) and puts the asset back to `AVAILABLE`. Rows are never deleted. Returning an already-returned assignment is `422`.

The body is optional. When present it may carry `returnNote` (condition description at handover, up to 500 characters). The return *photo* is a UI-only concern — the app's sheet uploads it as a `File`; this JSON endpoint does not accept one.

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/assignments/cmupqww2a0006djzrl7h1mohx/return

curl -b cookies.txt -X POST http://localhost:3000/api/assignments/cmupqww2a0006djzrl7h1mohx/return \
  -H 'Content-Type: application/json' \
  -d '{"returnNote": "Scratched lid; charger included"}'
```

```json
{
  "data": {
    "id": "cmupqww2a0006djzrl7h1mohx",
    "assetId": "cmupqs61k0003dozreom3pwab",
    "dateAssigned": "2026-10-01T16:25:39.154Z",
    "dateReturned": "2026-10-01T16:25:42.105Z",
    "note": "loan for workshop",
    "active": false,
    "asset": {
      "id": "cmupqs61k0003dozreom3pwab",
      "assetId": "IT-DCK-0001",
      "description": "WD19TB Thunderbolt dock",
      "status": "AVAILABLE"
    },
    "staff": {
      "id": "cmupqwvrp0004djzrs4d6mllo",
      "name": "Diogo Alves",
      "department": "IT",
      "email": "diogo.alves@example.com",
      "phone": null,
      "role": "USER"
    },
    "returnNote": "Scratched lid; charger included",
    "returnImageKey": null,
    "returnedBy": {
      "id": "cmupqz1rb0008djzr9hh7n4x2k",
      "name": "Ada Okafor",
      "department": "IT"
    }
  }
}
```

Errors: `404`, `422` (already returned), `400` (invalid JSON body or `returnNote` over 500 characters).

### `GET /api/assignments`

*Requires: Signed in.*

| Query param | Type   | Notes                                                       |
| ----------- | ------ | ----------------------------------------------------------- |
| `assetId`   | string | human id or database id                                     |
| `staffId`   | string | staff id                                                    |
| `active`    | `true`/`false` | `true` → only `dateReturned IS NULL`                |

```bash
curl -b cookies.txt 'http://localhost:3000/api/assignments?active=true&staffId=cmupql9yk0004k8zr5tncye2w'
```

```json
{
  "data": [
    {
      "id": "seed-assignment",
      "assetId": "cmupql9z90008k8zr2y33x1yj",
      "dateAssigned": "2026-10-01T16:16:37.361Z",
      "dateReturned": null,
      "note": "Issued with the onboarding kit",
      "active": true,
      "asset": { "id": "cmupql9z90008k8zr2y33x1yj", "assetId": "IT-LAP-0001", "description": "MacBook Pro 14\" M3", "status": "ASSIGNED" },
      "staff": { "id": "cmupql9yk0004k8zr5tncye2w", "name": "Ana Ribeiro", "department": "IT", "email": "ana.ribeiro@example.com", "phone": "+351 912 000 111" }
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

---

## Configuration

| Variable                        | Purpose                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`                  | Postgres connection string                                     |
| `APP_URL`                       | Base URL encoded in the QR code                                |
| `MINIO_ENDPOINT`                | Endpoint the API talks to (may be an internal hostname)       |
| `MINIO_PUBLIC_ENDPOINT`         | Optional endpoint used **only** for presigned URLs            |
| `MINIO_ACCESS_KEY` / `_SECRET_KEY` | S3 credentials                                             |
| `MINIO_BUCKET`                  | Private bucket, created lazily (default `asset-images`)        |
| `MINIO_PRESIGN_EXPIRY_SECONDS`  | Presigned URL lifetime (default `3600`)                        |
| `SESSION_SECRET`                | HS256 session-cookie signing key, ≥ 32 chars                  |
| `REDIS_URL`                     | Audit queue (default `redis://localhost:6379`)                |
| `AUDIT_REDIS_PREFIX`            | Optional key namespace, so several environments can share one Redis |

### A note on the `xlsx` dependency

Spreadsheet import reads `.xlsx` through SheetJS, and it is deliberately **not**
the version npm serves:

```json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

The copy on the npm registry is stuck at `0.18.5` and carries known
high-severity prototype-pollution advisories with no fix published there —
SheetJS states the registry is out of date and that their CDN is authoritative
for the fixed releases (resolved in `0.19.3`). Installing the tarball through
the package manager rather than a runtime `<script>` keeps the library inside
the bundle and integrity-pinned in `pnpm-lock.yaml`, with no CDN dependency at
run time.

To upgrade, install a newer tarball from `cdn.sheetjs.com`. SheetJS also
recommends *vendoring* the tarball into the repo (they publish
`vendor/` instructions) to decouple installs from their infrastructure; that is
not done here yet, so `pnpm install` needs `cdn.sheetjs.com` reachable.

The library is only ever reached through a dynamic import behind
`features/assets/serial-import-xlsx.ts`, and CSV is parsed by hand without it,
so a CSV-only import never downloads it at all.

Everything is validated with Zod in `src/lib/env.ts`, so the process fails fast with a readable message when a variable is missing.