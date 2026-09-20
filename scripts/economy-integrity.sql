begin transaction isolation level repeatable read read only;
with stock as (
  select item_id,sum(quantity) quantity from (
    select item_id,quantity::numeric from private.item_stacks
    union all select item_id,1::numeric from private.item_instances
    union all select item_id,quantity::numeric from private.market_listings where quantity>0
  ) entries group by item_id
), sale_totals as (
  select listing_id,sum(quantity) quantity,sum(fee) fee from private.market_sales where listing_id is not null group by listing_id
), expected_history as (
  select id sale_id,item_id,sold_at,
    sum(quantity) over(partition by item_id order by sold_at,id rows unbounded preceding) quantity_total,
    sum(gross) over(partition by item_id order by sold_at,id rows unbounded preceding) gross_total
  from private.market_sales
), failures as (
  select 'circulation' check_name,count(*) violations from private.item_definitions d
    left join private.item_circulation c on c.item_id=d.id left join stock s on s.item_id=d.id
    where c.total is distinct from coalesce(s.quantity,0)
  union all select 'unique_equipment',count(*) from private.item_instances i
    join private.market_listings l on l.original_entry_id=i.id and l.entry_type='instance' and l.quantity>0
  union all select 'escrow_item_type',count(*) from private.market_listings l join private.item_definitions d on d.id=l.item_id
    where (l.entry_type='stack') is distinct from d.stackable
  union all select 'listing_conservation',count(*) from private.market_listings
    where initial_quantity::numeric<>quantity::numeric+sold_quantity+returned_quantity
  union all select 'cumulative_fees',count(*) from private.market_listings
    where fee_paid<>floor(sold_quantity::numeric*unit_price*fee_bps/10000)
  union all select 'sale_receipts',count(*) from private.market_listings l left join sale_totals s on s.listing_id=l.id
    where l.sold_quantity<>coalesce(s.quantity,0) or l.fee_paid<>coalesce(s.fee,0)
  union all select 'market_value_projection',count(*) from expected_history e full join private.item_market_totals h using(sale_id)
    where (e.item_id,e.sold_at,e.quantity_total,e.gross_total) is distinct from (h.item_id,h.sold_at,h.quantity_total,h.gross_total)
  union all select 'balances',count(*) from public.characters
    where gold_coins<0 or bank_gold_coins<0 or gold_coins>9007199254740991 or bank_gold_coins>9007199254740991
)
select jsonb_object_agg(check_name,violations) from failures;
rollback;
