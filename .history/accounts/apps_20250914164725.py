from django.apps import AppConfig


class AccountsConfig(AppConfig):
    
    name = 'accounts'
    ver
    
    
    def ready(self):
        import accounts.signals
