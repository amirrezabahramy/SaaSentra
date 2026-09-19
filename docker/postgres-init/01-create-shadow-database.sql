SELECT 'CREATE DATABASE saas_shadow'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'saas_shadow'
)\gexec
