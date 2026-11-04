-- Hosted projects can grant anon privileges through ALTER DEFAULT PRIVILEGES.
-- RLS already denies anonymous rows; remove the table privileges as well.
revoke all on public.battle_archive from public,anon;
