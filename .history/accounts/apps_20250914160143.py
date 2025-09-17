from django.apps import AppConfig
class AccountsConfig(AppConfig):
    de
    name = 'accounts'
    def ready(self):
        from . import signals
