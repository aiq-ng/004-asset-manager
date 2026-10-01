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
| `q`          | string  | case-insensitive match on `assetId`, `serialNumber`, `description` |
| `type`       | string  | asset type `code` (case-insensitive) or `id`                     |
| `status`     | enum    | `AVAILABLE` \| `ASSIGNED` \| `UNDER_REPAIR` \| `RETIRED`         |
| `assignedTo` | string  | staff id — only assets currently assigned to that person         |

```bash
curl -b cookies.txt 'http://localhost:3000/api/assets?page=1&pageSize=20&q=thinkpad&type=LAP&status=AVAILABLE'
```

```json
{
  "data": [
    {
      "id": "cmupql9zt000ek8zrqe8iglid",
      "assetId": "IT-LAP-0003",
      "description": "ThinkPad T14 (spare pool)",
      "unit": 1,
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
| `description` | string | yes      | ≤ 500 chars                                                      |
| `unit`        | int ≥1  | no       | default `1`; bulk count (e.g. `24` chairs)                        |
| `serialNumber`| string | no       | trimmed; `""`/whitespace becomes `null`; unique when present     |
| `status`      | enum   | no       | `AVAILABLE` (default), `UNDER_REPAIR`, `RETIRED`                  |

`assetId` is generated server-side as `IT-{TYPE_CODE}-{4 digits}` from a per-type counter that is incremented inside the creating transaction, so concurrent requests can never collide and numbers are never reused.

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/assets \
  -H 'content-type: application/json' \
  -d '{"assetType":"DCK","description":"WD19TB Thunderbolt dock","unit":1,"serialNumber":"SN-DCK-0001"}'
```

```json
{
  "data": {
    "id": "cmupqs61k0003dozreom3pwab",
    "assetId": "IT-DCK-0001",
    "description": "WD19TB Thunderbolt dock",
    "unit": 1,
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
    "unit": 1,
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

Accepts `description`, `unit`, `serialNumber`, `status`. `assetId` is immutable. `status: "ASSIGNED"` is rejected — status only flips through the assignments endpoints (the enum itself rejects it with `400`, and `422` if the asset is currently checked out).

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
    "unit": 1,
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

Errors: `400`, `404`, `409` duplicate `serialNumber`, `422` status change while assigned.

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
    "unit": 1,
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
    "unit": 1,
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
        "status": "ASSIGNED",
        "unit": 1
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
          "unit": 1,
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

---

## Audit trail

*Requires: `SUPERADMIN`.*

Every meaningful action is queued to BullMQ and written to an append-only
`AuditLog` table by a separate worker (`pnpm worker:audit`), so the response is
never held up by audit storage. Each row carries a snapshot of who acted (id,
name, email, role at the time), where they acted from (client IP, user agent,
route), a human-readable summary, and a field-level `changes` diff for updates.

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
      "summary": "Updated asset IT-DCK-0001 (description, unit)",
      "changes": {
        "description": { "from": "WD19TB Thunderbolt dock", "to": "WD19TB dock (rev 2)" },
        "unit": { "from": 1, "to": 2 }
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
    "actions": { "ASSET_UPDATED": 12, "ASSIGNMENT_CREATED": 9, "LOGIN_SUCCEEDED": 8 }
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

### Recorded actions

| Group       | Actions                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| Sessions    | `LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGED`                              |
| Assets      | `ASSET_CREATED`, `ASSET_UPDATED`, `ASSET_RETIRED`, `ASSET_IMAGE_UPLOADED`, `ASSET_IMAGE_REMOVED` |
| Asset types | `ASSET_TYPE_CREATED`, `ASSET_TYPE_UPDATED`                                                   |
| Staff       | `STAFF_CREATED`, `STAFF_UPDATED`, `STAFF_ROLE_CHANGED`, `STAFF_PASSWORD_RESET`, `STAFF_DELETED` |
| Assignments | `ASSIGNMENT_CREATED`, `ASSIGNMENT_RETURNED`                                                  |
| Security    | `AUTHORIZATION_DENIED` (a `403`, naming the account and the permission it wanted)            |

Guarantees and limits:

- **Append-only.** Database triggers reject `UPDATE` and `DELETE` on `"AuditLog"`; the one exception is the foreign key's `ON DELETE SET NULL` unlink, so a deleted account still leaves a readable row.
- **Idempotent.** A replayed job upserts on `eventId` instead of inserting.
- **Retried.** 5 attempts with exponential backoff (2s → 32s) if the worker or database is briefly unavailable.
- **No secrets.** Passwords, tokens and secrets are replaced with `[redacted]` before an event is queued.
- **Fail-open.** If Redis is down the API keeps working and the enqueue is bounded at 1s, after which a circuit breaker pauses auditing for 30s. Events during that window are lost — availability of the API wins over completeness of the trail.

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

Stamps `dateReturned` and puts the asset back to `AVAILABLE`. Rows are never deleted. Returning an already-returned assignment is `422`.

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/assignments/cmupqww2a0006djzrl7h1mohx/return
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
    }
  }
}
```

Errors: `404`, `422` (already returned).

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

Everything is validated with Zod in `src/lib/env.ts`, so the process fails fast with a readable message when a variable is missing.