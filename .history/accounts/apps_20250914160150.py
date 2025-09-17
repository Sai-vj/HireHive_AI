from django.apps import AppConfig
class AccountsConfig(AppConfig):
    default_au
    name = 'accounts'
    def ready(self):
        from . import signals
