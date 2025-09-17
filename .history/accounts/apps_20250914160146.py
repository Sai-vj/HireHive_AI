from django.apps import AppConfig
class AccountsConfig(AppConfig):
    default
    name = 'accounts'
    def ready(self):
        from . import signals
