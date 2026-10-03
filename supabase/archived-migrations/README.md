# Archived migrations

These SQL files are retained for audit and recovery but are not part of the active Supabase migration sequence.

The linked project schema was pulled into `supabase/schemas` and is the canonical baseline for this branch. Historical migrations that duplicate that live schema or create the superseded `finance_documents` ledger were moved here so they cannot be replayed accidentally.

Remote migration versions whose original SQL was absent from all fetched Git refs have comment-only markers in `supabase/migrations`. Those versions are already recorded as applied remotely. The markers exist only to make the local migration ledger align with the live project; they do not reconstruct a fresh database. Use the declarative schema baseline when bootstrapping a new project.