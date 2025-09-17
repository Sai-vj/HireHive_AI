from django.apps import AppConfig
class AccountsConfig(AppConfig):
    default_auto
    name = 'accounts'
    def ready(self):
        from . import signals
