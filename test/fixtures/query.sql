SELECT u.id, COUNT(*) AS total
FROM users AS u
WHERE u.active = TRUE
GROUP BY u.id;
