#!/bin/sh
set -eu

echo "Creating application and Maxwell users with appropriate grants..."

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
-- Create application user
CREATE USER IF NOT EXISTS '${MYSQL_APP_USER}'@'%' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
GRANT ALL PRIVILEGES ON ${MYSQL_DATABASE}.* TO '${MYSQL_APP_USER}'@'%';

-- Create Maxwell CDC user with replication permissions
CREATE USER IF NOT EXISTS '${MYSQL_MAXWELL_USER}'@'%' IDENTIFIED BY '${MYSQL_MAXWELL_PASSWORD}';
GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO '${MYSQL_MAXWELL_USER}'@'%';
GRANT ALL PRIVILEGES ON maxwell.* TO '${MYSQL_MAXWELL_USER}'@'%';

FLUSH PRIVILEGES;

SELECT user, host FROM mysql.user WHERE user IN ('${MYSQL_APP_USER}', '${MYSQL_MAXWELL_USER}');
SQL

echo "Users created successfully"


