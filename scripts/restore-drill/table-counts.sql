-- P1-9: one line per application table, "<table><TAB><rows>", sorted. Taken by scripts/backup-set.sh after the dump
-- and by scripts/restore-drill.sh after the restore (before the backend starts and migrates); the two must match.
select c.relname,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;
