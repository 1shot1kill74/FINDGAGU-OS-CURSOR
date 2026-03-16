insert into color_chips (color_type, color_name, display_order)
select
  'Standard',
  '블랙',
  coalesce(
    (select max(display_order) + 1 from color_chips where color_type = 'Standard'),
    1
  )
where not exists (
  select 1
  from color_chips
  where color_type = 'Standard'
    and color_name = '블랙'
);
