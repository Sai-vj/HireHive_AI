from django.apps import AppConfig
class AccountsConfig(AppConfig):
    defa
    name = 'accounts'
    def ready(self):
        from . import signals
