UPDATE transactions
SET is_office_sale = TRUE, delivery_status = 'Completed'
WHERE (customer_name ILIKE '%Laku Pabrik%' OR customer_name ILIKE '%Laku Kantor%') AND delivery_status != 'Completed';
