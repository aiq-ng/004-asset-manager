-- Enforce "at most one SUPERADMIN" in the database rather than in application
-- code.
--
-- Everything upstream of this — the CLI refusing to run twice, the setup page
-- checking before it renders, the Server Action re-checking before it writes —
-- is a check followed by an insert. None of them are atomic with each other, so
-- two requests that both observe "no superadmin" can both go on to create one.
-- That is reachable from a browser: the setup form is open on a fresh install and
-- a second tab, or a double submit, does exactly that.
--
-- A partial unique index closes the window at the only layer that can. It cannot
-- be raced, and it covers the CLI as well as the web form without either of them
-- having to care. Prisma has no schema syntax for a partial index, so it is
-- created here and left unmanaged: `prisma migrate diff` will propose dropping
-- it, and that proposal should be declined.
--
-- The existing plain index on `role` is left in place. This one is on
-- `(role) WHERE role = 'SUPERADMIN'`, which is a different access pattern —
-- looking up "is there a superadmin?" — and the planner uses both.
--
-- A database that already holds two superadmins would fail to apply this. That
-- is the correct outcome rather than a problem to work around: the state is one
-- the application should never have allowed, and resolving it is a deliberate
-- decision about which account keeps the role.
CREATE UNIQUE INDEX "Staff_one_superadmin"
    ON "Staff" (role)
    WHERE role = 'SUPERADMIN';
