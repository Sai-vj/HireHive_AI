#!/usr/bin/env bash
set -e

# wait for DB to be ready (simple loop)
host="$DATABASE_HOST"
port="$DATABASE_PORT"

if [ -n "$host" ]; then
  echo "Waiting for $host:$port ..."
  while ! nc -z $host $port; do
    sleep 0.2
  done
fi

# collect static (optional in dev)
if [ "$DJANGO_COLLECTSTATIC" = "1" ]; then
  echo "Collecting static files..."
  python manage.py collectstatic --noinput
fi

# apply migrations
echo "Applying database migrations..."
python manage.py migrate --noinput

# create a superuser automatically if env variables provided
if [ -n "$DJANGO_SUPERUSER_EMAIL" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  echo "Create superuser (if not exists)..."
  python manage.py shell -c "from django.contrib.auth import get_user_model; User=get_user_model(); \
    User.objects.filter(email='$DJANGO_SUPERUSER_EMAIL').exists() or User.objects.create_superuser(username='$DJANGO_SUPERUSER_USERNAME' or '$DJANGO_SUPERUSER_EMAIL', email='$DJANGO_SUPERUSER_EMAIL', password='$DJANGO_SUPERUSER_PASSWORD')"
fi

# run command
exec "$@"
