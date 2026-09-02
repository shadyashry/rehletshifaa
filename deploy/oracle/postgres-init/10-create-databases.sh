#!/bin/sh
set -eu

psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_db="$APP_DB_NAME" \
  --set=app_user="$APP_DB_USERNAME" \
  --set=app_password="$APP_DB_PASSWORD" \
  --set=keycloak_db="$KEYCLOAK_DB_NAME" \
  --set=keycloak_user="$KEYCLOAK_DB_USERNAME" \
  --set=keycloak_password="$KEYCLOAK_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user') \gexec

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'keycloak_user', :'keycloak_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'keycloak_user') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'app_db', :'app_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'app_db') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'keycloak_db', :'keycloak_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'keycloak_db') \gexec
SQL

