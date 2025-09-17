from django.apps import AppConfig
class AccountsConfig(AppConfig):
    default_auto_field
    name = 'accounts'
    def ready(self):
        from . import signals
