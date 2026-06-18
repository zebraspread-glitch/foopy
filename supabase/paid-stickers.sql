-- ============================================================
-- Paid stickers (sold individually) — run in the Supabase SQL Editor
-- ============================================================
-- Model:
--   • Each paid sticker is its own cosmetics row: category 'sticker', slot NULL
--     (owned-only unlock — no equip state). Bought individually with Foopy
--     Tokens via the normal /api/cosmetics/purchase flow.
--   • sticker_cosmetics maps each paid sticker shortcode -> its cosmetic key.
--   • A trigger on feed_comments blocks a comment that uses a paid sticker the
--     author doesn't own (everyone can still SEE paid stickers — this only gates
--     SENDING them). Covers both feed comments and match-thread comments, which
--     share the feed_comments table.
--
-- The sticker names here MUST match PAID_STICKERS in app/lib/stickers.ts and the
-- PNG files in public/paidstickers/. These are EXAMPLES — edit the names/prices
-- to match your real stickers before running in production.
-- ============================================================

-- ── 1. Allow the new 'sticker' category ──────────────────────────────────────
alter table public.cosmetics drop constraint if exists cosmetics_category_check;
alter table public.cosmetics add constraint cosmetics_category_check
  check (category in ('profile','card','app','social','sticker'));

-- ── 2. Seed one cosmetic per paid sticker ────────────────────────────────────
insert into public.cosmetics (key, name, description, category, slot, token_price, asset, rarity, sort_order) values
  ('sticker_legend1', 'Legend 1', 'Unlock this sticker to use it in comments.', 'sticker', null, 120, null, 'rare', 60),
  ('sticker_legend2', 'Legend 2', 'Unlock this sticker to use it in comments.', 'sticker', null, 120, null, 'rare', 61),
  ('sticker_legend3', 'Legend 3', 'Unlock this sticker to use it in comments.', 'sticker', null, 150, null, 'epic', 62),
  ('sticker_legend4', 'Legend 4', 'Unlock this sticker to use it in comments.', 'sticker', null, 150, null, 'epic', 63),
  ('sticker_legend5', 'Legend 5', 'Unlock this sticker to use it in comments.', 'sticker', null, 250, null, 'legendary', 64)
on conflict (key) do nothing;

-- ── 3. Sticker -> cosmetic mapping (drives server-side enforcement) ───────────
create table if not exists public.sticker_cosmetics (
  sticker_name text primary key,
  cosmetic_key text not null references public.cosmetics(key) on delete cascade
);

alter table public.sticker_cosmetics enable row level security;
drop policy if exists "Sticker cosmetics are publicly readable" on public.sticker_cosmetics;
create policy "Sticker cosmetics are publicly readable"
  on public.sticker_cosmetics for select using (true);

insert into public.sticker_cosmetics (sticker_name, cosmetic_key) values
  ('legend1', 'sticker_legend1'),
  ('legend2', 'sticker_legend2'),
  ('legend3', 'sticker_legend3'),
  ('legend4', 'sticker_legend4'),
  ('legend5', 'sticker_legend5')
on conflict (sticker_name) do update set cosmetic_key = excluded.cosmetic_key;

-- ── 4. Enforcement trigger ───────────────────────────────────────────────────
-- Rejects an insert/update whose body contains a paid :sticker the author
-- doesn't own. security definer so it can read user_cosmetics under RLS.
create or replace function public.enforce_paid_stickers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tok        text;
  need_key   text;
  owns       boolean;
begin
  if NEW.body is null then
    return NEW;
  end if;

  for tok in
    select distinct m[1]
    from regexp_matches(NEW.body, ':([a-zA-Z0-9_]+)', 'g') as m
  loop
    select cosmetic_key into need_key
    from public.sticker_cosmetics
    where sticker_name = tok;

    if need_key is not null then
      select exists (
        select 1
        from public.user_cosmetics uc
        join public.cosmetics c on c.id = uc.cosmetic_id
        where uc.user_id = NEW.user_id
          and c.key = need_key
      ) into owns;

      if not owns then
        raise exception 'You need to buy the :% sticker to use it', tok
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_paid_stickers on public.feed_comments;
create trigger trg_enforce_paid_stickers
  before insert or update on public.feed_comments
  for each row execute function public.enforce_paid_stickers();

-- ============================================================
-- Done. Free stickers are unaffected. To add another paid sticker: add its
-- cosmetics row, its sticker_cosmetics row, the PNG in public/paidstickers/,
-- and the entry in app/lib/stickers.ts — names must match across all four.
-- ============================================================
