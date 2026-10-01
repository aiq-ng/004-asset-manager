-- Allow staff accounts with audit history to be deleted.
--
-- `AuditLog.actorId` has ON DELETE SET NULL, so removing a staff member makes
-- PostgreSQL rewrite the referencing audit rows to drop the link. The original
-- trigger rejected every UPDATE, which meant such an account could never be
-- deleted and `DELETE /api/staff/[id]` returned a confusing database error.
--
-- This version permits exactly one kind of UPDATE - nulling actorId because the
-- actor was deleted, with nothing else about the row changing - and still
-- rejects any attempt to rewrite the audit content itself. The snapshot columns
-- (actorName, actorEmail, actorRole) are deliberately left untouched, so the
-- entry still reads correctly after the account is gone.
CREATE OR REPLACE FUNCTION "AuditLog_append_only"() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW."actorId" IS NULL
     AND OLD."actorId" IS NOT NULL
     AND (to_jsonb(NEW) - 'actorId') = (to_jsonb(OLD) - 'actorId') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'AuditLog is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;