from django import forms
from .models import Resum

class ResumeForm(forms.ModelForm):
    class Meta:
        model = Resume
        fields = ['name', 'email', 'phone', 'file']
