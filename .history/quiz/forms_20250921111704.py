from django import forms
from  resumes.models import R

class ResumeForm(forms.ModelForm):
    class Meta:
        model = Resume
        fields = ['name', 'email', 'phone', 'file']
