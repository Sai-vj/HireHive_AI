from django.apps import AppConfig
class AccountsConfig(AppConfig):
    default_auto_field='django.db.models.BigAuto'
    name = 'accounts'
    def ready(self):
        from . import signals
